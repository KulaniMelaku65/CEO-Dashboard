const router      = require('express').Router();
const requireAuth = require('../middleware/auth');
const { bc, isBcConfigured } = require('../services/bc-client');
const { buildDirectCashflow, buildBankCollections, refreshBcStatic } = require('../services/snapshot-builder');

// GET /api/cashflow?year=2026&month=7  (month optional, 1-12)
// Returns the Direct Method Cash Flow Statement (BC's own "CFS-REPORT" account
// schedule) for the requested period — year alone means that full calendar year
// (Jan 1 - Dec 31, capped at today), year+month means just that one month. Powers
// the Cashflow page's own Year/Month filter, computed fresh on demand rather than
// baked into the main snapshot (which only ever covers the current year to date).
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!isBcConfigured()) return res.status(503).json({ error: 'Business Central is not configured.' });

    const year = parseInt(req.query.year, 10);
    if (!year || year < 2000 || year > 2100) return res.status(400).json({ error: 'year is required (e.g. 2026).' });
    const month = req.query.month ? parseInt(req.query.month, 10) : null;
    if (month != null && (month < 1 || month > 12)) return res.status(400).json({ error: 'month must be 1-12.' });

    const today = new Date().toISOString().slice(0, 10);
    const pad = n => String(n).padStart(2, '0');
    let periodStart, periodEnd;
    if (month) {
      periodStart = `${year}-${pad(month)}-01`;
      const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this one
      periodEnd = `${year}-${pad(month)}-${pad(lastDay)}`;
    } else {
      periodStart = `${year}-01-01`;
      periodEnd = `${year}-12-31`;
    }
    // Never ask BC for postings past today — a future year/month has none anyway, and
    // capping here (rather than after the fetch) keeps the query itself cheap.
    if (periodEnd > today) periodEnd = today;
    if (periodStart > today) {
      return res.json({
        rows: [], asOf: periodEnd, periodStart, check: null,
        collections: { flows: { collections: 0 }, monthlyCollections: { labels: [], data: [] }, collectionsByBank: [] }
      });
    }

    // Every account (Income Statement + Balance Sheet) up to periodEnd — Beginning
    // Balance rows need everything before periodStart too, so this one fetch covers
    // both that and the period's own Net Change / Balance at Date rows.
    // Also re-pull the cash flow schedule + CoA so edits Finance makes to the schedule in
    // BC show up on the next page load, not only after a server restart. Runs alongside
    // the (much larger) GL fetch, so it adds no wall-clock time; on failure it keeps the
    // last loaded copy (see refreshBcStatic).
    const [glEntriesAll, collections] = await Promise.all([
      bc('KFT_GL_Entries', `?$filter=postingDate le ${periodEnd}`),
      buildBankCollections({ periodStart, periodEnd }),
      refreshBcStatic()
    ]);
    const statement = await buildDirectCashflow({ glEntriesAll, periodStart, periodEnd });
    res.json({ ...statement, collections });
  } catch (e) {
    console.error('[cashflow]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
