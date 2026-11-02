// SAFEE Programme Budget — sourced from BC's KFT_SAFEE_Budget custom API page, which
// (unlike the plain KFT_GL_Budget used for the Corporate Budget page) carries the
// Program's own dimension breakdown: budgetDim1 (category group, e.g. "551" = Direct
// People Costs), budgetDim3 (category line, e.g. "551.01" = Program Director),
// budgetDim2 (Intervention, e.g. "SAF-I001"), and transactionType ("Allocation" =
// budgeted amount, "Commitment" = utilized/spent amount — Commitment rows come back
// negative, same debit/credit convention as everything else in this app, so utilized
// is always the absolute value). Category/Intervention display names aren't on the
// budget rows themselves — they're looked up from KFT_Dimension_Values, dimensionCode
// 'BUDGET LINE' (categories) and 'PROG INTERVENTION' (interventions).
const { bc } = require('./bc-client');

const num = n => Number(n) || 0;
const toM = v => Math.round(v / 1e6 * 100) / 100; // 2-decimal millions — matches the "23.21M" precision in the source report

// budgetName <-> Year label — confirmed against BC's own GetBudgetName/PROGRAMME
// dimension list ("10"/"10.2".."10.5" = "Year 1".."Year 5").
const BUDGET_YEARS = [
  { budgetName: '10',   label: 'Year 1' },
  { budgetName: '10.2', label: 'Year 2' },
  { budgetName: '10.3', label: 'Year 3' },
  { budgetName: '10.4', label: 'Year 4' },
  { budgetName: '10.5', label: 'Year 5' },
];

let _cache = null, _cacheAt = 0;
const TTL = 10 * 60 * 1000;
async function getSafeeStatic(bypassCache = false) {
  const now = Date.now();
  if (!bypassCache && _cache && now - _cacheAt < TTL) return _cache;
  const [budgetRows, dimValues] = await Promise.all([
    bc('KFT_SAFEE_Budget'),
    bc('KFT_Dimension_Values').catch(() => [])
  ]);
  _cache = { budgetRows, dimValues };
  _cacheAt = now;
  return _cache;
}

// Account name lookup for the Utilized-figure drilldown (Chart of Accounts, cached
// separately from the budget/dimension data above — it changes far less often).
let _acctCache = null, _acctCacheAt = 0;
const ACCT_TTL = 60 * 60 * 1000;
async function getAccountNames() {
  const now = Date.now();
  if (_acctCache && now - _acctCacheAt < ACCT_TTL) return _acctCache;
  const glAccounts = await bc('KFT_GL_Accounts').catch(() => []);
  const map = {};
  (glAccounts || []).forEach(a => { if (a.no) map[String(a.no).trim()] = a.name || ''; });
  _acctCache = map;
  _acctCacheAt = now;
  return map;
}

// Category GROUP codes on budget rows (budgetDim1) are bare numbers ("551"), but their
// display name lives on the dimension value "551.00" ("Direct People Costs") — indexed
// under both so a lookup by either the bare group code or the full line code works.
function categoryNames(dimValues) {
  const map = {};
  dimValues.filter(d => d.dimensionCode === 'BUDGET LINE').forEach(d => {
    const name = (d.name || d.code).trim();
    map[d.code] = name;
    const groupMatch = d.code.match(/^(\d+)\.00$/);
    if (groupMatch) map[groupMatch[1]] = name;
  });
  return map;
}
function interventionNames(dimValues) {
  const map = {};
  dimValues.filter(d => d.dimensionCode === 'PROG INTERVENTION').forEach(d => { map[d.code] = (d.name || d.code).trim(); });
  return map;
}
// globalDim2 codes on budget rows ("BUS-002", "CEO-001", ...) are department/business
// unit codes — same dimension HR/Financial Performance already resolve department
// names from elsewhere in this app, just under a different dimension code here.
function departmentNames(dimValues) {
  const map = {};
  dimValues.filter(d => d.dimensionCode === 'BUS UNIT & DEPART').forEach(d => { map[d.code] = (d.name || d.code).trim(); });
  return map;
}

// Business Unit -> section hierarchy for the Program Filter (same Begin-Total/section
// parsing convention as the HR module's own sectionToDept: BC sorts a dimension's
// values by code with parent "Begin-Total" rows (e.g. BUS-000) immediately before the
// child "Standard"/"Heading" sections that roll up under them, so a sequential scan
// pairs each section with whichever Begin-Total it follows).
function departmentHierarchy(dimValues) {
  const names = departmentNames(dimValues);
  const gd2 = dimValues.filter(d => d.dimensionCode === 'BUS UNIT & DEPART');
  const parentOf = {}, parentNames = {};
  let curParent = null;
  gd2.forEach(d => {
    const t = (d.dimensionValueType || '').replace(/[^a-z]/gi, '').toLowerCase();
    if (t === 'begintotal') {
      curParent = d.code;
      parentNames[d.code] = (d.name || d.code).trim();
    } else if (t !== 'total' && t !== 'endtotal' && d.code && curParent) {
      parentOf[d.code] = curParent;
    }
  });
  return { names, parentOf, parentNames };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Real calendar months (YYYY-MM) actually present in a budget year's own data,
// chronologically sorted — e.g. Year 3 runs December 2025 through November 2026, since
// budgetDate holds real calendar days (up to ~70 distinct days a year), not one
// first-of-month row per month. Index into this array is what the frontend's
// PeriodTree (same component/behavior as Financial Performance's Filter by Period)
// means by "month N" / "quarter N" — the Nth real month of THIS budget year's own
// ~12-month cycle, not a January-aligned calendar quarter (each SAFEE year starts on a
// different calendar month).
function monthsForYear(budgetRows, budgetName) {
  const rows = budgetRows.filter(r => r.budgetName === budgetName);
  const keys = [...new Set(rows.map(r => r.budgetDate.slice(0, 7)))].sort();
  return keys.map(key => {
    const [y, m] = key.split('-').map(Number);
    return { key, label: `${MONTH_NAMES[m - 1]} ${y}` };
  });
}

// selMonths: array of 0-based indices into `months` (PeriodTree's own selMonths shape)
// — empty/omitted means every month (YTD/full year).
function filterRowsByMonths(rows, months, selMonths) {
  if (!selMonths || selMonths.length === 0) return rows;
  const keep = new Set(selMonths.map(i => months[i]?.key).filter(Boolean));
  return rows.filter(r => keep.has(r.budgetDate.slice(0, 7)));
}

function sumBU(rows) {
  const budget = rows.filter(r => r.transactionType === 'Allocation').reduce((s, r) => s + num(r.amount), 0);
  const utilized = Math.abs(rows.filter(r => r.transactionType === 'Commitment').reduce((s, r) => s + num(r.amount), 0));
  return {
    budget: toM(budget), utilized: toM(utilized), unutilized: toM(budget - utilized),
    pctUtilized: budget ? +(utilized / budget * 100).toFixed(2) : null,
    pctUnutilized: budget ? +((budget - utilized) / budget * 100).toFixed(2) : null,
  };
}

// ── Overview: all 5 years at once, each independently scoped to its own Nth month/
// quarter (selMonths is relative — "month 0" means each year's own first real month,
// not a shared calendar date) ────────────────────────────────────────────────────────
async function buildOverview({ selMonths } = {}) {
  const { budgetRows } = await getSafeeStatic();
  const years = BUDGET_YEARS.map(y => {
    const months = monthsForYear(budgetRows, y.budgetName);
    const rows = budgetRows.filter(r => r.budgetName === y.budgetName);
    const scoped = filterRowsByMonths(rows, months, selMonths);
    return {
      budgetName: y.budgetName, label: y.label, hasData: months.length > 0,
      // Full year's own date span (not affected by selMonths) — "what date range do we
      // actually have for this budget year", shown next to the Select Budget picker.
      startDate: months[0]?.key || null, endDate: months[months.length - 1]?.key || null,
      startLabel: months[0]?.label || null, endLabel: months[months.length - 1]?.label || null,
      ...sumBU(scoped)
    };
  });
  const totalBudget = years.reduce((s, y) => s + y.budget, 0);
  const totalUtilized = years.reduce((s, y) => s + y.utilized, 0);
  return {
    years,
    totalBudget: +totalBudget.toFixed(2),
    totalUtilized: +totalUtilized.toFixed(2),
    totalUnutilized: +(totalBudget - totalUtilized).toFixed(2),
    pctUtilized: totalBudget ? +(totalUtilized / totalBudget * 100).toFixed(2) : null,
    pctUnutilized: totalBudget ? +((totalBudget - totalUtilized) / totalBudget * 100).toFixed(2) : null,
  };
}

// ── One budget year's full detail — powers every other tab (Program View,
// Intervention View, Budget Activity View, Program Activity Annual Summary, Program
// Activity vs Quarter, Program Activity vs Budget Intervention) in one payload, so
// switching tabs doesn't need another BC round trip. `team`/`intervention` are the
// Budget Activity View's own two filter dropdowns (globalDim2 and budgetDim2).
async function buildYearDetail({ budgetName, selMonths, team, intervention } = {}) {
  const { budgetRows, dimValues } = await getSafeeStatic();
  const catNames = categoryNames(dimValues);
  const intNames = interventionNames(dimValues);
  const { names: deptNames, parentOf: deptParentOf, parentNames: deptParentNames } = departmentHierarchy(dimValues);
  const months = monthsForYear(budgetRows, budgetName);
  const allRows = budgetRows.filter(r => r.budgetName === budgetName);
  let rows = filterRowsByMonths(allRows, months, selMonths);
  if (team) rows = rows.filter(r => r.globalDim2 === team);
  if (intervention) rows = rows.filter(r => r.budgetDim2 === intervention);

  // Quarters: groups of 3 consecutive real months of this budget year's own cycle —
  // "Quarter 1" is whichever 3 months the year actually starts with, not Jan-Mar.
  const quarterCount = Math.max(1, Math.ceil(months.length / 3));
  const quarters = Array.from({ length: quarterCount }, (_, q) => {
    const idxs = [q * 3, q * 3 + 1, q * 3 + 2].filter(i => i < months.length);
    return { q, idxs, label: `Quarter ${q + 1}` };
  }).filter(qt => qt.idxs.length > 0);

  // Category group (budgetDim1) -> lines (budgetDim3), each line with its own
  // per-quarter split (Program Activity vs Quarter Budgets Analysis).
  const byCat = {};
  rows.forEach(r => {
    const catCode = r.budgetDim1 || 'UNSPEC';
    const lineCode = r.budgetDim3 || catCode;
    (byCat[catCode] || (byCat[catCode] = { rows: [], lines: {} })).rows.push(r);
    const lines = byCat[catCode].lines;
    (lines[lineCode] || (lines[lineCode] = [])).push(r);
  });
  const categories = Object.entries(byCat).map(([code, g]) => {
    const lines = Object.entries(g.lines).map(([lineCode, lrows]) => {
      const byQuarter = quarters.map(qt => {
        const qrows = lrows.filter(r => {
          const idx = months.findIndex(m => m.key === r.budgetDate.slice(0, 7));
          return qt.idxs.includes(idx);
        });
        return { q: qt.q, label: qt.label, ...sumBU(qrows) };
      });
      return { code: lineCode, name: catNames[lineCode] || lineCode, ...sumBU(lrows), byQuarter };
    }).sort((a, b) => b.budget - a.budget);
    return { code, name: catNames[code] || code, ...sumBU(g.rows), lines };
  }).filter(c => c.budget !== 0 || c.utilized !== 0)
    .sort((a, b) => b.budget - a.budget);

  // Intervention (budgetDim2) breakdown, each with its own category sub-split
  // (Intervention View, Program Activity vs Budget Intervention).
  const byInt = {};
  rows.forEach(r => {
    const code = r.budgetDim2 || 'UNSPEC';
    (byInt[code] || (byInt[code] = { rows: [], byCat: {} })).rows.push(r);
    const catCode = r.budgetDim1 || 'UNSPEC';
    const byCatG = byInt[code].byCat;
    (byCatG[catCode] || (byCatG[catCode] = [])).push(r);
  });
  const interventions = Object.entries(byInt).map(([code, g]) => {
    const categories = Object.entries(g.byCat).map(([catCode, crows]) => ({
      code: catCode, name: catNames[catCode] || catCode, ...sumBU(crows)
    })).sort((a, b) => b.budget - a.budget);
    return { code, name: intNames[code] || code, ...sumBU(g.rows), categories };
  }).filter(i => i.budget !== 0 || i.utilized !== 0)
    .sort((a, b) => b.budget - a.budget);

  // Filter option lists for Budget Activity View, derived from the FULL year's data
  // (not the already-filtered `rows`) so picking one filter doesn't shrink the other's
  // own option list. "Program Filter" shows real department names (globalDim2 codes
  // resolved via the BUS UNIT & DEPART dimension), not raw codes like "BUS-002" —
  // grouped under their parent Business Unit (e.g. "CEO Office") so the dropdown reads
  // as Business Unit -> section rather than one flat alphabetical list.
  const teamOptions = [...new Set(allRows.map(r => r.globalDim2).filter(Boolean))]
    .map(code => {
      const parentCode = deptParentOf[code] || null;
      const group = parentCode ? (deptParentNames[parentCode] || parentCode) : (deptParentNames[code] || 'Other');
      return { code, name: deptNames[code] || code, group };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const interventionOptions = [...new Set(allRows.map(r => r.budgetDim2).filter(Boolean))]
    .map(code => ({ code, name: intNames[code] || code }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    budgetName, months, quarters: quarters.map(q => ({ q: q.q, label: q.label })),
    startLabel: months[0]?.label || null, endLabel: months[months.length - 1]?.label || null,
    totals: sumBU(rows), categories, interventions,
    filters: { teams: teamOptions, interventions: interventionOptions }
  };
}

// ── Click-the-Utilized-number drilldown: the real KFT_SAFEE_Budget Commitment rows
// (i.e. the Business Central entries actually summed into that line's "Utilized"
// figure) behind one category line, scoped the same way the line itself was —
// `rows` here is always already in memory from getSafeeStatic()'s one cached BC call,
// so this never costs an extra BC round trip beyond the (cached) account-name lookup.
async function buildCommitmentDrilldown({ budgetName, catCode, lineCode, selMonths, team, intervention } = {}) {
  const [{ budgetRows }, acctNames] = await Promise.all([getSafeeStatic(), getAccountNames()]);
  const months = monthsForYear(budgetRows, budgetName);
  const allRows = budgetRows.filter(r => r.budgetName === budgetName && r.transactionType === 'Commitment');
  let rows = filterRowsByMonths(allRows, months, selMonths);
  if (team) rows = rows.filter(r => r.globalDim2 === team);
  if (intervention) rows = rows.filter(r => r.budgetDim2 === intervention);
  if (catCode) rows = rows.filter(r => (r.budgetDim1 || 'UNSPEC') === catCode);
  if (lineCode) rows = rows.filter(r => (r.budgetDim3 || r.budgetDim1 || 'UNSPEC') === lineCode);

  const entries = rows
    .map(r => {
      const acctNo = String(r.accountNo || '').trim();
      return {
        date: r.budgetDate,
        accountNo: acctNo,
        accountName: acctNames[acctNo] || '',
        amount: Math.abs(num(r.amount)),
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const total = entries.reduce((s, e) => s + e.amount, 0);
  return { count: entries.length, total, entries };
}

module.exports = { buildOverview, buildYearDetail, buildCommitmentDrilldown, BUDGET_YEARS, getSafeeStatic, monthsForYear };
