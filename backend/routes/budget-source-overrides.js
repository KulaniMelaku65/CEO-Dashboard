const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../middleware/auth');
const { syncSnapshot } = require('../services/snapshot-sync');

const VALID_SOURCES = new Set(['KIFIYA', 'SAFEE']);

const logAudit = db.prepare(
  `INSERT INTO budget_source_override_audit (employee_no, employee_name, from_source, to_source, action, actor)
   VALUES (?, ?, ?, ?, ?, ?)`
);

// GET /api/budget-source-overrides — list all active overrides
router.get('/', requireAuth, (_req, res) => {
  try {
    const rows = db.prepare(
      'SELECT employee_no, employee_name, from_source, budget_source, updated_by, updated_at FROM budget_source_overrides ORDER BY updated_at DESC'
    ).all();
    res.json(rows);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// GET /api/budget-source-overrides/:employeeNo/history — every set/revert ever recorded
// for this employee, newest first.
router.get('/:employeeNo/history', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT employee_no, employee_name, from_source, to_source, action, actor, created_at
       FROM budget_source_override_audit WHERE employee_no = ? ORDER BY created_at DESC, id DESC`
    ).all(req.params.employeeNo);
    res.json(rows);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// POST /api/budget-source-overrides — set/replace an employee's budget source override
// (relabels ALL of that employee's payroll rows + pension to the chosen source — see
// snapshot-builder.js's budgetSourceOverrides handling), then resync immediately.
// Body: { employeeNo, employeeName?, fromSource?, budgetSource }
router.post('/', requireAuth, async (req, res) => {
  const { employeeNo, employeeName, fromSource, budgetSource } = req.body || {};
  if (!employeeNo || !budgetSource)
    return res.status(400).json({ error: 'employeeNo and budgetSource are required.' });
  if (!VALID_SOURCES.has(budgetSource))
    return res.status(400).json({ error: "budgetSource must be 'KIFIYA' or 'SAFEE'." });
  try {
    const actor = req.user.name || req.user.username;
    db.prepare(
      `INSERT INTO budget_source_overrides (employee_no, employee_name, from_source, budget_source, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(employee_no) DO UPDATE SET
         employee_name = excluded.employee_name,
         from_source   = excluded.from_source,
         budget_source = excluded.budget_source,
         updated_by    = excluded.updated_by,
         updated_at    = excluded.updated_at`
    ).run(employeeNo, employeeName || null, fromSource || null, budgetSource, actor);
    logAudit.run(employeeNo, employeeName || null, fromSource || null, budgetSource, 'set', actor);

    const summary = await syncSnapshot(undefined, { fast: true });
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[budget-source-overrides]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/budget-source-overrides/:employeeNo — clear an override (reverts to
// whichever book Business Central's own payroll rows actually belong to on next resync).
router.delete('/:employeeNo', requireAuth, async (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM budget_source_overrides WHERE employee_no = ?').get(req.params.employeeNo);
    db.prepare('DELETE FROM budget_source_overrides WHERE employee_no = ?').run(req.params.employeeNo);
    if (existing) {
      const actor = req.user.name || req.user.username;
      // Same reasoning as department_overrides' revert: existing.from_source is only
      // whatever this override replaced (possibly a prior override, not BC's real payroll
      // book), so log the destination honestly as "BC default" rather than a specific,
      // possibly-wrong source.
      logAudit.run(req.params.employeeNo, existing.employee_name, existing.budget_source, 'BC default', 'revert', actor);
    }
    const summary = await syncSnapshot(undefined, { fast: true });
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[budget-source-overrides]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
