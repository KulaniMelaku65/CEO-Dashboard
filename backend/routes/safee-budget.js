const router      = require('express').Router();
const requireAuth = require('../middleware/auth');
const { isBcConfigured } = require('../services/bc-client');
const { buildOverview, buildYearDetail, buildCommitmentDrilldown, BUDGET_YEARS } = require('../services/safee-budget');

// selMonths comes from the frontend's PeriodTree as a comma-separated list of 0-based
// month indices (its own selMonths array, same shape Financial Performance uses) —
// e.g. "0,1,2" for the first quarter. Empty/absent means every month.
function parseSelMonths(req) {
  if (!req.query.months) return [];
  return String(req.query.months).split(',').map(s => parseInt(s, 10)).filter(n => Number.isInteger(n) && n >= 0);
}

// GET /api/safee-budget/overview?months=0,1,2
router.get('/overview', requireAuth, async (req, res) => {
  try {
    if (!isBcConfigured()) return res.status(503).json({ error: 'Business Central is not configured.' });
    const data = await buildOverview({ selMonths: parseSelMonths(req) });
    res.json(data);
  } catch (e) {
    console.error('[safee-budget/overview]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/safee-budget/year?budgetName=10.3&months=0,1,2&team=PROG-TEAM&intervention=SAF-I001
// Full detail for one budget year — powers every tab besides Overview.
router.get('/year', requireAuth, async (req, res) => {
  try {
    if (!isBcConfigured()) return res.status(503).json({ error: 'Business Central is not configured.' });
    const budgetName = String(req.query.budgetName || '');
    if (!BUDGET_YEARS.some(y => y.budgetName === budgetName)) {
      return res.status(400).json({ error: 'Invalid or missing budgetName.' });
    }
    const data = await buildYearDetail({
      budgetName,
      selMonths: parseSelMonths(req),
      team: req.query.team || null,
      intervention: req.query.intervention || null,
    });
    res.json(data);
  } catch (e) {
    console.error('[safee-budget/year]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/safee-budget/drilldown?budgetName=10.3&catCode=556&lineCode=556.24&months=0,1,2&team=&intervention=
// The real BC entries (KFT_SAFEE_Budget Commitment rows) behind one line's Utilized
// figure — same click-a-number-to-see-the-ledger idea as /api/gl-drilldown, scoped to
// SAFEE's own data source instead of the GL.
router.get('/drilldown', requireAuth, async (req, res) => {
  try {
    if (!isBcConfigured()) return res.status(503).json({ error: 'Business Central is not configured.' });
    const budgetName = String(req.query.budgetName || '');
    if (!BUDGET_YEARS.some(y => y.budgetName === budgetName)) {
      return res.status(400).json({ error: 'Invalid or missing budgetName.' });
    }
    const data = await buildCommitmentDrilldown({
      budgetName,
      catCode: req.query.catCode || null,
      lineCode: req.query.lineCode || null,
      selMonths: parseSelMonths(req),
      team: req.query.team || null,
      intervention: req.query.intervention || null,
    });
    res.json(data);
  } catch (e) {
    console.error('[safee-budget/drilldown]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
