const { bc } = require('./bc-client');

const CONFIG = {
  BUDGET_NAME: process.env.BC_BUDGET_NAME || '20.1',
  FY_START:    process.env.BC_FY_START    || '2026-01-01',
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

  const actuals = await bc('KFT_GL_Actuals', fy);
  const budgets = await bc('KFT_GL_Budget', budF);
  console.log(`  BC: actuals ${actuals.length} rows, budget ${budgets.length} rows`);
  if (actuals.length === 0) console.warn('  WARNING: 0 actual rows — check FY_START / postingDate filter.');
  if (budgets.length === 0) console.warn(`  WARNING: 0 budget rows — check BUDGET_NAME='${CONFIG.BUDGET_NAME}'.`);

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

  const budgetActual = { lines: [
    { name: 'Revenue',       budget: toM(revB),  actual: toM(revA),  higherIsBetter: true  },
    { name: 'Cost of Sales', budget: toM(cosB),  actual: toM(cosA),  higherIsBetter: false },
    { name: 'Expenses',      budget: toM(totOpexB), actual: toM(totOpexA), higherIsBetter: false },
    { name: 'Gross Profit',  budget: toM(gpB),   actual: toM(gpA),   higherIsBetter: true  },
    { name: 'EBITDA',        budget: toM(ebB),   actual: toM(ebA),   higherIsBetter: true  }
  ]};

  const bm = {}, um = {};
  budgets.forEach(x => { const u = x.globalDim2 || 'Unassigned'; bm[u] = (bm[u] || 0) + Math.abs(num(x.amount)); });
  actuals.forEach(x => {
    const a = String(x.accountNo);
    if (inRange(a, CONFIG.ranges.cosBpass) || inRange(a, CONFIG.ranges.cosProduct) ||
        inRange(a, CONFIG.ranges.salaries) || inRange(a, CONFIG.ranges.opexA) || inRange(a, CONFIG.ranges.opexB)) {
      const u = x.globalDim2 || 'Unassigned';
      um[u] = (um[u] || 0) + Math.abs(num(x.amount));
    }
  });
  const units = Object.keys(bm).filter(u => bm[u] > 0);
  const byUnit = units.map(u => ({ unit: u, budget: toM(bm[u]) }));
  const utilizationYTD = units.map(u => ({ unit: u, used: toM(um[u] || 0), budget: toM(bm[u]) }));

  const mN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const aMonth = Array(12).fill(0), bMonth = Array(12).fill(0);
  const isPL = a => inRange(a, CONFIG.ranges.revenue) || inRange(a, CONFIG.ranges.cosBpass) ||
    inRange(a, CONFIG.ranges.cosProduct) || inRange(a, CONFIG.ranges.salaries) ||
    inRange(a, CONFIG.ranges.opexA) || inRange(a, CONFIG.ranges.opexB);
  actuals.forEach(x => { if (isPL(String(x.accountNo)) && x.postingDate)
    aMonth[new Date(x.postingDate).getMonth()] += num(x.amount); });
  budgets.forEach(x => { if (isPL(String(x.accountNo)) && x.budgetDate)
    bMonth[new Date(x.budgetDate).getMonth()] += num(x.amount); });
  const lm = new Date(targetDate + 'T12:00:00').getMonth();
  const labels = mN.slice(0, lm + 1);

  const disbByMonth = Array(12).fill(0);
  actuals.forEach(x => {
    const a = String(x.accountNo);
    if (a >= '6021' && a <= '6022' && x.postingDate)
      disbByMonth[new Date(x.postingDate).getMonth()] += Math.abs(num(x.amount));
  });

  const budgetOverview = {
    byUnit,
    monthly: {
      labels,
      budget: labels.map((_, i) => toM(Math.abs(bMonth[i]))),
      actual: labels.map((_, i) => toM(Math.abs(aMonth[i])))
    },
    utilizationYTD
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

  const bank = await bc('KFT_Bank_Ledger', fy);
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
    const glE = await bc('KFT_GL_Entries',
      `?$filter=incomeBalance eq 'Balance Sheet' and postingDate le ${targetDate}`);
    const bsMap = {};
    glE.forEach(e => { const k = String(e.accountNo); bsMap[k] = (bsMap[k] || 0) + num(e.amount); });
    bsRows = Object.entries(bsMap).map(([accountNo, balance]) => ({ accountNo, balance }));
  } else {
    bsRows = await bc('KFT_GL_Balances');
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
      { metric: 'Revenue',        month: 0, last: 0, ytd: toM(revA),      vsBudget: revB ? +(((revA - revB) / revB) * 100).toFixed(1) : 0 },
      { metric: 'Gross Profit',   month: 0, last: 0, ytd: toM(gpA),       vsBudget: gpB ? +(((gpA - gpB) / gpB) * 100).toFixed(1) : 0 },
      { metric: 'EBITDA',         month: 0, last: 0, ytd: toM(ebA),       vsBudget: ebB ? +(((ebA - ebB) / ebB) * 100).toFixed(1) : 0 },
      { metric: 'Operating Exp.', month: 0, last: 0, ytd: toM(totOpexA),  vsBudget: totOpexB ? +(((totOpexA - totOpexB) / totOpexB) * 100).toFixed(1) : 0 },
      { metric: 'Net Profit',     month: 0, last: 0, ytd: toM(netA),      vsBudget: netB ? +(((netA - netB) / netB) * 100).toFixed(1) : 0 }
    ]
  };

  const employees = await bc('GetEmployee');
  const hrByStatus = {}, hrByType = {}, hrByGender = {};

  if (IS_HISTORICAL) {
    const currentActiveNos = new Set();
    employees.forEach(e => {
      if (e.employeeStatus !== 'Active') return;
      const hired = String(e.employmentDate || '').slice(0, 10);
      if (!hired || hired > targetDate) return;
      currentActiveNos.add(e.no);
      hrByStatus.Active = (hrByStatus.Active || 0) + 1;
      const t = e.employeeType || 'Unknown'; hrByType[t] = (hrByType[t] || 0) + 1;
      const g = e.gender || 'Unknown';       hrByGender[g] = (hrByGender[g] || 0) + 1;
    });
    const empHist = await bc('KFT_Employment_History');
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
        const t = e.employeeType || 'Unknown'; hrByType[t] = (hrByType[t] || 0) + 1;
        const g = e.gender || 'Unknown';       hrByGender[g] = (hrByGender[g] || 0) + 1;
      }
    });
  }

  const hr = {
    total: IS_HISTORICAL
      ? (hrByStatus.Active || 0)
      : employees.filter(e => e.employeeStatus === 'Active').length,
    byStatus: Object.entries(hrByStatus).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    byType:   Object.entries(hrByType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    byGender: Object.entries(hrByGender).map(([gender, count]) => ({ gender, count })).sort((a, b) => b.count - a.count)
  };

  let dimensionNames = {};
  try {
    const dimVals = await bc('KFT_Dimension_Values');
    dimVals.forEach(d => { if (d.code && d.name && !d.blocked) dimensionNames[d.code] = d.name; });
  } catch (e) {
    console.warn('  KFT_Dimension_Values not reachable:', e.message);
  }

  const disbursementsYTD = toM(Math.abs(A('disbursements')));

  let loanPortfolio = null;
  try {
    const [loanAccts, overdueLoans] = await Promise.all([
      bc('KFT_Loan_Accounts'),
      bc('KFT_Overdue_Loans')
    ]);
    const grossPortfolio = toM(loanAccts.reduce((s, x) => s + num(x.outstandingBalance), 0));
    const activeBorrowers = new Set(loanAccts.map(x => x.customerNo)).size;
    const overdueBalance  = toM(overdueLoans.reduce((s, x) => s + num(x.overdueBalance), 0));
    const overdueBorrowers = new Set(overdueLoans.map(x => x.customerNo)).size;
    const parPct = grossPortfolio > 0 ? +(overdueBalance / grossPortfolio * 100).toFixed(1) : 0;
    const byUnitMap = {};
    loanAccts.forEach(x => {
      const u = x.globalDim2 || 'Other';
      byUnitMap[u] = (byUnitMap[u] || 0) + num(x.outstandingBalance);
    });
    const portfolioByUnit = Object.entries(byUnitMap)
      .map(([unit, bal]) => ({ unit, balance: toM(bal) }))
      .sort((a, b) => b.balance - a.balance);
    loanPortfolio = { grossPortfolio, activeBorrowers, overdueBalance, overdueBorrowers, parPct, portfolioByUnit };
  } catch (e) {
    console.warn('  Loan portfolio not loaded:', e.message);
  }

  const lending = {
    disbursementsYTD,
    monthlyDisburse: { labels, data: labels.map((_, i) => toM(disbByMonth[i])) },
    ...(loanPortfolio ? { loanPortfolio } : {})
  };

  return {
    asOf: new Date(targetDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    budgetActual,
    budgetOverview,
    cashflow,
    reports,
    hr,
    lending,
    dimensionNames
  };
}

module.exports = { buildSnapshot };
