const router      = require('express').Router();
const requireAuth = require('../middleware/auth');
const { bc, isBcConfigured } = require('../services/bc-client');

// A single click (e.g. a line item) is usually 1-10 accounts; a grand total (Total
// Assets/Liabilities) can be 100+. Below this, ask BC to filter by accountNo too —
// returns only the handful of rows actually needed instead of every Balance Sheet
// entry since inception (thousands of rows), which is both less to transfer and less
// for BC itself to scan. At/above it, an OData filter that long risks hitting URL
// length limits, so fall back to the broader bulk-fetch path (cached below) instead.
const ACCOUNT_FILTER_THRESHOLD = 40;

// The bulk "every Balance Sheet entry up to asOf" fetch (needed for large-account
// clicks like Total Assets) and the GL account name lookup are both cached in-process —
// a 10-minute TTL for entries (someone exploring several big totals in a row shouldn't
// re-fetch thousands of rows each click) and an hour for account names (change rarely).
// Not shared with snapshot-builder.js's own cache (a different module's closure) — this
// one only needs to survive across drilldown clicks within roughly the same session.
const _bulkEntriesCache = new Map(); // "incomeBalance|from|to" -> { at, entries }
const BULK_TTL_MS = 10 * 60 * 1000;
let _acctNameCache = { at: 0, map: null };
const ACCT_NAME_TTL_MS = 60 * 60 * 1000;

async function getAccountNames() {
  if (_acctNameCache.map && (Date.now() - _acctNameCache.at) < ACCT_NAME_TTL_MS) return _acctNameCache.map;
  const glAccounts = await bc('KFT_GL_Accounts').catch(() => []);
  const map = {};
  (glAccounts || []).forEach(a => { if (a.no) map[String(a.no).trim()] = a.name || ''; });
  _acctNameCache = { at: Date.now(), map };
  return map;
}

// incomeBalance null = no Income Statement/Balance Sheet restriction (scope=all).
async function getBulkEntries(incomeBalance, dateFilter) {
  const key = `${incomeBalance || 'all'}|${dateFilter}`;
  const cached = _bulkEntriesCache.get(key);
  if (cached && (Date.now() - cached.at) < BULK_TTL_MS) return cached.entries;
  const entries = await bc('KFT_GL_Entries', `?$filter=${incomeBalance ? `incomeBalance eq '${incomeBalance}' and ` : ''}${dateFilter}`);
  _bulkEntriesCache.set(key, { at: Date.now(), entries });
  return entries;
}

// GET /api/gl-drilldown?accounts=1011,1012&asOf=2026-07-31&label=Non-Current+Assets
// Returns the raw GL entries behind a figure shown on a finance page — same
// click-a-number-to-see-the-ledger behavior BC itself has. `accounts` is the comma-
// separated account number list the figure was built from (snapshot-builder.js now
// attaches one to every Balance Sheet row/section/grand-total for exactly this).
// Balance Sheet accounts are cumulative since inception, so this is every entry up to
// `asOf` (default: today), not just one period's activity — matching how the figure
// itself was computed.
//
// Passing `from` (in addition to `asOf` as the end date) switches to an Income
// Statement, DATE-RANGE query instead — for P&L/OPEX figures (Corporate Budget's "By
// Business Unit" actuals, e.g.), which are a period's activity, not a cumulative
// balance, and live under incomeBalance 'Income Statement' rather than 'Balance Sheet'.
//
// `scope=all` drops the Income Statement/Balance Sheet restriction entirely — for the
// Cashflow statement, whose rows deliberately mix both (e.g. CF001 "Cash collected from
// Customers" = revenue accounts 5000.. plus receivable accounts 2010..). The date
// window is still `from`..`asOf` when `from` is given, else everything up to `asOf`.
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!isBcConfigured()) return res.status(503).json({ error: 'Business Central is not configured.' });

    // Account numbers are always plain digits (BC's own chart of accounts) — reject
    // anything else so a malformed/tampered query string can't reach the OData filter.
    const accounts = String(req.query.accounts || '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
    if (!accounts.length) return res.status(400).json({ error: 'accounts is required (comma-separated account numbers).' });

    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(req.query.asOf || '') ? req.query.asOf : new Date().toISOString().slice(0, 10);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : null;
    const scopeAll = req.query.scope === 'all';
    const incomeBalance = scopeAll ? null : from ? 'Income Statement' : 'Balance Sheet';
    const dateFilter = from ? `postingDate ge ${from} and postingDate le ${asOf}` : `postingDate le ${asOf}`;
    const ibFilter = incomeBalance ? `incomeBalance eq '${incomeBalance}' and ` : '';
    const acctSet = new Set(accounts);

    const [rawEntries, nameByAcct] = await Promise.all([
      accounts.length <= ACCOUNT_FILTER_THRESHOLD
        ? bc('KFT_GL_Entries', `?$filter=${ibFilter}${dateFilter} and (${accounts.map(a => `accountNo eq '${a}'`).join(' or ')})`)
        : getBulkEntries(incomeBalance, dateFilter).then(all => all.filter(e => acctSet.has(String(e.accountNo)))),
      getAccountNames()
    ]);

    const entries = rawEntries
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

    res.json({ accounts, asOf, from, total, count: entries.length, entries });
  } catch (e) {
    console.error('[gl-drilldown]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
