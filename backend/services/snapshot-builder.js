const { bc, isBcConfigured } = require('./bc-client');
const db = require('../db');

const _jobTitleUpsert = db.prepare(
  `INSERT INTO employee_job_titles (employee_no, job_title, updated_at)
   VALUES (?, ?, datetime('now'))
   ON CONFLICT(employee_no) DO UPDATE SET job_title = excluded.job_title, updated_at = excluded.updated_at`
);
const _jobTitleUpsertMany = db.transaction((rows) => {
  rows.forEach(([no, title]) => _jobTitleUpsert.run(no, title));
});

const SUPERSET_BASE = process.env.SUPERSET_BASE || 'http://213.55.97.58:8088';

// Module-level cache for static BC data (schedule + CoA structure never change per session)
let _bcStaticCache = null;
async function getBcStatic() {
  if (_bcStaticCache) return _bcStaticCache;
  const [mgtLines, coaEndTotals, coaPostingRows] = await Promise.all([
    bc('KFT_MGT_RPT_Lines'),
    bc('Chart_of_Accounts', "?$filter=Account_Type eq 'End-Total'").catch(() => []),
    bc('Chart_of_Accounts', "?$filter=Account_Type eq 'Posting' and No ge '5000' and No le '9999'").catch(() => [])
  ]);
  _bcStaticCache = { mgtLines, coaEndTotals, coaPostingRows };
  return _bcStaticCache;
}

async function fetchSuperset(chartId, attempt = 0) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    const r = await fetch(`${SUPERSET_BASE}/api/v1/chart/${chartId}/data/`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.result?.[0]?.data || null;
  } catch {
    if (attempt === 0) {
      await new Promise(res => setTimeout(res, 3000));
      return fetchSuperset(chartId, 1);
    }
    return null;
  }
}

const CONFIG = {
  BUDGET_NAME:    process.env.BC_BUDGET_NAME    || '20.1',
  FY_START:       process.env.BC_FY_START       || '2026-01-01',
  PAYROLL_START:  process.env.BC_PAYROLL_START  || '2025-01-01',
  ranges: {
    revenue:          ['5000', '5999'],
    cosBpass:         ['6010', '6020'],
    cosProduct:       ['6050', '6059'],
    salaries:         ['8101', '8108'],
    opexA:            ['7000', '8100'],
    opexB:            ['8110', '9199'],
    depAmort:         ['9210', '9299'],
    finCosts:         ['9510', '9599'],
    bankCash:         ['2460', '2990'],
    debtShort:        ['3410', '3459'],
    debtLong:         ['3700', '3749'],
    wip:              ['1500', '1599'],
    disbursements:    ['6021', '6022'],
    currentAssets:    ['2000', '2995'],
    inventory:        ['2410', '2459'],
    currentLiab:      ['3005', '3599'],
    totalLiabilities: ['3000', '3999'],
    equity:           ['4000', '4999']
  },
  DEBT_FACILITY: process.env.BC_DEBT_FACILITY ? Number(process.env.BC_DEBT_FACILITY) : null,
  CAPEX_BUDGET:  process.env.BC_CAPEX_BUDGET  ? Number(process.env.BC_CAPEX_BUDGET)  : null
};

const inRange = (a, [lo, hi]) => a >= lo && a <= hi;
const num = n => Number(n) || 0;
const toM = v => Math.round(v / 1e6 * 10) / 10;

function sumRange(rows, k, af = 'accountNo', amf = 'amount') {
  return rows
    .filter(x => inRange(String(x[af]), CONFIG.ranges[k]))
    .reduce((s, x) => s + num(x[amf]), 0);
}

/** Build dashboard JSON for a given date (YYYY-MM-DD). */
async function buildSnapshot(targetDate) {
  const today = new Date().toISOString().slice(0, 10);
  const IS_HISTORICAL = targetDate !== today;

  const fy = IS_HISTORICAL
    ? `?$filter=postingDate ge ${CONFIG.FY_START} and postingDate le ${targetDate}`
    : `?$filter=postingDate ge ${CONFIG.FY_START}`;
  const budF = `?$filter=budgetName eq '${encodeURIComponent(CONFIG.BUDGET_NAME)}'`;

  const bcAvail = isBcConfigured();

  let actuals = [], budgets = [];
  if (bcAvail) {
    actuals = await bc('KFT_GL_Actuals', fy);
    budgets = await bc('KFT_GL_Budget', budF);
    console.log(`  BC: actuals ${actuals.length} rows, budget ${budgets.length} rows`);
    if (actuals.length === 0) console.warn('  WARNING: 0 actual rows — check FY_START / postingDate filter.');
    if (budgets.length === 0) console.warn(`  WARNING: 0 budget rows — check BUDGET_NAME='${CONFIG.BUDGET_NAME}'.`);
  } else {
    console.warn('  BC not configured — skipping BC data, Superset-only snapshot');
  }

  const A = k => sumRange(actuals, k);
  const B = k => sumRange(budgets, k);

  const revA = -A('revenue'),  revB = B('revenue');
  const cosA =  A('cosBpass') + A('cosProduct'),  cosB = B('cosBpass') + B('cosProduct');
  const salA =  A('salaries'),    salB = B('salaries');
  const opA  =  A('opexA') + A('opexB'),  opB = B('opexA') + B('opexB');
  const daA  =  A('depAmort'),    daB = B('depAmort');
  const finA =  A('finCosts'),    finB = B('finCosts');

  const gpA = revA - cosA,  gpB = revB - cosB;
  const totOpexA = salA + opA,  totOpexB = salB + opB;
  const ebA = gpA - totOpexA,   ebB = gpB - totOpexB;
  const netA = ebA - daA - finA, netB = ebB - daB - finB;

  // Default hardcoded sets — overwritten below if M-MGT-RPT is reachable.
  // Note: 6019 is a ROW NUMBER reference in the Gross Profit formula, not a GL account.
  // MGT_OPEX excludes salaries (MGT_SAL) and office shared services (8341).
  // The sub-accounts here (e.g. 7011/7014) are posting accounts that roll into
  // Total CoA accounts (7099, 8199...) referenced by the schedule.
  let MGT_REV  = new Set(['5013','5014','5015','5016','5017','5018','5019','5020','5021','5022','5023','5024','5025','5026']);
  let MGT_COS  = new Set(['6011','6013','6014','6015','6016','6051','6052','6053','6054','6055','6056','6057','6058']);
  let MGT_SAL  = new Set(['8101','8102','8103','8104','8105','8106']);
  let MGT_OPEX = new Set([
    '7011','7014',                                    // → 7099 Selling & Distribution
    '8112',                                           // → 8199 Insurance
    '8201','8202','8204',                             // → 8219 Repair & Maintenance
    '8221','8222','8223',                             // → 8239 Travel & Accommodation
    '8241','8245',                                    // Office Rental, Vehicle Rentals
    '8261','8262','8263',                             // Consultancy, Audit, Legal
    '8301','8302',                                    // → 8319 Utilities
    '8321','8322','8323',                             // Telephone, Software, Tech Subscriptions
    '8342','8343','8344','8345','8348',               // Staff Cost items
    '8361',                                           // → 8379 Fuel
    '8401','8402','8403','8404','8405','8406',        // Other Staff Costs
    '9013','9016','9017','9025'                       // Parking, Stamp Duty, Penalties, Loading
  ]);

  if (bcAvail) {
    try {
      // Load schedule + CoA from cache (fetched once per process, not per snapshot)
      const { mgtLines, coaEndTotals, coaPostingRows } = await getBcStatic();

      // Index rows by RowNo for fast lookup (BC returns PascalCase field names)
      const rowMap = {};
      mgtLines.forEach(r => { if (r.RowNo) rowMap[r.RowNo] = r; });

      // Extract 4-6 digit account numbers from a Totaling string.
      // Used for Formula rows that list GL accounts directly (Revenue, COS, Salaries).
      const extractAccts = t => new Set((t || '').match(/\b\d{4,6}\b/g) || []);

      // All CoA posting accounts (5000-9999). Used as the universe for sub-account
      // expansion — broader than current-period actuals so early-period snapshots
      // (with few transactions) still resolve the full account set correctly.
      const allActualAccts = new Set(actuals.map(x => String(x.accountNo)));
      const coaPostingAccts = coaPostingRows.length > 0
        ? new Set(coaPostingRows.map(r => r.No.trim()))
        : allActualAccts; // fall back to actuals if CoA query failed

      // Build CoA range map from End-Total accounts: No → [lo, hi]
      // Each End-Total account's Totaling field is "lo..hi" (e.g. "8360..8379").
      const coaRange = {};
      coaEndTotals.forEach(r => {
        const m = (r.Totaling || '').match(/^(\d+)\.\.(\d+)$/);
        if (m) coaRange[r.No.trim()] = [Number(m[1]), Number(m[2])];
      });

      // Find all CoA posting accounts that roll up into a CoA End-Total account.
      // Uses the authoritative range from the Chart of Accounts when available.
      const findSubAccounts = totalAcct => {
        const range = coaRange[totalAcct];
        const n = Number(totalAcct);
        const lo = range ? range[0] : Math.floor(n / 100) * 100;
        const hi = range ? range[1] - 1 : n - 1;
        const result = new Set();
        for (const a of coaPostingAccts) {
          const v = Number(a);
          if (v >= lo && v <= hi) result.add(a);
        }
        return result;
      };

      // Resolve a RowNo to the set of actual GL accounts it represents, minus salSet.
      // Every token in a Formula row's Totaling is a RowNo (not a GL account number).
      const resolveRow = (rowNo, salSet, visited = new Set()) => {
        if (visited.has(rowNo)) return new Set();
        const visit = new Set(visited); visit.add(rowNo);
        const row = rowMap[rowNo];
        if (!row) return new Set();
        const result = new Set();
        const tt = row.TotalingType;
        const totaling = (row.Totaling || '').replace(/[()]/g, '');

        if (tt === 'Posting Accounts') {
          // Totaling is a direct GL account number
          if (coaPostingAccts.has(totaling) && !salSet.has(totaling)) result.add(totaling);
        } else if (tt === 'Total Accounts') {
          // Totaling is a CoA Total account — expand to posting sub-accounts by range
          findSubAccounts(totaling).forEach(a => { if (!salSet.has(a)) result.add(a); });
        } else {
          // Formula (or unknown) — each digit token is a RowNo; resolve recursively
          totaling.split(/[+\-*/,]/).map(s => s.trim()).filter(s => /^\d+$/.test(s))
            .forEach(p => resolveRow(p, salSet, visit).forEach(a => result.add(a)));
        }
        return result;
      };

      // Revenue (RowNo 10000) and COS (RowNo 6019): account numbers listed directly in Totaling
      if (rowMap['10000']?.Totaling) MGT_REV = extractAccts(rowMap['10000'].Totaling);
      if (rowMap['6019']?.Totaling)  MGT_COS = extractAccts(rowMap['6019'].Totaling);
      if (rowMap['1']?.Totaling)     MGT_SAL = extractAccts(rowMap['1'].Totaling);

      // OPEX (RowNo 30000): all tokens in the Totaling are RowNos — resolve via rowMap
      if (rowMap['30000']?.Totaling) {
        const expanded = resolveRow('30000', MGT_SAL);
        if (expanded.size > 5) MGT_OPEX = expanded;
      }

      console.log(`  M-MGT-RPT: Rev=${MGT_REV.size} accts, COS=${MGT_COS.size} accts, Sal=${MGT_SAL.size} accts, OPEX=${MGT_OPEX.size} accts`);
    } catch (e) {
      console.warn('  M-MGT-RPT fetch failed — using hardcoded account sets:', e.message);
    }
  }

  const sumAccts = (rows, accts) =>
    rows.filter(x => accts.has(String(x.accountNo))).reduce((s, x) => s + num(x.amount), 0);

  const mgtRevA     = -sumAccts(actuals, MGT_REV);
  const mgtCosA     =  sumAccts(actuals, MGT_COS);
  const mgtGpA      = mgtRevA - mgtCosA;
  const mgtSalA     =  sumAccts(actuals, MGT_SAL);
  const mgtOpexA    =  sumAccts(actuals, MGT_OPEX);  // non-salary OPEX, matching M-MGT-RPT
  const mgtTotOpexA = mgtSalA + mgtOpexA;            // = M-MGT-RPT "Total OPEX"
  const mgtEbA = mgtGpA - mgtTotOpexA;
  const mgtNetA     = mgtEbA - daA - finA;
  const ytdGPMgn    = mgtRevA ? parseFloat((mgtGpA / mgtRevA * 100).toFixed(1)) : null;
  const ytdEBMgn    = mgtRevA ? parseFloat((mgtEbA / mgtRevA * 100).toFixed(1)) : null;

  const budgetActual = { lines: [
    { name: 'Revenue',       budget: toM(revB),     actual: toM(mgtRevA),     higherIsBetter: true  },
    { name: 'Cost of Sales', budget: toM(cosB),     actual: toM(mgtCosA),     higherIsBetter: false },
    { name: 'Expenses',      budget: toM(totOpexB), actual: toM(mgtTotOpexA), higherIsBetter: false },
    { name: 'Gross Profit',  budget: toM(gpB),      actual: toM(mgtGpA),      higherIsBetter: true  },
    { name: 'EBITDA',        budget: toM(ebB),      actual: toM(mgtEbA),      higherIsBetter: true  }
  ]};

  const bm = {}, um = {};
  budgets.forEach(x => { const u = x.globalDim2 || 'Unassigned'; bm[u] = (bm[u] || 0) + Math.abs(num(x.amount)); });
  actuals.forEach(x => {
    const a = String(x.accountNo);
    if (inRange(a, CONFIG.ranges.cosBpass) || inRange(a, CONFIG.ranges.cosProduct) ||
        inRange(a, CONFIG.ranges.salaries) || inRange(a, CONFIG.ranges.opexA) || inRange(a, CONFIG.ranges.opexB)) {
      const u = x.globalDim2 || 'Unassigned';
      um[u] = (um[u] || 0) + num(x.amount);
    }
  });
  const units = Object.keys(bm).filter(u => bm[u] > 0);
  const byUnit = units.map(u => ({ unit: u, budget: toM(bm[u]) }));
  const utilizationYTD = units.map(u => ({ unit: u, used: toM(Math.abs(um[u] || 0)), budget: toM(bm[u]) }));

  const mN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const aMonth = Array(12).fill(0), bMonth = Array(12).fill(0);
  const isPL = a => inRange(a, CONFIG.ranges.revenue) || inRange(a, CONFIG.ranges.cosBpass) ||
    inRange(a, CONFIG.ranges.cosProduct) || inRange(a, CONFIG.ranges.salaries) ||
    inRange(a, CONFIG.ranges.opexA) || inRange(a, CONFIG.ranges.opexB);
  actuals.forEach(x => { if (isPL(String(x.accountNo)) && x.postingDate)
    aMonth[new Date(x.postingDate).getMonth()] += num(x.amount); });
  budgets.forEach(x => { if (isPL(String(x.accountNo)) && x.budgetDate)
    bMonth[new Date(x.budgetDate).getMonth()] += num(x.amount); });

  const revBMonth = Array(12).fill(0);
  const cosBMonth = Array(12).fill(0);
  const salBMonth = Array(12).fill(0);
  const opBMonth  = Array(12).fill(0);
  budgets.forEach(x => {
    const mi = x.budgetDate ? new Date(x.budgetDate).getMonth() : -1;
    if (mi < 0) return;
    const amt = Math.abs(num(x.amount));
    const a = String(x.accountNo);
    if (inRange(a, CONFIG.ranges.revenue)) { revBMonth[mi] += amt; return; }
    if (inRange(a, CONFIG.ranges.cosBpass) || inRange(a, CONFIG.ranges.cosProduct)) { cosBMonth[mi] += amt; return; }
    if (inRange(a, CONFIG.ranges.salaries)) { salBMonth[mi] += amt; return; }
    if (inRange(a, CONFIG.ranges.opexA) || inRange(a, CONFIG.ranges.opexB)) opBMonth[mi] += amt;
  });
  const gpBMonth      = revBMonth.map((v, i) => v - cosBMonth[i]);
  const totOpexBMonth = salBMonth.map((v, i) => v + opBMonth[i]);
  const ebBMonth      = gpBMonth.map((v, i) => v - totOpexBMonth[i]);
  const lm = new Date(targetDate + 'T12:00:00').getMonth();
  const labels = mN.slice(0, lm + 1);

  // Per-metric monthly arrays using M-MGT-RPT account sets
  const revM = Array(12).fill(0), cosM = Array(12).fill(0);
  const salM = Array(12).fill(0), opM  = Array(12).fill(0);
  const daM  = Array(12).fill(0), finM = Array(12).fill(0);
  actuals.forEach(x => {
    const a = String(x.accountNo);
    const mi = x.postingDate ? new Date(x.postingDate).getMonth() : -1;
    if (mi < 0) return;
    if (MGT_REV.has(a)) { revM[mi] += num(x.amount); return; }
    if (MGT_COS.has(a)) { cosM[mi] += num(x.amount); return; }
    if (MGT_SAL.has(a)) { salM[mi] += num(x.amount); return; }
    if (inRange(a, CONFIG.ranges.depAmort)) { daM[mi] += num(x.amount); return; }
    if (inRange(a, CONFIG.ranges.finCosts)) { finM[mi] += num(x.amount); return; }
    if (inRange(a, CONFIG.ranges.opexA) || inRange(a, CONFIG.ranges.opexB)) opM[mi] += num(x.amount);
  });
  const curM = lm;
  const prvM = curM > 0 ? curM - 1 : null;

  // Monthly metric helpers — null when no revenue data for that month (guards against old archives)
  const hasData = i => revM[i] !== 0;
  const mRev  = i => hasData(i) ? toM(-revM[i]) : null;
  const mCos  = i => hasData(i) ? toM(cosM[i]) : null;
  const mGP   = i => hasData(i) ? toM(-revM[i] - cosM[i]) : null;
  const mOpex = i => hasData(i) ? toM(salM[i] + opM[i]) : null;
  const mEB   = i => hasData(i) ? toM(-revM[i] - cosM[i] - salM[i] - opM[i]) : null;
  const mNet  = i => hasData(i) ? toM(-revM[i] - cosM[i] - salM[i] - opM[i] - daM[i] - finM[i]) : null;
  const mGPMgn = i => mRev(i) ? parseFloat((mGP(i) / mRev(i) * 100).toFixed(1)) : null;
  const mEBMgn = i => mRev(i) ? parseFloat((mEB(i) / mRev(i) * 100).toFixed(1)) : null;

  // Cap YTD budget at the last month that has actual postings (avoids comparing
  // Jan-Jun actuals against Jan-Jul budget when the snapshot date is early in the month)
  const lastDataM = Array.from({ length: 12 }, (_, i) => i).reverse().find(i => hasData(i)) ?? lm;
  const ytdSum = arr => arr.slice(0, lastDataM + 1).reduce((s, v) => s + v, 0);
  const revBYTD     = ytdSum(revBMonth);
  const cosBYTD     = ytdSum(cosBMonth);
  const totOpexBYTD = ytdSum(totOpexBMonth);
  const gpBYTD      = revBYTD - cosBYTD;
  const ebBYTD      = gpBYTD - totOpexBYTD;
  budgetActual.lines = [
    { name: 'Revenue',       budget: toM(revBYTD),     actual: toM(mgtRevA),     higherIsBetter: true  },
    { name: 'Cost of Sales', budget: toM(cosBYTD),     actual: toM(mgtCosA),     higherIsBetter: false },
    { name: 'Expenses',      budget: toM(totOpexBYTD), actual: toM(mgtTotOpexA), higherIsBetter: false },
    { name: 'Gross Profit',  budget: toM(gpBYTD),      actual: toM(mgtGpA),      higherIsBetter: true  },
    { name: 'EBITDA',        budget: toM(ebBYTD),      actual: toM(mgtEbA),      higherIsBetter: true  }
  ];

  budgetActual.monthlyLines = Array(12).fill(null).map((_, i) => [
    { name: 'Revenue',       budget: toM(revBMonth[i]),      actual: mRev(i),  higherIsBetter: true  },
    { name: 'Cost of Sales', budget: toM(cosBMonth[i]),      actual: mCos(i),  higherIsBetter: false },
    { name: 'Expenses',      budget: toM(totOpexBMonth[i]),  actual: mOpex(i), higherIsBetter: false },
    { name: 'Gross Profit',  budget: toM(gpBMonth[i]),       actual: mGP(i),   higherIsBetter: true  },
    { name: 'EBITDA',        budget: toM(ebBMonth[i]),       actual: mEB(i),   higherIsBetter: true  }
  ]);

  const budgetOverview = {
    byUnit,
    monthly: {
      labels,
      budget: labels.map((_, i) => toM(revBMonth[i])),
      actual: labels.map((_, i) => mRev(i) ?? 0)
    },
    utilizationYTD
  };

  // ── Corporate Budget Analysis ──────────────────────────────────────────────
  const CB_ACCT_LABELS = {
    '501': 'Revenue',            '603': 'COS - Salaries',
    '701': 'Selling & Dist.',    '801': 'Salaries & Benefits',
    '811': 'Insurance',          '820': 'Repair & Maintenance',
    '822': 'Hotels & Accom.',    '824': 'Rentals & Hires',
    '826': 'Consultancy',        '830': 'Utilities',
    '832': 'Telecom',            '836': 'Fuel & Oil',
    '840': 'Staff Welfare'
  };
  const cbBudU = {}, cbActU = {}, cbBudA = {}, cbActA = {};

  budgets.forEach(x => {
    const u  = x.globalDim2 || 'Unassigned';
    const mi = x.budgetDate ? new Date(x.budgetDate).getMonth() : -1;
    if (mi < 0) return;
    const amt = Math.abs(num(x.amount));
    if (!cbBudU[u]) cbBudU[u] = Array(12).fill(0);
    cbBudU[u][mi] += amt;
    const pfx = String(x.accountNo).slice(0, 3);
    if (CB_ACCT_LABELS[pfx]) {
      if (!cbBudA[pfx]) cbBudA[pfx] = Array(12).fill(0);
      cbBudA[pfx][mi] += amt;
    }
  });

  actuals.forEach(x => {
    const a = String(x.accountNo);
    const isExp = inRange(a, CONFIG.ranges.cosBpass) || inRange(a, CONFIG.ranges.cosProduct) ||
      inRange(a, CONFIG.ranges.salaries) || inRange(a, CONFIG.ranges.opexA) || inRange(a, CONFIG.ranges.opexB);
    if (!isExp) return;
    const u  = x.globalDim2 || 'Unassigned';
    const mi = x.postingDate ? new Date(x.postingDate).getMonth() : -1;
    if (mi < 0) return;
    if (!cbActU[u]) cbActU[u] = Array(12).fill(0);
    cbActU[u][mi] += num(x.amount);
    const pfx = a.slice(0, 3);
    if (CB_ACCT_LABELS[pfx]) {
      if (!cbActA[pfx]) cbActA[pfx] = Array(12).fill(0);
      cbActA[pfx][mi] += num(x.amount);
    }
  });

  const cbAllU  = new Set([...Object.keys(cbBudU), ...Object.keys(cbActU)]);
  const arrSum  = arr => (arr || []).reduce((s, v) => s + v, 0);

  const corporateBudget = {
    budgetName:  CONFIG.BUDGET_NAME,
    totalBudget: toM(Array.from(cbAllU).reduce((s, u) => s + arrSum(cbBudU[u]), 0)),
    actualYTD:   toM(Math.abs(Array.from(cbAllU).reduce((s, u) => s + arrSum(cbActU[u]), 0))),

    byBU: Array.from(cbAllU)
      .map(u => {
        const bud = arrSum(cbBudU[u]);
        const act = Math.abs(arrSum(cbActU[u]));
        const variance = bud - act;
        return {
          unit:        u,
          budgetYTD:   toM(bud),
          actualYTD:   toM(act),
          varianceYTD: toM(variance),
          varPct:      bud ? parseFloat((variance / bud * 100).toFixed(1)) : null,
          utilPct:     bud ? parseFloat((act / bud * 100).toFixed(1)) : null,
          monthly: mN.map((_, i) => ({
            bud: toM(cbBudU[u]?.[i] || 0),
            act: toM(Math.abs(cbActU[u]?.[i] || 0))
          }))
        };
      })
      .filter(r => r.budgetYTD > 0 || r.actualYTD > 0)
      .sort((a, b) => (b.budgetYTD || 0) - (a.budgetYTD || 0)),

    monthly: {
      labels: mN,
      budget: mN.map((_, i) => toM(Array.from(cbAllU).reduce((s, u) => s + (cbBudU[u]?.[i] || 0), 0))),
      actual: mN.map((_, i) => toM(Math.abs(Array.from(cbAllU).reduce((s, u) => s + (cbActU[u]?.[i] || 0), 0))))
    },

    byAccount: Object.keys(CB_ACCT_LABELS)
      .filter(pfx => cbBudA[pfx] || cbActA[pfx])
      .map(pfx => ({
        code:      pfx,
        name:      CB_ACCT_LABELS[pfx],
        budgetYTD: toM(arrSum(cbBudA[pfx])),
        actualYTD: toM(Math.abs(arrSum(cbActA[pfx]))),
        utilPct:   arrSum(cbBudA[pfx])
          ? parseFloat((Math.abs(arrSum(cbActA[pfx])) / arrSum(cbBudA[pfx]) * 100).toFixed(1))
          : null,
        monthly: mN.map((_, i) => ({
          bud: toM(cbBudA[pfx]?.[i] || 0),
          act: toM(Math.abs(cbActA[pfx]?.[i] || 0))
        }))
      }))
      .sort((a, b) => (b.budgetYTD || 0) - (a.budgetYTD || 0))
  };

  let glAccountNames = {};
  try {
    const glAccts = await bc('KFT_GL_Accounts');
    glAccts.forEach(a => { if (a.no && a.name) glAccountNames[a.no] = a.name; });
  } catch (e) {
    console.warn('  KFT_GL_Accounts not reachable:', e.message);
  }

  const collections = Math.abs(A('bankCash'));
  const debtUsed    = Math.abs(A('debtShort')) + Math.abs(A('debtLong'));
  const capexOut    = Math.abs(A('wip'));
  const operatingOut = Math.abs(cosA) + Math.abs(totOpexA);

  const bank = bcAvail ? await bc('KFT_Bank_Ledger', fy) : [];
  bank.sort((a, b) => new Date(a.postingDate) - new Date(b.postingDate));

  const collByMonth = Array(12).fill(0);
  bank.forEach(x => {
    if (num(x.amount) > 0 && x.postingDate)
      collByMonth[new Date(x.postingDate).getMonth()] += num(x.amount);
  });

  let run = 0;
  const dayMap = {}, bankMap = {};
  bank.forEach(x => {
    run += num(x.amount);
    const d = String(x.postingDate).slice(0, 10);
    dayMap[d] = run;
    if (num(x.amount) > 0) {
      const b = x.bankAccountNo || 'Other';
      bankMap[b] = (bankMap[b] || 0) + num(x.amount);
    }
  });
  const days = Object.keys(dayMap).sort().slice(-30);
  const cashflow = {
    bankDaily: { labels: days.map(d => d.slice(8, 10)), balances: days.map(d => toM(dayMap[d])) },
    collectionsByBank: Object.entries(bankMap)
      .map(([code, a]) => ({ bank: glAccountNames[code] || code, amount: toM(a) }))
      .sort((a, b) => b.amount - a.amount).slice(0, 6),
    flows: { collections: toM(collections), otherInflows: 0, operatingOut: toM(operatingOut), capexOut: toM(capexOut) },
    debtUtilisation: { used: toM(debtUsed), facility: CONFIG.DEBT_FACILITY || toM(debtUsed) || 1 },
    capexUtilisation: { used: toM(capexOut), budget: CONFIG.CAPEX_BUDGET || toM(capexOut) || 1 },
    monthlyCollections: { labels, data: labels.map((_, i) => toM(collByMonth[i])) }
  };

  const pct = (n, d) => d ? (n / d * 100).toFixed(1) + '%' : 'n/a';
  const rat = (n, d) => d ? (n / d).toFixed(2) : 'n/a';
  const plBridge = [
    { name: 'Revenue',         value: toM(revA),  type: 'total' },
    { name: 'Cost of Sales',   value: -toM(cosA), type: 'neg' },
    { name: 'Gross Profit',    value: toM(gpA),   type: 'subtotal' },
    { name: 'Salaries',        value: -toM(salA), type: 'neg' },
    { name: 'Operating Exp.',  value: -toM(opA),  type: 'neg' },
    { name: 'EBITDA',          value: toM(ebA),   type: 'subtotal' },
    { name: 'Depreciation',    value: -toM(daA),  type: 'neg' },
    { name: 'Financial Costs', value: -toM(finA), type: 'neg' },
    { name: 'Net Profit',      value: toM(netA),  type: 'total' }
  ];

  let bsRows;
  if (IS_HISTORICAL) {
    const glE = bcAvail ? await bc('KFT_GL_Entries',
      `?$filter=incomeBalance eq 'Balance Sheet' and postingDate le ${targetDate}`) : [];
    const bsMap = {};
    glE.forEach(e => { const k = String(e.accountNo); bsMap[k] = (bsMap[k] || 0) + num(e.amount); });
    bsRows = Object.entries(bsMap).map(([accountNo, balance]) => ({ accountNo, balance }));
  } else {
    bsRows = bcAvail ? await bc('KFT_GL_Balances') : [];
  }
  const G = k => bsRows
    .filter(x => inRange(String(x.accountNo), CONFIG.ranges[k]))
    .reduce((s, x) => s + num(x.balance), 0);
  const ca = G('currentAssets'), inv = G('inventory'), cl = Math.abs(G('currentLiab'));
  const liab = Math.abs(G('totalLiabilities')), eq = Math.abs(G('equity'));

  const reports = {
    ratios: [
      { label: 'Gross Margin',  value: pct(gpA, revA),  trend: 0 },
      { label: 'EBITDA Margin', value: pct(ebA, revA),  trend: 0 },
      { label: 'Net Margin',    value: pct(netA, revA), trend: 0 },
      { label: 'Current Ratio', value: rat(ca, cl),     trend: 0 },
      { label: 'Quick Ratio',   value: rat(ca - inv, cl), trend: 0 },
      { label: 'Debt / Equity', value: rat(liab, eq),   trend: 0 }
    ],
    pl: plBridge,
    management: [
      { metric: 'Total Revenue',   month: mRev(curM),      last: prvM !== null ? mRev(prvM)      : null, ytd: toM(mgtRevA),     vsBudget: revB      ? +((mgtRevA     - revB)      / revB      * 100).toFixed(1) : null },
      { metric: 'Cost of Sales',   month: mCos(curM),      last: prvM !== null ? mCos(prvM)      : null, ytd: toM(mgtCosA),     vsBudget: cosB      ? +((mgtCosA     - cosB)      / cosB      * 100).toFixed(1) : null },
      { metric: 'Gross Profit',    month: mGP(curM),       last: prvM !== null ? mGP(prvM)       : null, ytd: toM(mgtGpA),      vsBudget: gpB       ? +((mgtGpA      - gpB)       / gpB       * 100).toFixed(1) : null },
      { metric: 'Gross Margin %',  month: mGPMgn(curM),    last: prvM !== null ? mGPMgn(prvM)    : null, ytd: ytdGPMgn,         vsBudget: null,  isPercent: true },
      { metric: 'Total OPEX',      month: mOpex(curM),     last: prvM !== null ? mOpex(prvM)     : null, ytd: toM(mgtTotOpexA), vsBudget: totOpexB  ? +((mgtTotOpexA - totOpexB)  / totOpexB  * 100).toFixed(1) : null },
      { metric: 'EBITDA',          month: mEB(curM),       last: prvM !== null ? mEB(prvM)       : null, ytd: toM(mgtEbA),      vsBudget: ebB       ? +((mgtEbA      - ebB)       / ebB       * 100).toFixed(1) : null },
      { metric: 'EBITDA Margin %', month: mEBMgn(curM),    last: prvM !== null ? mEBMgn(prvM)    : null, ytd: ytdEBMgn,         vsBudget: null,  isPercent: true },
      { metric: 'Net Profit',      month: mNet(curM),      last: prvM !== null ? mNet(prvM)      : null, ytd: toM(mgtNetA),     vsBudget: netB      ? +((mgtNetA     - netB)      / netB      * 100).toFixed(1) : null },
    ]
  };

  const [employees, headcountRows, rawDimVals, empHist] = await Promise.all([
    bcAvail ? bc('GetEmployee').catch(() => [])                                           : Promise.resolve([]),
    bcAvail ? bc('KFT_Employee_Headcount').catch(() => [])                                : Promise.resolve([]),
    bcAvail ? bc('KFT_Dimension_Values', '?$orderby=dimensionCode,code').catch(() => []) : Promise.resolve([]),
    bcAvail ? bc('KFT_Employment_History').catch(() => [])                                : Promise.resolve([])
  ]);

  // Persist every employee's job title (KFT_Employee_Headcount now covers Active and
  // Inactive/Terminated/New — its BC-side active-only filter was removed). A minority of
  // inactive rows still have a blank jobTitle in BC itself; this cache preserves whatever
  // title we've ever seen for someone so it survives even if BC's own field later goes
  // blank, via historicalJobTitleByNo built from this table further below.
  if (headcountRows.length > 0) {
    _jobTitleUpsertMany(
      headcountRows
        .filter(r => r.AuxiliaryIndex1 && r.jobTitle && r.jobTitle.trim())
        .map(r => [r.AuxiliaryIndex1, r.jobTitle.trim()])
    );
  }
  const historicalJobTitleByNo = {};
  db.prepare('SELECT employee_no, job_title FROM employee_job_titles').all()
    .forEach(r => { historicalJobTitleByNo[r.employee_no] = r.job_title; });

  // Dimension names flat map — include blocked values so employees assigned to
  // blocked sections still get a human-readable name
  let dimensionNames = {};
  rawDimVals.forEach(d => { if (d.code && d.name) dimensionNames[d.code] = d.name; });

  // ── Dimension hierarchy: auto-detect Global Dim 2 and parse parent→section ──
  // Employees are assigned to "section" codes (Standard, higher indentation).
  // Parent "department/BU" rows are Heading/Begin-Total at lower indentation.
  const empSectionCodes = new Set(headcountRows.map(r => r.businessUnitDept).filter(Boolean));
  const dimCodeScore = {};
  rawDimVals.forEach(d => {
    if (d.dimensionCode && empSectionCodes.has(d.code))
      dimCodeScore[d.dimensionCode] = (dimCodeScore[d.dimensionCode] || 0) + 1;
  });
  const gd2DimCode = Object.entries(dimCodeScore).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  console.log(`  HR dim: ${rawDimVals.length} dim values, ${empSectionCodes.size} section codes, gd2DimCode=${gd2DimCode}`);

  // sectionCode → parent deptCode; deptNames for those parent codes
  // The OData call uses $orderby=dimensionCode,code so within each dimension the
  // entries are sorted by code. BC convention: parent Begin-Total codes (e.g. BUS-000)
  // always sort before their child sections (BUS-001, BUS-002…), so a sequential scan
  // correctly pairs parents with sections.
  const sectionToDept = {}, deptDisplayNames = {};
  if (gd2DimCode) {
    const gd2Dims = rawDimVals.filter(d => d.dimensionCode === gd2DimCode);

    // Diagnostic: log the first few entries to verify type values from BC
    console.log(`  HR dim: gd2 has ${gd2Dims.length} entries. First 8:`);
    gd2Dims.slice(0, 8).forEach(d =>
      console.log(`    code=${d.code} type="${d.dimensionValueType}" ind=${d.indentation} blocked=${d.blocked} inEmpSet=${empSectionCodes.has(d.code)}`)
    );

    // ONLY Begin-Total entries are parent departments (the 7 BUs the user wants).
    // Heading, Standard, and any other types are sections mapped to their Begin-Total parent.
    const parentByCode = {};
    gd2Dims.forEach(d => {
      const t = (d.dimensionValueType || '').replace(/[^a-z]/gi, '').toLowerCase();
      if (t === 'begintotal' && d.code && d.name) {
        parentByCode[d.code] = d.name;
        deptDisplayNames[d.code] = d.name;
      }
    });
    const parentCodes = Object.keys(parentByCode).sort();

    // Sequential pass — curDept advances only on Begin-Total.
    // Heading, Standard, and blank types are all sections under the current Begin-Total.
    let curDept = null;
    gd2Dims.forEach(d => {
      const t = (d.dimensionValueType || '').replace(/[^a-z]/gi, '').toLowerCase();
      if (t === 'begintotal') {
        curDept = d.code;
      } else if (t !== 'endtotal' && d.code) {
        // Heading (e.g. "Tech-IFS"), Standard, or blank → section under current Begin-Total
        const target = curDept || parentCodes.filter(p => p <= d.code).reverse()[0] || null;
        if (target) sectionToDept[d.code] = target;
        else console.warn(`  HR dim: no Begin-Total parent for ${d.code} (${d.name})`);
      }
    });

    console.log(`  HR dim: ${Object.keys(sectionToDept).length} sections mapped to ${Object.keys(deptDisplayNames).length} parent depts`);
    console.log(`  HR dim: sectionToDept = ${JSON.stringify(sectionToDept)}`);
  }

  // Helper: gender bucket — unknown/blank treated as Female
  const addGender = (map, key, g) => {
    if (!map[key]) map[key] = { male: 0, female: 0 };
    if (g === 'Male') map[key].male++; else map[key].female++;
  };

  // BC's Employee_Location field is free-text (office/branch names like "ADDIS
  // ABABA-FIELD-AU", "BAHIR DAR, AMHARA") — normalize down to the broad region an
  // HR summary cares about. Falls back to null (excluded from hr.byLocation)
  // rather than guessing when nothing matches.
  const REGION_KEYWORDS = [
    ['Addis Ababa',  /ADDIS ABABA/],
    ['Amhara',       /AMHARA|BAHIR ?DAR|GONDER|GOJJAM|GOJAM|WOLLO|SHOWA|MENZ|DAWENT/],
    ['Tigray',       /TIGRAY|MEKELE|SHIRE|AXUM|ADIGRAT|ADWA|HINTALO|RAYA/],
    ['Oromia',       /OROMIA|ADAMA|JIMMA|HARAR|BALE|NEKEMET|AMBO|WOLISSO|GELEMSO|SEBETA|ELUBABUR|GINCHISE/],
    ['SNNP',         /SNNP|WOLAITA|ARBA ?MINCH|HOSAANA|BONGA|GAMBELA/],
    ['Sidama',       /SIDAMA|HAWASSA|ALETAWONDO|DILLA/],
    ['Somali',       /SOMALI|JIGJIGA/],
    ['Diredawa',     /DIRE ?DAWA|CHIRO/],
    ['South Africa', /SOUTH AFRICA/],
    ['Kenya',        /KENYA/],
    ['Pakistan',     /PAKISTAN/],
  ];
  const normalizeRegion = (raw) => {
    const t = (raw || '').trim().toUpperCase();
    if (!t) return null;
    const hit = REGION_KEYWORDS.find(([, re]) => re.test(t));
    return hit ? hit[0] : 'Other';
  };

  const hrByStatus = {}, hrByType = {}, hrByGender = {};

  if (IS_HISTORICAL) {
    const currentActiveNos = new Set();
    employees.forEach(e => {
      if (e.employeeStatus !== 'Active') return;
      const hired = String(e.employmentDate || '').slice(0, 10);
      if (!hired || hired > targetDate) return;
      currentActiveNos.add(e.no);
      hrByStatus.Active = (hrByStatus.Active || 0) + 1;
      const g = e.gender === 'Male' ? 'Male' : 'Female';
      hrByGender[g] = (hrByGender[g] || 0) + 1;
      addGender(hrByType, e.employeeType || 'Unknown', g);
    });
    const NULL_DATE = '0001-01-01';
    const addedBack = new Set();
    empHist.forEach(e => {
      if (currentActiveNos.has(e.employeeNo)) return;
      const hired     = String(e.dateHired     || '').slice(0, 10);
      const separated = String(e.dateSeparated || '').slice(0, 10);
      if (separated !== NULL_DATE && separated !== '' && separated > targetDate && hired <= targetDate)
        addedBack.add(e.employeeNo);
    });
    hrByStatus.Active = (hrByStatus.Active || 0) + addedBack.size;
  } else {
    employees.forEach(e => {
      const s = e.employeeStatus || 'Unknown';
      hrByStatus[s] = (hrByStatus[s] || 0) + 1;
      if (s === 'Active') {
        const g = e.gender === 'Male' ? 'Male' : 'Female';
        hrByGender[g] = (hrByGender[g] || 0) + 1;
        addGender(hrByType, e.employeeType || 'Unknown', g);
      }
    });
  }

  // ── Dept hierarchy from headcount rows ──────────────────────────────────────
  // Groups: top-level dept → sections → individual employees
  const hrByVirtualCo = {};
  const deptHierMap = {};

  headcountRows.forEach(r => {
    if (r.employeeStatus && r.employeeStatus !== 'Active') return;
    const sectionCode = r.businessUnitDept || 'Unknown';
    const deptCode    = sectionToDept[sectionCode] || sectionCode;
    const deptName    = deptDisplayNames[deptCode] || dimensionNames[deptCode] || deptCode;
    const sectionName = dimensionNames[sectionCode] || sectionCode;
    const g = r.gender === 'Male' ? 'Male' : 'Female';

    if (!deptHierMap[deptCode])
      deptHierMap[deptCode] = { deptCode, deptName, male: 0, female: 0, sections: {} };
    const dept = deptHierMap[deptCode];
    if (g === 'Male') dept.male++; else dept.female++;

    if (!dept.sections[sectionCode])
      dept.sections[sectionCode] = { sectionCode, sectionName, male: 0, female: 0, employees: [] };
    const sec = dept.sections[sectionCode];
    if (g === 'Male') sec.male++; else sec.female++;
    sec.employees.push({
      employeeNo:     r.AuxiliaryIndex1 || '',
      name:           r.fullName      || '',
      gender:         ['Male', 'Female'].includes((r.gender || '').trim()) ? r.gender.trim() : '',
      jobTitle:       r.jobTitle      || '',
      employeeType:   r.employeeType  || '',
      virtualCompany: r.virtualCompany || '',
      region:         normalizeRegion(r.Employee_Location),
      isHQ:           (r.Employee_Location || '').trim().toUpperCase().includes('HQ')
    });

    const vc = r.virtualCompany || 'Unknown';
    hrByVirtualCo[vc] = (hrByVirtualCo[vc] || 0) + 1;
  });

  const byDeptHierarchy = Object.values(deptHierMap)
    .map(d => ({
      deptCode: d.deptCode,
      deptName: d.deptName,
      male:     d.male,
      female:   d.female,
      count:    d.male + d.female,
      sections: Object.values(d.sections)
        .map(s => ({ ...s, count: s.male + s.female,
          employees: s.employees.sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => b.count - a.count)
    }))
    .sort((a, b) => b.count - a.count);

  const byDept = byDeptHierarchy.map(d => ({
    dept: d.deptCode, male: d.male, female: d.female, count: d.count
  }));

  // Headcount by region (from BC's Employee_Location field, active only) — rows with
  // no location set or that don't match a known region are excluded rather than
  // dumped into a misleading "Unknown" bucket.
  const hrByLocation = {};
  let hqCount = 0, fieldCount = 0;
  headcountRows.forEach(r => {
    if (r.employeeStatus && r.employeeStatus !== 'Active') return;
    const rawLoc = (r.Employee_Location || '').trim();
    const region = normalizeRegion(rawLoc);
    if (!region) return;
    hrByLocation[region] = (hrByLocation[region] || 0) + 1;
    if (rawLoc.toUpperCase().includes('HQ')) hqCount++; else fieldCount++;
  });
  const byLocation = Object.entries(hrByLocation)
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count);
  const hqFieldSplit = { hq: hqCount, field: fieldCount };

  // Gender breakdown by job title — all titles, no cap
  const hrByJobTitle = {};
  headcountRows.forEach(r => {
    if (r.employeeStatus && r.employeeStatus !== 'Active') return;
    const job = (r.jobTitle || '').trim() || 'Unknown';
    addGender(hrByJobTitle, job, r.gender === 'Male' ? 'Male' : 'Female');
  });
  const byJobTitle = Object.entries(hrByJobTitle)
    .map(([jobTitle, v]) => ({ jobTitle, male: v.male, female: v.female, count: v.male + v.female }))
    .sort((a, b) => b.count - a.count);

  // Employee seniority list (active, oldest hire date first)
  const NULL_DATE_STR = '0001-01-01';
  const seniorityList = headcountRows
    .filter(r => (!r.employeeStatus || r.employeeStatus === 'Active') && r.employmentDate && String(r.employmentDate).slice(0, 10) > NULL_DATE_STR)
    .map(r => ({
      employeeNo: r.AuxiliaryIndex1 || '',
      name:   r.fullName || '',
      hired:  String(r.employmentDate).slice(0, 10),
      title:  r.jobTitle || '',
      type:   r.employeeType || '',
      gender: ['Male', 'Female'].includes((r.gender || '').trim()) ? r.gender.trim() : '',
      vc:     r.virtualCompany || ''
    }))
    .sort((a, b) => a.hired.localeCompare(b.hired));

  // ── Active Contract Type per BU matrix ──────────────────────────────────────
  const deptByTypeMap = {};
  headcountRows.forEach(r => {
    if (r.employeeStatus && r.employeeStatus !== 'Active') return;
    const sc      = r.businessUnitDept || 'Unknown';
    const dc      = sectionToDept[sc] || sc;
    const dn      = deptDisplayNames[dc] || dimensionNames[dc] || dc;
    const empType = r.employeeType || 'Unknown';
    if (!deptByTypeMap[dc]) deptByTypeMap[dc] = { deptCode: dc, deptName: dn, types: {} };
    deptByTypeMap[dc].types[empType] = (deptByTypeMap[dc].types[empType] || 0) + 1;
  });
  const allContractTypes = [...new Set(headcountRows.map(r => r.employeeType || 'Unknown'))].sort();
  const byDeptByType = Object.values(deptByTypeMap)
    .sort((a, b) => Object.values(b.types).reduce((s, v) => s + v, 0) - Object.values(a.types).reduce((s, v) => s + v, 0));

  // ── Contract Status per BU matrix ───────────────────────────────────────────
  const deptByStatusMap = {};
  const ensureDSEntry = (dc, dn) => {
    if (!deptByStatusMap[dc]) deptByStatusMap[dc] = { deptCode: dc, deptName: dn, Active: 0, Inactive: 0 };
  };
  headcountRows.forEach(r => {
    if (r.employeeStatus && r.employeeStatus !== 'Active') return;
    const sc = r.businessUnitDept || 'Unknown';
    const dc = sectionToDept[sc] || sc;
    const dn = deptDisplayNames[dc] || dimensionNames[dc] || dc;
    ensureDSEntry(dc, dn); deptByStatusMap[dc].Active++;
  });
  empHist.forEach(e => {
    const sc = e.dimension2 || 'Unknown';
    const dc = sectionToDept[sc] || sc;
    const dn = deptDisplayNames[dc] || dimensionNames[dc] || dc;
    ensureDSEntry(dc, dn); deptByStatusMap[dc].Inactive++;
  });
  const byDeptByStatus = Object.values(deptByStatusMap)
    .sort((a, b) => (b.Active + b.Inactive) - (a.Active + a.Inactive));

  // ── Monthly headcount evolution (last 12 months) ────────────────────────────
  const targetDt   = new Date(targetDate);
  const months12   = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(targetDt.getFullYear(), targetDt.getMonth() - (11 - i), 1);
    return {
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end:   new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
    };
  });
  const NULL_EPOCH = new Date('0001-01-01').getTime();

  // Build a set of active employee nos to avoid double-counting with empHist
  const activeNosSet = new Set(
    employees.filter(e => e.employeeStatus === 'Active').map(e => e.no).filter(Boolean)
  );

  // employeeNo → employeeStatus (Active/Inactive/Terminated/New), sourced from GetEmployee.
  // (KFT_Employee_Headcount also carries its own employeeStatus field now, used directly
  // wherever headcountRows is tallied below.) Used to keep payroll-derived headcount counts
  // (e.g. Individual Consultants, who aren't in KFT_Employee_Headcount) limited to currently
  // -active people instead of "anyone who ever had a payroll transaction."
  const empStatusByNo = {};
  employees.forEach(e => { if (e.no) empStatusByNo[e.no] = e.employeeStatus || 'Unknown'; });

  // virtualCompany / parent-BU for currently active employees, sourced from the employee
  // table (KFT_Employee_Headcount, keyed by AuxiliaryIndex1). Used only for the `employees`
  // loop below (which is already active-only) — KFT_Employment_History carries its own
  // dimension1 (VC) / dimension2 (BU) directly, so departed employees don't need this map.
  // employeeNo → employeeType, from the FULL (unfiltered) headcountRows — covers
  // Inactive/Terminated people too now that KFT_Employee_Headcount's active-only filter
  // was removed. Used as a fallback for empHist-sourced historical entries below, which
  // otherwise have no type at all (KFT_Employment_History's "classification" field is a
  // payroll-source distinction, not Permanent/Contract/etc) and were undercounting
  // hr.headcountEvolution[].byType relative to the bucket's real total count.
  const typeByEmpNo = {};
  headcountRows.forEach(r => {
    if (r.AuxiliaryIndex1 && r.employeeType) typeByEmpNo[r.AuxiliaryIndex1] = r.employeeType;
  });

  const vcByEmpNo = {};
  const buByEmpNo = {};
  headcountRows.forEach(r => {
    if (!r.AuxiliaryIndex1) return;
    vcByEmpNo[r.AuxiliaryIndex1] = r.virtualCompany || 'Unknown';
    const sc = r.businessUnitDept || 'Unknown';
    buByEmpNo[r.AuxiliaryIndex1] = sectionToDept[sc] || sc;
  });

  // Gender by employeeNo from the FULL GetEmployee result (not just the Active-filtered
  // subset already used elsewhere) — GetEmployee actually returns every status (Active,
  // Inactive, Terminated, New), so this covers departed employees too, unlike
  // KFT_Employment_History which has no gender field of its own at all.
  const genderByEmpNo = {};
  employees.forEach(e => { if (e.no) genderByEmpNo[e.no] = e.gender; });

  // Clean, trusted gender: BC occasionally has stray whitespace instead of a real value
  // (blank/whitespace should never silently become its own bucket).
  const cleanGender = g => { const t = (g || '').trim(); return (t === 'Male' || t === 'Female') ? t : null; };

  const bumpBU = (byBU, buCode, vc, g, type) => {
    if (!buCode || buCode === 'Unknown') return;
    if (!byBU[buCode]) byBU[buCode] = { count: 0, eth: 0, hub: 0, male: 0, female: 0, byType: {} };
    const b = byBU[buCode];
    b.count++;
    if (vc === 'ETH') b.eth++; else if (vc === 'HUB') b.hub++;
    if (g === 'Male') b.male++; else if (g === 'Female') b.female++;
    if (type && type !== 'Unknown') {
      if (!b.byType[type]) b.byType[type] = { male: 0, female: 0 };
      if (g === 'Male') b.byType[type].male++; else if (g === 'Female') b.byType[type].female++;
    }
  };
  const bumpGenderMap = (map, key, g) => {
    if (!key || key === 'Unknown') return;
    if (!map[key]) map[key] = { male: 0, female: 0 };
    if (g === 'Male') map[key].male++; else if (g === 'Female') map[key].female++;
  };

  const headcountEvolution = months12.map((m, i) => {
    // Last bucket = the current month: tally directly from headcountRows (the employee
    // table), the same source and same values already shown when no month filter is applied.
    if (i === months12.length - 1) {
      let male = 0, female = 0, eth = 0, hub = 0;
      const byBU = {}, byType = {}, byJobTitle = {};
      headcountRows.forEach(r => {
        if (r.employeeStatus && r.employeeStatus !== 'Active') return;
        const g = cleanGender(r.gender);
        if (g === 'Male') male++; else if (g === 'Female') female++;
        if (r.virtualCompany === 'ETH') eth++; else if (r.virtualCompany === 'HUB') hub++;
        const sc = r.businessUnitDept || 'Unknown';
        bumpBU(byBU, sectionToDept[sc] || sc, r.virtualCompany, g, r.employeeType);
        bumpGenderMap(byType, r.employeeType, g);
        bumpGenderMap(byJobTitle, r.jobTitle, g);
      });
      return { label: m.label, count: activeNosSet.size, male, female, eth, hub, byBU, byType, byJobTitle };
    }

    let count = 0, male = 0, female = 0, eth = 0, hub = 0;
    const byBU = {}, byType = {};
    // No byJobTitle for past months — GetEmployee carries no job-title field at all
    // (only headcountRows/KFT_Employee_Headcount does, which is current-only), so there's
    // no historical source to fall back to, not even a partial/best-effort one.
    employees.forEach(e => {
      if (e.employeeStatus !== 'Active') return;
      const hired = e.employmentDate ? new Date(e.employmentDate) : null;
      if (!(hired && hired <= m.end)) return;
      count++;
      const g = cleanGender(e.gender);
      if (g === 'Male') male++; else if (g === 'Female') female++;
      const vc = vcByEmpNo[e.no];
      if (vc === 'ETH') eth++; else if (vc === 'HUB') hub++;
      const type = e.employeeType || typeByEmpNo[e.no];
      bumpBU(byBU, buByEmpNo[e.no], vc, g, type);
      bumpGenderMap(byType, type, g);
    });
    empHist.forEach(e => {
      if (activeNosSet.has(e.employeeNo)) return; // already counted above
      const hired     = e.dateHired     ? new Date(e.dateHired)     : null;
      const separated = e.dateSeparated ? new Date(e.dateSeparated) : null;
      if (!hired || hired > m.end) return;
      if (separated && separated.getTime() > NULL_EPOCH && separated < m.start) return;
      count++;
      const g = cleanGender(genderByEmpNo[e.employeeNo]);
      if (g === 'Male') male++; else if (g === 'Female') female++;
      // VC and department for historical entries come straight from empHist's own
      // dimension1 (VC) / dimension2 (BU) — they may no longer be in the current
      // employee table at all, so the headcountRows-based lookup can't reach them.
      const vc = e.dimension1;
      if (vc === 'ETH') eth++; else if (vc === 'HUB') hub++;
      const sc = e.dimension2 || 'Unknown';
      // KFT_Employment_History itself has no employeeType field (its "classification" is
      // a payroll-source distinction, not Permanent/Contract/etc) — fall back to the
      // unfiltered headcountRows lookup, which now covers departed people too.
      bumpBU(byBU, sectionToDept[sc] || sc, vc, g, typeByEmpNo[e.employeeNo]);
      bumpGenderMap(byType, typeByEmpNo[e.employeeNo], g);
    });
    return { label: m.label, count, male, female, eth, hub, byBU, byType, byJobTitle: {} };
  });

  // ── Turnover rate (last 12 months) ──────────────────────────────────────────
  // Joiners = hired in that month; Leavers = separated in that month
  const allForJoiners = [
    ...employees.map(e => ({ no: e.no, hired: e.employmentDate })),
    ...empHist.filter(e => !activeNosSet.has(e.employeeNo)).map(e => ({ no: e.employeeNo, hired: e.dateHired }))
  ];
  const turnover = months12.map((m, i) => {
    const prevCount = i > 0 ? headcountEvolution[i - 1].count : headcountEvolution[0].count;
    const currCount = headcountEvolution[i].count;
    const avgCount  = (prevCount + currCount) / 2;

    const joiners = allForJoiners.filter(e => {
      const d = e.hired ? new Date(e.hired) : null;
      return d && d >= m.start && d <= m.end;
    }).length;

    const leavers = empHist.filter(e => {
      const d = e.dateSeparated ? new Date(e.dateSeparated) : null;
      return d && d.getTime() > NULL_EPOCH && d >= m.start && d <= m.end;
    }).length;

    const rate = avgCount > 0 ? +((leavers / avgCount) * 100).toFixed(1) : 0;
    return { label: m.label, joiners, leavers, rate };
  });

  // Trailing-12-month aggregate turnover rate, plus a variant that excludes Individual
  // Consultants from the headcount base. empHist (the leavers source above) has no
  // employeeType field and in practice almost never contains consultants at all — they
  // exit via payroll simply stopping, not a formal separation record — so the leavers
  // count is already consultant-free; only the headcount denominator differs here.
  const totalLeavers12mo = turnover.reduce((s, t) => s + t.leavers, 0);
  const avgHeadcount12mo = headcountEvolution.length > 0
    ? headcountEvolution.reduce((s, m) => s + m.count, 0) / headcountEvolution.length
    : 0;
  const avgNonAgentHeadcount12mo = headcountEvolution.length > 0
    ? headcountEvolution.reduce((s, m) => {
        const agents = m.byType?.['Individual Consultant'];
        const agentCount = agents ? (agents.male || 0) + (agents.female || 0) : 0;
        return s + (m.count - agentCount);
      }, 0) / headcountEvolution.length
    : 0;
  const turnoverRate12mo         = avgHeadcount12mo > 0 ? +((totalLeavers12mo / avgHeadcount12mo) * 100).toFixed(1) : 0;
  const turnoverRateNoAgents12mo = avgNonAgentHeadcount12mo > 0 ? +((totalLeavers12mo / avgNonAgentHeadcount12mo) * 100).toFixed(1) : 0;

  // ── Turnover / Monthly Hires by calendar year ─────────────────────────────────
  // Same reconstruction as headcountEvolution/turnover above, but aligned to actual
  // calendar years (Jan–Dec) instead of a rolling 12-month window — lets the frontend
  // show turnover/hires for "2025" or "2026" specifically instead of only the trailing
  // 12 months from today. The current month re-uses headcountEvolution's live bucket
  // (built from headcountRows) rather than recomputing it, so the two stay consistent.
  const buildYearMonths = (year) => {
    const lastMonth = year === targetDt.getFullYear() ? targetDt.getMonth() : 11;
    return Array.from({ length: lastMonth + 1 }, (_, i) => {
      const d = new Date(year, i, 1);
      return {
        label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end:   new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
      };
    });
  };
  const buildHistoricalBucket = (m) => {
    let count = 0, male = 0, female = 0, eth = 0, hub = 0;
    const byBU = {}, byType = {};
    employees.forEach(e => {
      if (e.employeeStatus !== 'Active') return;
      const hired = e.employmentDate ? new Date(e.employmentDate) : null;
      if (!(hired && hired <= m.end)) return;
      count++;
      const g = cleanGender(e.gender);
      if (g === 'Male') male++; else if (g === 'Female') female++;
      const vc = vcByEmpNo[e.no];
      if (vc === 'ETH') eth++; else if (vc === 'HUB') hub++;
      const type = e.employeeType || typeByEmpNo[e.no];
      bumpBU(byBU, buByEmpNo[e.no], vc, g, type);
      bumpGenderMap(byType, type, g);
    });
    empHist.forEach(e => {
      if (activeNosSet.has(e.employeeNo)) return;
      const hired     = e.dateHired     ? new Date(e.dateHired)     : null;
      const separated = e.dateSeparated ? new Date(e.dateSeparated) : null;
      if (!hired || hired > m.end) return;
      if (separated && separated.getTime() > NULL_EPOCH && separated < m.start) return;
      count++;
      const g = cleanGender(genderByEmpNo[e.employeeNo]);
      if (g === 'Male') male++; else if (g === 'Female') female++;
      const vc = e.dimension1;
      if (vc === 'ETH') eth++; else if (vc === 'HUB') hub++;
      const sc = e.dimension2 || 'Unknown';
      bumpBU(byBU, sectionToDept[sc] || sc, vc, g, typeByEmpNo[e.employeeNo]);
      bumpGenderMap(byType, typeByEmpNo[e.employeeNo], g);
    });
    return { label: m.label, count, male, female, eth, hub, byBU, byType, byJobTitle: {} };
  };

  const currentBucketLabel = months12[months12.length - 1].label;
  const currentBucketData  = headcountEvolution[headcountEvolution.length - 1];

  const yearsWithData = [];
  for (let y = new Date(CONFIG.PAYROLL_START).getFullYear(); y <= targetDt.getFullYear(); y++) yearsWithData.push(y);

  const turnoverByYear = {};
  const turnoverSummaryByYear = {};
  yearsWithData.forEach(year => {
    const yMonths = buildYearMonths(year);
    const series  = yMonths.map(m => m.label === currentBucketLabel ? currentBucketData : buildHistoricalBucket(m));

    turnoverByYear[year] = series.map((bucket, i) => {
      const m = yMonths[i];
      const prevCount = i > 0 ? series[i - 1].count : series[0].count;
      const avgCount  = (prevCount + bucket.count) / 2;
      const joiners = allForJoiners.filter(e => {
        const d = e.hired ? new Date(e.hired) : null;
        return d && d >= m.start && d <= m.end;
      }).length;
      const leavers = empHist.filter(e => {
        const d = e.dateSeparated ? new Date(e.dateSeparated) : null;
        return d && d.getTime() > NULL_EPOCH && d >= m.start && d <= m.end;
      }).length;
      const rate = avgCount > 0 ? +((leavers / avgCount) * 100).toFixed(1) : 0;
      return { label: bucket.label, joiners, leavers, rate };
    });

    const totalLeavers = turnoverByYear[year].reduce((s, t) => s + t.leavers, 0);
    const avgHC = series.length > 0 ? series.reduce((s, m) => s + m.count, 0) / series.length : 0;
    const avgNonAgentHC = series.length > 0
      ? series.reduce((s, m) => {
          const agents = m.byType?.['Individual Consultant'];
          const agentCount = agents ? (agents.male || 0) + (agents.female || 0) : 0;
          return s + (m.count - agentCount);
        }, 0) / series.length
      : 0;
    turnoverSummaryByYear[year] = {
      rate:         avgHC > 0 ? +((totalLeavers / avgHC) * 100).toFixed(1) : 0,
      rateNoAgents: avgNonAgentHC > 0 ? +((totalLeavers / avgNonAgentHC) * 100).toFixed(1) : 0,
    };
  });

  const hr = {
    sectionToDept,
    deptDisplayNames,
    total: IS_HISTORICAL
      ? (hrByStatus.Active || 0)
      : employees.filter(e => e.employeeStatus === 'Active').length,
    byStatus:         Object.entries(hrByStatus).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    byType:           Object.entries(hrByType).map(([type, v]) => ({ type, male: v.male, female: v.female, count: v.male + v.female })).sort((a, b) => b.count - a.count),
    byGender:         Object.entries(hrByGender).map(([gender, count]) => ({ gender, count })).sort((a, b) => b.count - a.count),
    byDept,
    byDeptHierarchy,
    byVirtualCompany: Object.entries(hrByVirtualCo).map(([virtualCompany, count]) => ({ virtualCompany, count })).sort((a, b) => b.count - a.count),
    byLocation,
    hqFieldSplit,
    byJobTitle,
    seniorityList,
    byDeptByType,
    allContractTypes,
    byDeptByStatus,
    headcountEvolution,
    turnover,
    turnoverRate12mo,
    turnoverRateNoAgents12mo,
    turnoverByYear,
    turnoverSummaryByYear,
    // Live per-employee active roster (from KFT_Employee_Headcount) — used by HR Page
    // Review to populate the employee drill-down for a month with headcount data but
    // no payroll data yet (e.g. the current in-progress month), including active
    // employees who have no payroll history at all yet and would otherwise be missing.
    activeRoster: headcountRows
      .filter(r => !r.employeeStatus || r.employeeStatus === 'Active')
      .map(r => {
        const sc = r.businessUnitDept || 'Unknown';
        return {
          employeeNo:  r.AuxiliaryIndex1 || '',
          name:        r.fullName || '',
          buCode:      sectionToDept[sc] || sc,
          sectionCode: sc,
          sectionName: dimensionNames[sc] || sc,
          jobTitle:    r.jobTitle || 'Unknown',
          vc:          r.virtualCompany || 'Unknown',
          type:        r.employeeType || 'Unknown'
        };
      })
      .filter(r => r.employeeNo)
  };

  // Payroll cost — standard (KIFIYA) + programme (SAFEE)
  // AL Query has no UNION, so we fetch both and merge here.
  let employeeCost = { byVirtualCompany: [], byDeptAndSource: [], monthly: [] };
  let hrReview     = { headcountMatrix: [], costMatrix: [], allEmployeeTypes: [], allVirtualCompanies: [], payrollMonths: [] };
  try {
    const payrollQueryNames = [
      'KFT_Payroll_Cost',              // 0 stdPay
      'KFT_Prog_Payroll_Cost',         // 1 progPay
      'KFT_Consultant_Payroll_Cost',   // 2 consPay
      'KFT_Payroll_Pension',           // 3 stdPension
      'KFT_Prog_Payroll_Pension',      // 4 progPension
      'KFT_Period_Trans_Verify',       // 5 stdPT  — raw component rows (KIFIYA)
      'KFT_Prog_Period_Trans_Verify'   // 6 progPT — raw component rows (SAFEE)
    ];
    const [stdPay, progPay, consPay, stdPension, progPension, stdPT, progPT] = await Promise.all(
      payrollQueryNames.map(name =>
        bcAvail
          ? bc(name).catch(err => {
              console.error(`  ERROR: BC query '${name}' failed — ${err.message || err}. Payroll data from this source will be MISSING from the snapshot.`);
              return [];
            })
          : Promise.resolve([])
      )
    );

    const payrollStart = new Date(CONFIG.PAYROLL_START);
    const targetEnd    = new Date(targetDate + 'T23:59:59');

    console.log(`  Payroll raw: KFT_Payroll_Cost=${stdPay.length} rows, KFT_Prog_Payroll_Cost=${progPay.length} rows, KFT_Consultant_Payroll_Cost=${consPay.length} rows`);
    if (stdPay.length === 0 && progPay.length === 0 && consPay.length === 0)
      console.warn('  WARNING: all payroll queries returned 0 rows — check BC web services are published');

    // ── Consultant payroll currency-gap fallback ──────────────────────────────
    // Some vouchers have blank CurrencyCode + 0 ExchangeRate (BC data-entry gap).
    // We infer the currency from the same consultant's nearest dated voucher.
    // The exchange rate is taken from other consultants in the same BATCH first
    // (most precise — same processing date), falling back to the same PayPeriod
    // if no other voucher in that batch has a valid rate.
    const batchRateFallback  = {}; // PayrollBatchNo → exchange rate
    const periodRateFallback = {}; // PayPeriod      → exchange rate (broader fallback)
    consPay.forEach(r => {
      const cur  = (r.CurrencyCode || '').trim().toUpperCase();
      const rate = Number(r.ExchangeRate) || 0;
      if (cur && cur !== 'ETB' && rate > 0) {
        if (!batchRateFallback[r.PayrollBatchNo])  batchRateFallback[r.PayrollBatchNo]  = rate;
        if (!periodRateFallback[r.PayPeriod])      periodRateFallback[r.PayPeriod]      = rate;
      }
    });
    const consPayByConsultant = {};
    consPay.forEach(r => {
      if (!r.ConsultantID) return;
      (consPayByConsultant[r.ConsultantID] ||= []).push(r);
    });
    const isForeignCurrencyGap = (r) => {
      const history = (consPayByConsultant[r.ConsultantID] || []).filter(x => (x.CurrencyCode || '').trim());
      if (history.length > 0) {
        const target = new Date(r.VoucherDate || 0).getTime();
        let nearest = history[0], nearestDiff = Infinity;
        history.forEach(h => {
          const diff = Math.abs(new Date(h.VoucherDate || 0).getTime() - target);
          if (diff < nearestDiff) { nearestDiff = diff; nearest = h; }
        });
        return (nearest.CurrencyCode || '').trim().toUpperCase() !== 'ETB';
      }
      // LineAmount is the MSP Lines amount — present even when FINPaymentHeader has no voucher
      return Number(r.Amount || r.LineAmount || 0) < 50000;
    };

    const allPay = [
      ...stdPay.map(r  => ({ ...r, payrollSource: 'KIFIYA' })),
      ...progPay.map(r => ({ ...r, payrollSource: 'SAFEE'  })),
      ...consPay.map(r => {
        // BC returns PascalCase field names matching the AL column definitions.
        // PayPeriod is "M-YYYY" (e.g. "9-2025") — convert to ISO "YYYY-MM-01" for date parsing.
        const rawPeriod   = String(r.PayPeriod || '');
        const periodMatch = rawPeriod.match(/^(\d{1,2})-(\d{4})$/);
        const payrollPeriod = periodMatch
          ? `${periodMatch[2]}-${String(periodMatch[1]).padStart(2, '0')}-01`
          : r.PayPeriod || null;

        const currency = (r.CurrencyCode || '').trim().toUpperCase();
        let   rate      = Number(r.ExchangeRate) || 0;
        let   isForeign = currency !== '' && currency !== 'ETB';

        if (currency === '' && rate === 0 && isForeignCurrencyGap(r)) {
          isForeign = true;
          rate = batchRateFallback[r.PayrollBatchNo] || periodRateFallback[r.PayPeriod] || 0;
          if (!rate) console.warn(`  WARNING: consultant ${r.ConsultantID} period ${r.PayPeriod} batch ${r.PayrollBatchNo} — inferred foreign currency but no fallback rate found; amount left unconverted`);
        }

        const toETB = v => (isForeign && rate > 0) ? Number(v) * rate : Number(v);
        // Prefer the actual payment voucher amount (FIN-Payments Header, now LeftOuterJoin).
        // Fall back to the MSP Lines amount when the voucher doesn't exist yet or was issued
        // in a later month — this ensures the consultant is counted in their MSP pay period.
        const rawAmount = Number(r.Amount || 0) || Number(r.LineAmount || 0);
        return {
          ...r,
          employeeNo:       r.ConsultantID,
          firstName:        r.ConsultantName || '',
          lastName:         '',
          employeeType:     'Individual Consultant',
          virtualCompany:   r.VirtualCompanyCode || 'Unknown',
          businessUnitDept: r.BusinessUnitCode   || 'Unknown',
          jobTitle:         '',
          totalEarning:     toETB(rawAmount),
          payrollPeriod,
          payrollSource:    'SAFEE'
        };
      })
    ].filter(r => {
      const st = (r.payrollStatus || '').toLowerCase();
      if (st === 'open' || st === 'pending approval') return false;
      if (!r.payrollPeriod) return true;
      const d = new Date(r.payrollPeriod);
      return d >= payrollStart && d <= targetEnd;
    });
    if (allPay.length === 0 && (stdPay.length + progPay.length + consPay.length) > 0)
      console.warn(`  WARNING: payroll rows fetched but all filtered out — check BC_PAYROLL_START (${CONFIG.PAYROLL_START}) and status values`);

    // Employer pension lookup: employeeNo|monthLabel → pension amount
    // Sourced from KFT_Payroll_Pension (Period Transactions) and KFT_Prog_Payroll_Pension.
    // Employer Amount may be stored as negative in BC; we take Math.abs().
    const pensionByEmpMonth = {};
    [...stdPension, ...progPension].forEach(r => {
      if (!r.payrollPeriod || !r.employeeNo || !r.employerPension) return;
      const d = new Date(r.payrollPeriod);
      if (isNaN(d.getTime())) return;
      const mthLbl = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const key = `${r.employeeNo}|${mthLbl}`;
      pensionByEmpMonth[key] = (pensionByEmpMonth[key] || 0) + Math.abs(r.employerPension);
    });

    // ── Period Transactions component lookup ──────────────────────────────────
    // Q50228/50229 return one row per wage-type component per employee per period
    // (no aggregation). We build two per-employee-per-month maps:
    //   ptGrossByEmpMonth   — sum of positive Amount values = gross earnings from PT
    //   ptEmployerByEmpMonth — sum of abs(Employer Amount) = all employer-side costs
    //
    // ptGross is compared against Lines.Total Earning in empPayMap below.
    // Any gap (ptGross > linesEarning) represents pay components that exist in
    // Period Transactions but are not captured in the Lines summary fields.
    // ptEmployer replaces pensionByEmpMonth when PT data is available because it
    // covers ALL employer-borne costs (pension + gratuity + any other employer items)
    // and is filtered to committed batches, unlike the unfiltered pension queries.
    const ptGrossByEmpMonth    = {};
    const ptEmployerByEmpMonth = {};
    [...stdPT, ...progPT].forEach(r => {
      if (!r.payrollPeriod || !r.employeeNo) return;
      const d = new Date(r.payrollPeriod);
      if (isNaN(d.getTime())) return;
      const mthLbl = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const key    = `${r.employeeNo}|${mthLbl}`;
      const amt    = Number(r.amount || 0);
      const empAmt = Math.abs(Number(r.employerAmount || 0));
      if (amt > 0) ptGrossByEmpMonth[key]    = (ptGrossByEmpMonth[key]    || 0) + amt;
      if (empAmt > 0) ptEmployerByEmpMonth[key] = (ptEmployerByEmpMonth[key] || 0) + empAmt;
    });
    const ptDataAvailable = (stdPT.length + progPT.length) > 0;
    if (ptDataAvailable) {
      console.log(`  Period Transactions: ${stdPT.length + progPT.length} component rows loaded (KIFIYA: ${stdPT.length}, SAFEE: ${progPT.length})`);
    } else {
      console.log('  Period Transactions: no rows — publish KFT_Period_Trans_Verify and KFT_Prog_Period_Trans_Verify as BC web services');
    }

    // Pension aggregations by dimension — built from raw pension arrays so source attribution
    // (KIFIYA vs SAFEE) is preserved without relying on the merged allPay loop.
    const pensionVCMap      = {};
    const pensionSrcMap     = {};
    const pensionEntSrcMap  = {};  // "vc|src" → amount
    const pensionDeptMap    = {};  // parentBU → { kifiya, safee }
    const pensionMthMap     = {};  // monthLabel → amount

    stdPension.forEach(r => {
      if (!r.payrollPeriod || !r.employerPension) return;
      const amt  = Math.abs(r.employerPension);
      const vc   = r.virtualCompany || 'Unknown';
      const d    = new Date(r.payrollPeriod);
      if (isNaN(d.getTime())) return;
      const mth  = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const dept = sectionToDept[r.businessUnitDept || 'Unknown'] || r.businessUnitDept || 'Unknown';
      pensionVCMap[vc]                 = (pensionVCMap[vc] || 0) + amt;
      pensionSrcMap['KIFIYA']          = (pensionSrcMap['KIFIYA'] || 0) + amt;
      pensionEntSrcMap[`${vc}|KIFIYA`] = (pensionEntSrcMap[`${vc}|KIFIYA`] || 0) + amt;
      if (!pensionDeptMap[dept]) pensionDeptMap[dept] = { kifiya: 0, safee: 0 };
      pensionDeptMap[dept].kifiya += amt;
      pensionMthMap[mth] = (pensionMthMap[mth] || 0) + amt;
    });

    progPension.forEach(r => {
      if (!r.payrollPeriod || !r.employerPension) return;
      const amt  = Math.abs(r.employerPension);
      const vc   = r.virtualCompany || 'Unknown';
      const d    = new Date(r.payrollPeriod);
      if (isNaN(d.getTime())) return;
      const mth  = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const dept = sectionToDept[r.businessUnitDept || 'Unknown'] || r.businessUnitDept || 'Unknown';
      pensionVCMap[vc]                = (pensionVCMap[vc] || 0) + amt;
      pensionSrcMap['SAFEE']          = (pensionSrcMap['SAFEE'] || 0) + amt;
      pensionEntSrcMap[`${vc}|SAFEE`] = (pensionEntSrcMap[`${vc}|SAFEE`] || 0) + amt;
      if (!pensionDeptMap[dept]) pensionDeptMap[dept] = { kifiya: 0, safee: 0 };
      pensionDeptMap[dept].safee += amt;
      pensionMthMap[mth] = (pensionMthMap[mth] || 0) + amt;
    });

    // Build headcount name → employeeType and name → jobTitle maps
    // Both use a shortKey (first + last) to handle 3-part Ethiopian names where
    // payroll stores firstName+lastName but headcount stores the full 3-part name.
    const hcTypeByName     = {};
    const hcJobTitleByName = {};
    headcountRows.forEach(r => {
      if (!r.fullName) return;
      const key   = r.fullName.trim().toLowerCase();
      const parts = r.fullName.trim().split(/\s+/);
      const short = parts.length >= 3 ? `${parts[0]} ${parts[parts.length - 1]}`.toLowerCase() : null;
      if (r.employeeType && r.employeeType !== 'Unknown') {
        if (!hcTypeByName[key]) hcTypeByName[key] = r.employeeType;
        if (short && !hcTypeByName[short]) hcTypeByName[short] = r.employeeType;
      }
      if (r.jobTitle && r.jobTitle !== 'Unknown') {
        if (!hcJobTitleByName[key]) hcJobTitleByName[key] = r.jobTitle;
        if (short && !hcJobTitleByName[short]) hcJobTitleByName[short] = r.jobTitle;
      }
    });

    // employeeNo → { vc, type, bu } straight from the employee table (KFT_Employee_Headcount,
    // keyed by AuxiliaryIndex1). This is the authoritative source for Virtual Company / Hub,
    // Business Unit, and Employment Type — payroll rows carry their own copies of these fields
    // but those can be stale or, for Individual Consultants, hardcoded/self-declared. Every
    // payroll-derived employee record below prefers this lookup and only falls back to the
    // payroll row's own fields for people who genuinely have no employee-table record
    // (e.g. external consultants who never appear in KFT_Employee_Headcount).
    const empNoToHC = {};
    headcountRows.forEach(r => {
      const no = r.AuxiliaryIndex1;
      if (!no || empNoToHC[no]) return;
      empNoToHC[no] = {
        vc:       r.virtualCompany   || 'Unknown',
        type:     r.employeeType     || 'Unknown',
        bu:       r.businessUnitDept || 'Unknown',
        jobTitle: r.jobTitle         || 'Unknown'
      };
    });

    // employeeNo → employeeType: employee table first (authoritative), then payroll row's
    // own field, then the headcount name-bridge for edge cases the ID lookup misses.
    const empNoToType = {};
    allPay.forEach(r => {
      if (!r.employeeNo || empNoToType[r.employeeNo]) return;
      const hc = empNoToHC[r.employeeNo];
      if (hc && hc.type !== 'Unknown') {
        empNoToType[r.employeeNo] = hc.type;
      } else if (r.employeeType && r.employeeType !== 'Unknown') {
        empNoToType[r.employeeNo] = r.employeeType;
      } else {
        const name = [r.firstName, r.lastName].filter(Boolean).join(' ').trim().toLowerCase();
        const t = hcTypeByName[name];
        if (t) empNoToType[r.employeeNo] = t;
      }
    });
    hr.empNoToType = empNoToType;

    // employeeNo → virtualCompany / businessUnitDept: same employee-table-first priority.
    const empNoToVC = {};
    const empNoToBU = {};
    allPay.forEach(r => {
      if (!r.employeeNo) return;
      const hc = empNoToHC[r.employeeNo];
      if (!empNoToVC[r.employeeNo]) empNoToVC[r.employeeNo] = (hc && hc.vc !== 'Unknown') ? hc.vc : (r.virtualCompany   || 'Unknown');
      if (!empNoToBU[r.employeeNo]) empNoToBU[r.employeeNo] = (hc && hc.bu !== 'Unknown') ? hc.bu : (r.businessUnitDept || 'Unknown');
    });

    // Individual Consultants are MSP/programme costs — reclassify any that ended up
    // in the KIFIYA source (e.g. appearing in standard payroll) to SAFEE so they show
    // in the correct column across all charts and filters.
    allPay.forEach(r => {
      if (r.payrollSource !== 'KIFIYA') return;
      const type = r.employeeType || empNoToType[r.employeeNo] || '';
      if (type === 'Individual Consultant') r.payrollSource = 'SAFEE';
    });

    // employeeNo → jobTitle ("Job Description") via headcount name bridge
    const empNoToJobTitle = {};
    allPay.forEach(r => {
      if (!r.employeeNo || empNoToJobTitle[r.employeeNo]) return;
      const name  = [r.firstName, r.lastName].filter(Boolean).join(' ').trim().toLowerCase();
      const title = hcJobTitleByName[name];
      if (title) empNoToJobTitle[r.employeeNo] = title;
    });
    hr.empNoToJobTitle = empNoToJobTitle;

    // ETH / HUB KPI card totals
    const vcMap = {};
    allPay.forEach(r => {
      const vc = r.virtualCompany || 'Unknown';
      vcMap[vc] = (vcMap[vc] || 0) + num(r.totalEarning);
    });

    // KIFIYA vs SAFEE cost split (for HR cost allocation pie)
    const srcMap = {};
    allPay.forEach(r => {
      const src = r.payrollSource || 'Unknown';
      srcMap[src] = (srcMap[src] || 0) + num(r.totalEarning);
    });

    // Entity × PayrollSource cross-tab: ETH/HUB × KIFIYA/SAFEE (count unique employees + total)
    const entitySrcMap = {};
    allPay.forEach(r => {
      const vc  = r.virtualCompany || 'Unknown';
      const src = r.payrollSource  || 'Unknown';
      const key = `${vc}|${src}`;
      if (!entitySrcMap[key]) entitySrcMap[key] = { entity: vc, source: src, total: 0, employees: new Set() };
      entitySrcMap[key].total += num(r.totalEarning);
      if (r.employeeNo) entitySrcMap[key].employees.add(r.employeeNo);
    });
    // Also build a per-employee set so we can say "employee X paid by KIFIYA and SAFEE"
    const empSourceMap = {};
    allPay.forEach(r => {
      const vc  = r.virtualCompany || 'Unknown';
      const src = r.payrollSource  || 'Unknown';
      const emp = r.employeeNo || 'Unknown';
      if (!empSourceMap[emp]) empSourceMap[emp] = { vc, sources: new Set() };
      empSourceMap[emp].sources.add(src);
    });
    // Flatten into array groupd by entity, with kifiya/safee columns
    const entitySrcGrouped = {};
    Object.values(entitySrcMap).forEach(v => {
      if (!entitySrcGrouped[v.entity]) entitySrcGrouped[v.entity] = { entity: v.entity, kifiyaTotal: 0, safeeTotal: 0, kifiyaCount: 0, safeeCount: 0 };
      const g = entitySrcGrouped[v.entity];
      if (v.source === 'KIFIYA') { g.kifiyaTotal += v.total; g.kifiyaCount = v.employees.size; }
      else                       { g.safeeTotal  += v.total; g.safeeCount  = v.employees.size; }
    });
    // KIFIYA vs SAFEE clustered bar — grouped by PARENT business unit (not section)
    const deptMap = {};
    allPay.forEach(r => {
      const sectionCode = r.businessUnitDept || 'Unknown';
      const dept        = sectionToDept[sectionCode] || sectionCode;
      const deptName    = deptDisplayNames[dept] || dimensionNames[dept] || dept;
      if (!deptMap[dept]) deptMap[dept] = { dept, deptName, kifiya: 0, safee: 0 };
      if (r.payrollSource === 'KIFIYA') deptMap[dept].kifiya += num(r.totalEarning);
      else                              deptMap[dept].safee  += num(r.totalEarning);
    });

    // Monthly trend line — one data point per payroll period
    const mthMap = {};
    allPay.forEach(r => {
      if (!r.payrollPeriod) return;
      const d     = new Date(r.payrollPeriod);
      const key   = d.getFullYear() * 100 + (d.getMonth() + 1);
      const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (!mthMap[key]) mthMap[key] = { key, label, total: 0 };
      mthMap[key].total += num(r.totalEarning);
    });

    // Inject employer pension into all snapshot-level cost aggregations
    Object.entries(pensionVCMap).forEach(([vc, amt]) => {
      vcMap[vc] = (vcMap[vc] || 0) + amt;
    });
    Object.entries(pensionSrcMap).forEach(([src, amt]) => {
      srcMap[src] = (srcMap[src] || 0) + amt;
    });
    Object.entries(pensionEntSrcMap).forEach(([key, amt]) => {
      const sep = key.lastIndexOf('|');
      const vc  = key.slice(0, sep);
      const src = key.slice(sep + 1);
      if (entitySrcGrouped[vc]) {
        if (src === 'KIFIYA') entitySrcGrouped[vc].kifiyaTotal += amt;
        else                  entitySrcGrouped[vc].safeeTotal  += amt;
      }
    });
    Object.entries(pensionDeptMap).forEach(([dept, p]) => {
      if (deptMap[dept]) {
        deptMap[dept].kifiya += p.kifiya;
        deptMap[dept].safee  += p.safee;
      }
    });
    Object.values(mthMap).forEach(m => {
      m.total += pensionMthMap[m.label] || 0;
    });

    // byEntitySource computed after pension injection so totals are pension-inclusive
    const byEntitySource = Object.values(entitySrcGrouped)
      .map(g => ({ entity: g.entity, kifiyaTotal: Math.round(g.kifiyaTotal), safeeTotal: Math.round(g.safeeTotal), kifiyaCount: g.kifiyaCount, safeeCount: g.safeeCount }))
      .sort((a, b) => (b.kifiyaTotal + b.safeeTotal) - (a.kifiyaTotal + a.safeeTotal));

    // Drill-down: dept → employee → per-month earnings (for the expandable cost table)
    const drillMap = {};
    allPay.forEach(r => {
      if (!r.payrollPeriod) return;
      const dept    = r.businessUnitDept || 'Unknown';
      const empKey  = r.employeeNo || 'Unknown';
      const name    = [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || empKey;
      const d       = new Date(r.payrollPeriod);
      const mthKey  = d.getFullYear() * 100 + (d.getMonth() + 1);
      const mthLbl  = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const earning = num(r.totalEarning);

      if (!drillMap[dept]) drillMap[dept] = {
        dept, deptName: dimensionNames[dept] || dept,
        employees: {}, monthTotals: {}, total: 0
      };
      const de = drillMap[dept];
      if (!de.employees[empKey]) de.employees[empKey] = { employeeNo: empKey, name, monthly: {}, mthKeys: {}, total: 0 };
      const ee = de.employees[empKey];

      // Pension: include once per employee per month. When an employee has rows from
      // multiple payroll sources (KIFIYA + SAFEE), both rows land on the same ee entry;
      // adding pension for each row would double-count it.
      const isFirstMonth = !Object.prototype.hasOwnProperty.call(ee.monthly, mthLbl);
      const pensionAmt   = isFirstMonth ? (pensionByEmpMonth[`${empKey}|${mthLbl}`] || 0) : 0;
      ee.monthly[mthLbl]    = (ee.monthly[mthLbl]    || 0) + earning + pensionAmt;
      ee.mthKeys[mthKey]    = mthLbl;
      ee.total             += earning + pensionAmt;
      de.monthTotals[mthLbl] = (de.monthTotals[mthLbl] || 0) + earning + pensionAmt;
      de.total             += earning + pensionAmt;
    });

    // Sorted unique month labels across all payroll data
    const mthKeyLblMap = {};
    allPay.forEach(r => {
      if (!r.payrollPeriod) return;
      const d = new Date(r.payrollPeriod);
      const k = d.getFullYear() * 100 + (d.getMonth() + 1);
      mthKeyLblMap[k] = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    });
    const payrollMonths = Object.entries(mthKeyLblMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, lbl]) => lbl);

    // Standard-only months (stdPay + progPay, excluding consPay).
    // Consultant payroll may have a more recent period than regular payroll;
    // using allPay months as the default would make all staff show zero cost
    // on HRPageReview when the consultant period is most recent.
    const stdMthKeyLblMap = {};
    [...stdPay, ...progPay].forEach(r => {
      if (!r.payrollPeriod) return;
      const st = (r.payrollStatus || '').toLowerCase();
      if (st === 'open' || st === 'pending approval') return;
      const d = new Date(r.payrollPeriod);
      if (isNaN(d.getTime())) return;
      const k = d.getFullYear() * 100 + (d.getMonth() + 1);
      stdMthKeyLblMap[k] = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    });
    const stdPayrollMonths = Object.entries(stdMthKeyLblMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, lbl]) => lbl);

    const drillDown = Object.values(drillMap)
      .sort((a, b) => b.total - a.total)
      .map(d => ({
        dept:        d.dept,
        deptName:    d.deptName,
        total:       Math.round(d.total),
        monthTotals: d.monthTotals,
        employees:   Object.values(d.employees)
          .sort((a, b) => (a.employeeNo || '').localeCompare(b.employeeNo || ''))
          .map(e => ({ employeeNo: e.employeeNo, name: e.name, monthly: e.monthly, total: Math.round(e.total) }))
      }));

    // 3-level hierarchy for Cost by BU page: parent BU → section → employee
    // Uses the same sectionToDept map built from dimension values
    const buDrillMap = {};
    allPay.forEach(r => {
      if (!r.payrollPeriod) return;
      // Group by the employee's home department from the employee table when known,
      // rather than whichever department the payroll transaction happened to post to.
      const hcBU        = empNoToHC[r.employeeNo || '']?.bu;
      const sectionCode = (hcBU && hcBU !== 'Unknown') ? hcBU : (r.businessUnitDept || 'Unknown');
      const buCode      = sectionToDept[sectionCode] || sectionCode;
      const buName      = deptDisplayNames[buCode] || dimensionNames[buCode] || buCode;
      const sectionName = dimensionNames[sectionCode] || sectionCode;
      const empKey  = r.employeeNo || 'Unknown';
      const name    = [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || empKey;
      const d       = new Date(r.payrollPeriod);
      const mthLbl  = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const earning = num(r.totalEarning);

      if (!buDrillMap[buCode]) buDrillMap[buCode] = { buCode, buName, sections: {}, monthTotals: {}, total: 0 };
      const bu = buDrillMap[buCode];
      bu.monthTotals[mthLbl] = (bu.monthTotals[mthLbl] || 0) + earning;
      bu.total += earning;

      if (!bu.sections[sectionCode]) bu.sections[sectionCode] = { sectionCode, sectionName, employees: {}, monthTotals: {}, total: 0 };
      const sec = bu.sections[sectionCode];
      sec.monthTotals[mthLbl] = (sec.monthTotals[mthLbl] || 0) + earning;
      sec.total += earning;

      if (!sec.employees[empKey]) sec.employees[empKey] = { employeeNo: empKey, name, vc: empNoToVC[empKey] || r.virtualCompany || 'Unknown', employeeType: empNoToType[empKey] || r.employeeType || '', monthly: {}, pensionMonthly: {}, total: 0, pension: 0, kifiya: 0, safee: 0 };
      const ee = sec.employees[empKey];
      ee.monthly[mthLbl] = (ee.monthly[mthLbl] || 0) + earning;
      ee.total += earning;
      if (r.payrollSource === 'KIFIYA') ee.kifiya += earning;
      else                              ee.safee  += earning;
      if (!Object.prototype.hasOwnProperty.call(ee.pensionMonthly, mthLbl)) {
        const pensionAmt = pensionByEmpMonth[`${empKey}|${mthLbl}`] || 0;
        ee.pensionMonthly[mthLbl] = pensionAmt;
        ee.pension += pensionAmt;
      }
    });

    const buDrillDown = Object.values(buDrillMap)
      .sort((a, b) => b.total - a.total)
      .map(bu => ({
        buCode:      bu.buCode,
        buName:      bu.buName,
        total:       Math.round(bu.total),
        monthTotals: bu.monthTotals,
        sections:    Object.values(bu.sections)
          .sort((a, b) => b.total - a.total)
          .map(sec => ({
            sectionCode:  sec.sectionCode,
            sectionName:  sec.sectionName,
            total:        Math.round(sec.total),
            monthTotals:  sec.monthTotals,
            employees:    Object.values(sec.employees)
              .sort((a, b) => (a.employeeNo || '').localeCompare(b.employeeNo || ''))
              .map(e => ({
                employeeNo:    e.employeeNo,
                name:          e.name,
                vc:            e.vc,
                employeeType:  e.employeeType || '',
                monthly:       e.monthly,
                pensionMonthly: Object.fromEntries(Object.entries(e.pensionMonthly || {}).map(([k, v]) => [k, Math.round(v)])),
                pension:       Math.round(e.pension || 0),
                total:         Math.round(e.total),
                kifiya:        Math.round(e.kifiya || 0),
                safee:         Math.round(e.safee  || 0)
              }))
          }))
      }));

    // Job type drill-down: jobTitle → employees → monthly costs
    const jobDrillMap = {};
    allPay.forEach(r => {
      if (!r.payrollPeriod) return;
      const jobTitle = (r.jobTitle || '').trim() || 'Unknown';
      const empKey   = r.employeeNo || 'Unknown';
      const name     = [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || empKey;
      const d        = new Date(r.payrollPeriod);
      const mthLbl   = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const earning  = num(r.totalEarning);
      if (!jobDrillMap[jobTitle]) jobDrillMap[jobTitle] = { jobTitle, employees: {}, monthTotals: {}, total: 0 };
      const jd = jobDrillMap[jobTitle];
      if (!jd.employees[empKey]) jd.employees[empKey] = { employeeNo: empKey, name, monthly: {}, total: 0 };
      const ee = jd.employees[empKey];
      ee.monthly[mthLbl] = (ee.monthly[mthLbl] || 0) + earning;
      ee.total           += earning;
      jd.monthTotals[mthLbl] = (jd.monthTotals[mthLbl] || 0) + earning;
      jd.total               += earning;
    });
    const byJobDrillDown = Object.values(jobDrillMap)
      .map(jd => ({
        jobTitle:    jd.jobTitle,
        total:       Math.round(jd.total),
        monthTotals: Object.fromEntries(Object.entries(jd.monthTotals).map(([k, v]) => [k, Math.round(v)])),
        employees:   Object.values(jd.employees)
          .map(e => ({
            employeeNo: e.employeeNo,
            name:       e.name,
            total:      Math.round(e.total),
            monthly:    Object.fromEntries(Object.entries(e.monthly).map(([k, v]) => [k, Math.round(v)]))
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => a.jobTitle.localeCompare(b.jobTitle));

    employeeCost = {
      byVirtualCompany: Object.entries(vcMap)
        .map(([virtualCompany, total]) => ({ virtualCompany, total: Math.round(total) }))
        .sort((a, b) => b.total - a.total),
      byPayrollSource: Object.entries(srcMap)
        .map(([source, total]) => ({ source, total: Math.round(total) }))
        .sort((a, b) => b.total - a.total),
      byEntitySource,
      byDeptAndSource: Object.values(deptMap)
        .sort((a, b) => (b.kifiya + b.safee) - (a.kifiya + a.safee)),
      monthly: Object.values(mthMap)
        .sort((a, b) => a.key - b.key)
        .map(({ label, total }) => ({ label, total: Math.round(total) })),
      drillDown,
      buDrillDown,
      byJobDrillDown,
      payrollMonths
    };

    // ── HR Page Review ────────────────────────────────────────────────────────
    // Step 1: headcount name → employeeType lookup (for joining onto payroll rows)
    // Index by both the full BC "Full Name" and a shortened first+last key so we
    // can match Ethiopian 3-part names whose payroll record only has first+last.
    const hcByName = {};
    headcountRows.forEach(r => {
      if (!r.fullName) return;
      const key = r.fullName.trim().toLowerCase();
      hcByName[key] = r.employeeType || 'Unknown';
      const parts = r.fullName.trim().split(/\s+/);
      if (parts.length >= 3) {
        const shortKey = `${parts[0]} ${parts[parts.length - 1]}`.toLowerCase();
        if (!hcByName[shortKey]) hcByName[shortKey] = r.employeeType || 'Unknown';
      }
    });

    // Step 2: per-employee payroll enriched with employeeType via name join.
    // Best-effort: try firstName+lastName match against headcount full names.
    // Unmatched rows still included (employeeType = 'Unknown') so cost data is never lost.
    const empPayMap = {};
    // Global set: tracks `${empKey}|${mthLbl}` to ensure employer pension is counted once per
    // employee per month even when the employee appears in multiple payroll sources (KIFIYA + SAFEE).
    // Since allPay = [...stdPay, ...progPay, ...consPay], KIFIYA rows process first,
    // so pension is attributed to the KIFIYA entry for cross-funded employees.
    const _pensionAccounted = new Set();
    allPay.forEach(r => {
      if (!r.payrollPeriod) return;
      const name    = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
      const empKey  = r.employeeNo || 'Unknown';
      const hc      = empNoToHC[empKey];
      // Employee table (KFT_Employee_Headcount, by ID) is authoritative. Fall back to the
      // payroll row's own field (e.g. 'Individual Consultant' on consPay rows, which have no
      // employee-table record), then the headcount name-bridge as a last resort.
      const et      = (hc && hc.type !== 'Unknown') ? hc.type
        : (r.employeeType && r.employeeType !== 'Unknown') ? r.employeeType
        : hcByName[name.toLowerCase()] || 'Unknown';
      // Group by the employee's home department from the employee table when known,
      // rather than whichever department the payroll transaction happened to post to.
      // sc is the raw section (e.g. "TEC-004"); buCode is its resolved parent BU.
      const sc          = (hc && hc.bu !== 'Unknown') ? hc.bu : (r.businessUnitDept || 'Unknown');
      const buCode      = sectionToDept[sc] || sc;
      const buName      = deptDisplayNames[buCode] || dimensionNames[buCode] || buCode;
      const sectionName = dimensionNames[sc] || sc;
      const jobTitle    = (hc && hc.jobTitle !== 'Unknown') ? hc.jobTitle
        : empNoToJobTitle[empKey] || historicalJobTitleByNo[empKey] || 'Unknown';
      const src     = r.payrollSource || 'KIFIYA';
      const vc      = ((hc && hc.vc !== 'Unknown') ? hc.vc : (r.virtualCompany || 'Unknown')).trim();
      const d       = new Date(r.payrollPeriod);
      const mthLbl  = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const earning = num(r.totalEarning);
      const key     = `${empKey}||${src}`;   // one record per employee per payroll source
      const status  = empStatusByNo[empKey] || 'Unknown';
      if (!empPayMap[key]) empPayMap[key] = {
        employeeNo: empKey, name, buCode, buName, sectionCode: sc, sectionName, jobTitle,
        payrollSource: src, virtualCompany: vc, employeeType: et, employeeStatus: status,
        monthTotals: {}, pensionMonthTotals: {}, total: 0, pensionTotal: 0
      };
      const e          = empPayMap[key];
      const ptKey      = `${empKey}|${mthLbl}`;
      // If Period Transactions data is available, use the gross from PT when it
      // exceeds Lines.Total Earning — this captures pay components that exist in
      // Period Transactions but are not reflected in the Lines summary fields.
      const ptGross    = ptDataAvailable ? (ptGrossByEmpMonth[ptKey] || 0) : 0;
      const effective  = ptGross > earning ? ptGross : earning;
      e.monthTotals[mthLbl] = (e.monthTotals[mthLbl] || 0) + effective;
      e.total += effective;
      if (!_pensionAccounted.has(ptKey)) {
        _pensionAccounted.add(ptKey);
        // Prefer status-filtered PT employer amounts (covers pension + all other employer costs).
        // Fall back to the unfiltered pension queries if PT data not yet published.
        const pensionAmt = ptDataAvailable
          ? (ptEmployerByEmpMonth[ptKey] || 0)
          : (pensionByEmpMonth[ptKey] || 0);
        e.pensionMonthTotals[mthLbl] = pensionAmt;
        e.pensionTotal += pensionAmt;
      }
    });
    const employeePayroll = Object.values(empPayMap).map(e => ({
      ...e,
      total:             Math.round(e.total),
      monthTotals:       Object.fromEntries(Object.entries(e.monthTotals).map(([k, v]) => [k, Math.round(v)])),
      pensionTotal:      Math.round(e.pensionTotal || 0),
      pensionMonthTotals: Object.fromEntries(Object.entries(e.pensionMonthTotals || {}).map(([k, v]) => [k, Math.round(v)]))
    }));

    // Step 3: headcountMatrix — buCode × employeeType × virtualCompany → count
    const hcMatrixMap = {};
    headcountRows.forEach(r => {
      if (r.employeeStatus && r.employeeStatus !== 'Active') return;
      const sc     = r.businessUnitDept || 'Unknown';
      const buCode = sectionToDept[sc] || sc;
      const buName = deptDisplayNames[buCode] || dimensionNames[buCode] || buCode;
      const et     = (r.employeeType || 'Unknown').trim();
      const vc     = (r.virtualCompany || 'Unknown').trim();
      const key    = `${buCode}||${et}||${vc}`;
      if (!hcMatrixMap[key]) hcMatrixMap[key] = { buCode, buName, employeeType: et, virtualCompany: vc, count: 0 };
      hcMatrixMap[key].count++;
    });

    const allEmployeeTypes = [...new Set([
      ...headcountRows.map(r => (r.employeeType || '').trim()),
      ...employeePayroll.map(e => e.employeeType)
    ].filter(t => t && t !== 'Unknown'))].sort();

    // Map GL salary totals (MGT_SAL accounts) to full month labels matching payrollMonths format
    const fyYear = new Date(CONFIG.FY_START).getFullYear();
    const fullMonthNames = ['January','February','March','April','May','June',
                            'July','August','September','October','November','December'];
    const glSalaryByMonth = {};
    fullMonthNames.forEach((name, i) => {
      glSalaryByMonth[`${name} ${fyYear}`] = Math.round(salM[i]);
    });

    hrReview = {
      headcountMatrix: Object.values(hcMatrixMap),
      employeePayroll,
      allEmployeeTypes,
      allVirtualCompanies: [...new Set(headcountRows.map(r => (r.virtualCompany || '').trim()).filter(Boolean))].sort(),
      payrollMonths,
      stdPayrollMonths,
      glSalaryByMonth
    };

    console.log(`  Payroll cost: ${allPay.length} rows, ${Object.keys(drillMap).length} depts, ${payrollMonths.length} months`);
  } catch (e) {
    console.warn('  Payroll cost fetch failed:', e.message);
  }

  const disbursementsYTD = toM(Math.abs(A('disbursements')));

  const lending = {
    disbursementsYTD,
  };

  // Superset charts — fetched daily alongside BC, stored in SQLite
  const [c1, c10, c15, c19, c23, c27, c29, c36, c37, c38,
         c53, c89, c95, c104, c106, c107] = await Promise.all([
    fetchSuperset(1),   fetchSuperset(10),  fetchSuperset(15),  fetchSuperset(19),
    fetchSuperset(23),  fetchSuperset(27),  fetchSuperset(29),  fetchSuperset(36),
    fetchSuperset(37),  fetchSuperset(38),
    fetchSuperset(53),  fetchSuperset(89),  fetchSuperset(95),
    fetchSuperset(104), fetchSuperset(106), fetchSuperset(107)
  ]);
  console.log(`  Superset: ${[c1,c10,c15,c19,c23,c27,c29,c36,c37,c38,c53,c89,c95,c104,c106,c107].filter(Boolean).length}/16 charts loaded`);

  const safeM = v => v != null ? toM(v) : null;

  const capDepSS = c38?.[0] ? {
    committed: safeM(c38[0]['Committed Amount']),
    deployed:  safeM(c38[0]['Deployed Amount']),
    undrawn:   safeM(c38[0]['Undrawn Amount']),
  } : null;
  const opIncomeSS = safeM(c23?.[0]?.['SUM(total_operating_income::NUMERIC)'] ?? null);

  // Monthly Kifiya share from chart 36 — filter to FY 2026 months up to targetDate
  const fyStartTs  = new Date(CONFIG.FY_START);
  const targetEndTs = new Date(targetDate + 'T23:59:59');
  const kifiyaMonthly = (c36 || [])
    .filter(r => {
      const d = new Date(r.month);
      return d >= fyStartTs && d <= targetEndTs && r['Total Kifiya Share'] != null;
    })
    .sort((a, b) => a.month - b.month)
    .map(r => ({
      label:  new Date(r.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      Amount: safeM(r['Total Kifiya Share'])
    }));

  // Chart 53 — average loan size in ETB (raw value, not divided by 1M)
  const avgLoanSize = c53?.[0] != null
    ? Math.round(Number(c53[0]['AVG(approved_amount::NUMERIC)']))
    : null;

  // Chart 89 — weekly disbursement trend from realtime_synced_fact (Jan 2026+)
  const weeklyDisbTrend = (c89 || [])
    .filter(r => r.disbursement_date != null)
    .sort((a, b) => new Date(a.disbursement_date) - new Date(b.disbursement_date))
    .slice(-16)
    .map(r => ({
      label:  new Date(r.disbursement_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      Amount: safeM(r['SUM(disbursed_amount::NUMERIC)'])
    }));

  // Chart 95 — YTD disbursements by partner bank (monthly_financial_reports via synced_fact)
  const disbByBankMap = {};
  (c95 || []).forEach(r => {
    if (!r['Disbursement Month'] || r['Disbursment Amount'] == null) return;
    const d = new Date(r['Disbursement Month']);
    if (d >= fyStartTs && d <= targetEndTs) {
      const b = r.bank_name;
      disbByBankMap[b] = (disbByBankMap[b] || 0) + Number(r['Disbursment Amount']);
    }
  });
  const disbByBank = Object.entries(disbByBankMap)
    .map(([bank, total]) => ({ bank, Amount: safeM(total) }))
    .sort((a, b) => b.Amount - a.Amount);

  // Chart 104 — monthly Revenue + Provision trend
  const provisionTrend = (c104 || [])
    .filter(r => {
      if (!r.month) return false;
      const d = new Date(r.month);
      return d >= fyStartTs && d <= targetEndTs;
    })
    .sort((a, b) => new Date(a.month) - new Date(b.month))
    .map(r => ({
      label:     new Date(r.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      Revenue:   safeM(r['100% revenue']),
      Provision: safeM(r['Provision amount']),
      ProvPct:   r['Provision %'] != null ? parseFloat(Number(r['Provision %']).toFixed(1)) : null
    }));

  // Chart 106 — latest provision % KPI (most recent month ≤ targetDate)
  const provPctRows = (c106 || [])
    .filter(r => r.month != null && new Date(r.month) <= targetEndTs)
    .sort((a, b) => new Date(b.month) - new Date(a.month));
  const provisionPct = provPctRows[0]?.['Provision %'] != null
    ? parseFloat(Number(provPctRows[0]['Provision %']).toFixed(1))
    : null;

  // Chart 107 — YTD revenue + provision by partner bank
  const revByBankMap = {};
  (c107 || []).forEach(r => {
    if (!r['Month'] || r['Revenue'] == null) return;
    const d = new Date(r['Month']);
    if (d >= fyStartTs && d <= targetEndTs) {
      const b = r['Bank Name'];
      if (!revByBankMap[b]) revByBankMap[b] = { Revenue: 0, Provision: 0 };
      revByBankMap[b].Revenue   += Number(r['Revenue']   || 0);
      revByBankMap[b].Provision += Number(r['Provision'] || 0);
    }
  });
  const revenueByBank = Object.entries(revByBankMap)
    .map(([bank, v]) => ({ bank, Revenue: safeM(v.Revenue), Provision: safeM(v.Provision) }))
    .sort((a, b) => b.Revenue - a.Revenue);

  const loanOps = {
    disbYTD:           safeM(c15?.[0]?.['SUM(approved_amount::NUMERIC)'] ?? null),
    disbYest:          safeM(c19?.[0]?.['SUM(approved_amount::NUMERIC)'] ?? null),
    kifiyaShare:       safeM(c29?.[0]?.['SUM(total_kifiya_share::NUMERIC)'] ?? null),
    opIncome:          opIncomeSS,
    capitalDeployment: capDepSS,
    kifiyaMonthly,
    avgLoanSize,
    weeklyDisbTrend,
    disbByBank,
    cashflowProjection: (c37 || []).map(row => ({
      label:  new Date(row.projection_month).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      Amount: safeM(row['Projected Cashflow'])
    }))
  };

  const rarRaw = c1?.[0] ? (Object.values(c1[0])[0] ?? null) : null;
  const risk = {
    riskAdjRevenueLTM:  safeM(rarRaw),
    riskAdjRevenueYTD:  (c10 || [])
      .filter(r => r.maturity_date != null)
      .sort((a, b) => new Date(a.maturity_date) - new Date(b.maturity_date))
      .map(r => ({
        label:   new Date(r.maturity_date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        Revenue: safeM(r.Revenue)
      })),
    netProfitBeforeTax: safeM(c27?.[0]?.['SUM(net_profit_before_tax::NUMERIC)'] ?? null),
    opIncome:           opIncomeSS,
    capitalDeployment:  capDepSS,
    provisionTrend,
    provisionPct,
  };

  return {
    asOf: new Date(targetDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    budgetActual,
    budgetOverview,
    corporateBudget,
    cashflow,
    reports,
    hr,
    hrReview,
    employeeCost,
    lending,
    loanOps,
    risk,
    dimensionNames,
    financialSS: { revenueByBank }
  };
}

module.exports = { buildSnapshot };

