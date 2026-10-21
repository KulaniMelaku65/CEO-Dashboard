const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../middleware/auth');
const { syncSnapshot } = require('../services/snapshot-sync');

// This feature isn't a sidebar page (it's a panel on Organization Mapping), so it has no
// entry in frontend/src/lib/pages.js's PAGE_REGISTRY and never appears in the sidebar or
// the Admin page's main page-grant grid. It still reuses user_page_access as a plain
// permission flag — AdminUsers.jsx grants/revokes this one id via its own small toggle,
// same update endpoint as any other page. Admins always pass (same as every real page).
const FEATURE_ID = 'payroll-currency-corrections';
const requireFeatureAccess = (req, res, next) => {
  if (req.user.isAdmin) return next();
  const has = db.prepare('SELECT 1 FROM user_page_access WHERE user_id = ? AND page_id = ?')
    .get(req.user.id, FEATURE_ID);
  if (!has) return res.status(403).json({ error: 'You do not have access to payroll currency corrections.' });
  next();
};

// GET /api/payroll-currency-corrections — list all corrections
router.get('/', requireAuth, requireFeatureAccess, (_req, res) => {
  try {
    const rows = db.prepare(
      `SELECT voucher_no, employee_no, employee_name, correct_currency, note, created_by, created_at
       FROM payroll_currency_corrections ORDER BY created_at DESC`
    ).all();
    res.json(rows);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// POST /api/payroll-currency-corrections — add/replace a voucher's currency correction,
// then resync immediately (fast path — this only changes how an already-fetched voucher
// is interpreted, not anything Business Central itself returns).
// Body: { voucherNo, employeeNo, employeeName?, correctCurrency?, note? }
router.post('/', requireAuth, requireFeatureAccess, async (req, res) => {
  const { voucherNo, employeeNo, employeeName, correctCurrency, note } = req.body || {};
  if (!voucherNo || !employeeNo)
    return res.status(400).json({ error: 'voucherNo and employeeNo are required.' });
  try {
    const actor = req.user.name || req.user.username;
    db.prepare(
      `INSERT INTO payroll_currency_corrections (voucher_no, employee_no, employee_name, correct_currency, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(voucher_no) DO UPDATE SET
         employee_no      = excluded.employee_no,
         employee_name    = excluded.employee_name,
         correct_currency = excluded.correct_currency,
         note             = excluded.note,
         created_by       = excluded.created_by,
         created_at       = excluded.created_at`
    ).run(voucherNo, employeeNo, employeeName || null, (correctCurrency || 'ETB').toUpperCase(), note || null, actor);

    const summary = await syncSnapshot(undefined, { fast: true });
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[payroll-currency-corrections]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/payroll-currency-corrections/:voucherNo — remove a correction (the voucher
// goes back to whatever currency BC's own record shows on the next resync).
router.delete('/:voucherNo', requireAuth, requireFeatureAccess, async (req, res) => {
  try {
    db.prepare('DELETE FROM payroll_currency_corrections WHERE voucher_no = ?').run(req.params.voucherNo);
    const summary = await syncSnapshot(undefined, { fast: true });
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[payroll-currency-corrections]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
