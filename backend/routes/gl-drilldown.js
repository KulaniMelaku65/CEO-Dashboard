const router      = require('express').Router();
const requireAuth = require('../middleware/auth');
const { bc, isBcConfigured } = require('../services/bc-client');

// GET /api/gl-drilldown?accounts=1011,1012&asOf=2026-07-31&label=Non-Current+Assets
// Returns the raw GL entries behind a figure shown on a finance page — same
// click-a-number-to-see-the-ledger behavior BC itself has. `accounts` is the comma-
// separated account number list the figure was built from (snapshot-builder.js now
// attaches one to every Balance Sheet row/section/grand-total for exactly this).
// Balance Sheet accounts are cumulative since inception, so this is every entry up to
// `asOf` (default: today), not just one period's activity — matching how the figure
// itself was computed. Fetched live from BC on each click rather than cached, since
// this is an on-demand, occasional action, not something rendered on every page load.
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!isBcConfigured()) return res.status(503).json({ error: 'Business Central is not configured.' });

    const accounts = String(req.query.accounts || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!accounts.length) return res.status(400).json({ error: 'accounts is required (comma-separated account numbers).' });

    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(req.query.asOf || '') ? req.query.asOf : new Date().toISOString().slice(0, 10);
    const acctSet = new Set(accounts);

    const [allEntries, glAccounts] = await Promise.all([
      bc('KFT_GL_Entries', `?$filter=incomeBalance eq 'Balance Sheet' and postingDate le ${asOf}`),
      bc('KFT_GL_Accounts').catch(() => [])
    ]);

    const nameByAcct = {};
    (glAccounts || []).forEach(a => { if (a.no) nameByAcct[String(a.no).trim()] = a.name || ''; });

    const entries = allEntries
      .filter(e => acctSet.has(String(e.accountNo)))
      .map(e => ({
        postingDate: e.postingDate,
        accountNo:   String(e.accountNo),
        accountName: nameByAcct[String(e.accountNo)] || '',
        description: e.description || '',
        documentNo:  e.documentNo || '',
        documentType: e.documentType || '',
        amount:      Number(e.amount) || 0
      }))
      .sort((a, b) => new Date(b.postingDate) - new Date(a.postingDate));

    const total = entries.reduce((s, e) => s + e.amount, 0);

    res.json({ accounts, asOf, total, count: entries.length, entries });
  } catch (e) {
    console.error('[gl-drilldown]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
