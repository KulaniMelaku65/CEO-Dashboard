const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../middleware/auth');
const { syncSnapshot } = require('../services/snapshot-sync');

const logAudit = db.prepare(
  `INSERT INTO department_override_audit (employee_no, employee_name, from_section, to_section, action, actor)
   VALUES (?, ?, ?, ?, ?, ?)`
);

// GET /api/department-overrides — list all active overrides
router.get('/', requireAuth, (_req, res) => {
  try {
    const rows = db.prepare(
      'SELECT employee_no, employee_name, from_section, section_code, updated_by, updated_at FROM department_overrides ORDER BY updated_at DESC'
    ).all();
    res.json(rows);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// GET /api/department-overrides/:employeeNo/history — every set/revert ever recorded for
// this employee, newest first (what "click an override to see who changed what" reads).
router.get('/:employeeNo/history', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT employee_no, employee_name, from_section, to_section, action, actor, created_at
       FROM department_override_audit WHERE employee_no = ? ORDER BY created_at DESC, id DESC`
    ).all(req.params.employeeNo);
    res.json(rows);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// POST /api/department-overrides — set/replace an employee's section override, then
// resync immediately (same BC pull the manual refresh button triggers) so the change
// is reflected across the dashboard right away.
// Body: { employeeNo, employeeName?, fromSection?, sectionCode }
router.post('/', requireAuth, async (req, res) => {
  const { employeeNo, employeeName, fromSection, sectionCode } = req.body || {};
  if (!employeeNo || !sectionCode)
    return res.status(400).json({ error: 'employeeNo and sectionCode are required.' });
  try {
    const actor = req.user.name || req.user.username;
    db.prepare(
      `INSERT INTO department_overrides (employee_no, employee_name, from_section, section_code, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(employee_no) DO UPDATE SET
         employee_name = excluded.employee_name,
         from_section  = excluded.from_section,
         section_code  = excluded.section_code,
         updated_by    = excluded.updated_by,
         updated_at    = excluded.updated_at`
    ).run(employeeNo, employeeName || null, fromSection || null, sectionCode, actor);
    logAudit.run(employeeNo, employeeName || null, fromSection || null, sectionCode, 'set', actor);

    const summary = await syncSnapshot();
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[department-overrides]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/department-overrides/:employeeNo — clear an override (reverts to BC's own
// section on next resync, which this triggers immediately).
router.delete('/:employeeNo', requireAuth, async (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM department_overrides WHERE employee_no = ?').get(req.params.employeeNo);
    db.prepare('DELETE FROM department_overrides WHERE employee_no = ?').run(req.params.employeeNo);
    if (existing) {
      const actor = req.user.name || req.user.username;
      // A revert always lands on whatever Business Central itself reports on the next
      // sync — NOT existing.from_section. That field is only the section this override
      // replaced (possibly a prior override's target, after two or more reassignments in
      // a row), not BC's true value, which we don't have without re-querying BC. Logging
      // from_section here would claim a specific, frequently wrong destination.
      logAudit.run(req.params.employeeNo, existing.employee_name, existing.section_code, 'BC default', 'revert', actor);
    }
    const summary = await syncSnapshot();
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[department-overrides]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
