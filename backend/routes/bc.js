const router      = require('express').Router();
const { bc, isBcConfigured } = require('../services/bc-client');
const requireAuth = require('../middleware/auth');

// 10-minute in-memory cache for rarely-changing data
let _namesCache = null, _namesCacheAt = 0;
let _coaCache   = null, _coaCacheAt   = 0;
let _dimCache   = null, _dimCacheAt   = 0;
const TTL = 10 * 60 * 1000;

function safeName(name) {
  // Prevent OData injection — budget names are short alphanumeric codes
  if (!name || name.length > 20) return null;
  return name.replace(/'/g, "''"); // OData single-quote escape
}

// GET /api/bc/budget-names — from GetBudgetName table (fast, includes descriptions)
router.get('/budget-names', requireAuth, async (_req, res) => {
  if (!isBcConfigured())
    return res.status(503).json({ error: 'BC not configured.' });
  try {
    const now = Date.now();
    if (_namesCache && now - _namesCacheAt < TTL)
      return res.json(_namesCache);

    const all   = await bc('GetBudgetName');
    const names = all
      .filter(b => !b.Blocked)
      .map(b => ({ name: b.Name, description: b.Description || '' }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    _namesCache    = names;
    _namesCacheAt  = now;
    res.json(names);
  } catch (e) {
    console.error('[bc/budget-names]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/bc/budget/:name — budget matrix for one budget name
router.get('/budget/:name', requireAuth, async (req, res) => {
  if (!isBcConfigured())
    return res.status(503).json({ error: 'BC not configured.' });

  const safe = safeName(req.params.name);
  if (!safe) return res.status(400).json({ error: 'Invalid budget name.' });

  try {
    const now = Date.now();
    const fetchCoa = !_coaCache || now - _coaCacheAt > TTL;
    const fetchDim = !_dimCache || now - _dimCacheAt > TTL;
    if (fetchCoa || fetchDim) {
      const [coa, dim] = await Promise.all([
        fetchCoa ? bc('Chart_of_Accounts', "?$filter=Account_Type eq 'Posting'").catch(() => []) : Promise.resolve(_coaCache),
        fetchDim ? bc('KFT_Dimension_Values', "?$filter=dimensionCode eq 'BUS UNIT %26 DEPART'").catch(() => []) : Promise.resolve(_dimCache)
      ]);
      if (fetchCoa) { _coaCache = coa; _coaCacheAt = now; }
      if (fetchDim) { _dimCache = dim; _dimCacheAt = now; }
    }
    const acctNames = {};
    _coaCache.forEach(a => { acctNames[a.No] = a.Name; });
    const buNames = {};
    _dimCache.forEach(d => { if (!d.blocked) buNames[d.code] = d.name; });

    const entries = await bc('KFT_GL_Budget', `?$filter=budgetName eq '${safe}'`);
    if (!entries.length)
      return res.status(404).json({ error: `No entries found for budget '${req.params.name}'.` });

    const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const arrSum  = a => a.reduce((s, v) => s + v, 0);
    const num     = n => Number(n) || 0;

    const acctMap = {};
    const buSet   = new Set();

    entries.forEach(e => {
      const acct = String(e.accountNo || '').trim();
      const bu   = (e.globalDim2 || 'Unassigned').trim();
      const mi   = e.budgetDate ? new Date(e.budgetDate).getMonth() : -1;
      if (!acct || mi < 0) return;
      const amt = num(e.amount);
      buSet.add(bu);
      if (!acctMap[acct]) acctMap[acct] = {
        accountNo: acct,
        name: acctNames[acct] || '',
        monthly: Array(12).fill(0),
        byBU: {}
      };
      acctMap[acct].monthly[mi] += amt;
      if (!acctMap[acct].byBU[bu]) acctMap[acct].byBU[bu] = Array(12).fill(0);
      acctMap[acct].byBU[bu][mi] += amt;
    });

    const accounts = Object.values(acctMap)
      .filter(a => arrSum(a.monthly) !== 0)
      .map(a => ({ ...a, total: arrSum(a.monthly) }))
      .sort((a, b) => a.accountNo.localeCompare(b.accountNo, undefined, { numeric: true }));

    const grandMonthly = Array(12).fill(0);
    accounts.forEach(a => a.monthly.forEach((v, i) => { grandMonthly[i] += v; }));

    const BUs = [...buSet].sort();
    const byBU = BUs.map(bu => {
      const monthly = Array(12).fill(0);
      accounts.forEach(a => (a.byBU[bu] || []).forEach((v, i) => { monthly[i] += v; }));
      return { unit: bu, monthly, total: arrSum(monthly) };
    });

    // 3-digit prefix → OPEX category labels
    const CAT_LABELS = {
      '501': 'Revenue',           '603': 'COS - Salaries',
      '701': 'Selling & Dist.',   '801': 'Salaries & Benefits',
      '811': 'Insurance',         '820': 'Repair & Maintenance',
      '822': 'Hotels & Accom.',   '824': 'Rentals & Hires',
      '826': 'Consultancy',       '830': 'Utilities',
      '832': 'Telecom',           '836': 'Fuel & Oil',
      '840': 'Staff Welfare'
    };
    const catMap = {};
    accounts.forEach(a => {
      const pfx = a.accountNo.slice(0, 3);
      if (!CAT_LABELS[pfx]) return;
      if (!catMap[pfx]) catMap[pfx] = { code: pfx, name: CAT_LABELS[pfx], monthly: Array(12).fill(0) };
      a.monthly.forEach((v, i) => { catMap[pfx].monthly[i] += v; });
    });
    const byCategory = Object.values(catMap).map(c => ({ ...c, total: arrSum(c.monthly) }));

    res.json({
      budgetName: req.params.name,
      months: MONTHS,
      BUs,
      buNames,
      accounts,
      totals:     { monthly: grandMonthly, total: arrSum(grandMonthly) },
      byBU,
      byCategory
    });
  } catch (e) {
    console.error('[bc/budget]', e.message);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
