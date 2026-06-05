/* ============================================================
   KIFIYA CEO DASHBOARD — BUSINESS CENTRAL ON-PREM PROXY
   (Node.js / Express)  ·  Auth: NavUserPassword (Basic Auth)
   ------------------------------------------------------------
   Connects to BC on-prem, queries the published AL query services
   (see bc-al/KftDashboardQueries.al), aggregates/joins them, and returns
   the JSON shape the dashboard expects. Adds CORS so the browser can read it.

   SETUP:
     1. Compile & publish bc-al/KftDashboardQueries.al to the ERP instance,
        and publish each query on the Web Services page with the Service Name
        shown in its AL comment header.
     2. cd proxy && cp .env.example .env  (values pre-filled from your Postman
        collection) — then swap in a dedicated read-only user's web access key.
     3. npm install && npm start
     4. Verify:  http://localhost:8080/probe   (should list your company)
     5. Set the >>> EDIT account ranges in CONFIG below to match your Chart
        of Accounts / Account Schedules.
     6. In the dashboard config.js: MODE:"live", PROXY_BASE:"http://localhost:8080"

   If any endpoint throws, that section falls back to demo data automatically
   (handled dashboard-side), so a partial wiring never breaks the screen.
   ============================================================ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

const app = express();
app.use(cors());
const PORT = process.env.PORT || 8080;

const { BC_BASE, BC_COMPANY, BC_USER, BC_KEY, BC_ALLOW_SELF_SIGNED } = process.env;
const httpsAgent = new https.Agent({ rejectUnauthorized: BC_ALLOW_SELF_SIGNED !== 'true' });
const AUTH = 'Basic ' + Buffer.from(`${BC_USER}:${BC_KEY}`).toString('base64');

/* ============================================================
   >>> EDIT: map your Chart of Accounts here. These ranges mirror your
   Account Schedule rows. Inclusive string compares on G/L account numbers.
   ============================================================ */
const CONFIG = {
  BUDGET_NAME: 'BUDGET 2026',           // >>> EDIT: your active G/L budget name
  FY_START: '2026-01-01',               // >>> EDIT: current fiscal year start
  ranges: {
    revenue:      ['4000', '4999'],     // >>> EDIT all ranges below
    costOfSales:  ['5000', '5499'],
    opex:         ['6000', '7799'],
    depAmort:     ['7800', '7899'],
    interestTax:  ['8000', '8499'],
    bankCash:     ['1000', '1099'],
    capex:        ['1500', '1699'],
    debt:         ['2400', '2499'],
    // balance-sheet groups for ratios:
    currentAssets:     ['1000', '1399'],
    inventory:         ['1300', '1399'],
    currentLiab:       ['2000', '2199'],
    totalLiabilities:  ['2000', '2999'],
    equity:            ['3000', '3999']
  }
};
const inRange = (acct, [lo, hi]) => acct >= lo && acct <= hi;
const num = n => Number(n) || 0;

/* ---- Generic OData GET against a published BC query/page ---- */
async function bc(service, query = '') {
  const url = `${BC_BASE}/Company('${encodeURIComponent(BC_COMPANY)}')/${service}${query}`;
  const r = await fetch(url, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
    agent: url.startsWith('https') ? httpsAgent : undefined
  });
  if (!r.ok) throw new Error(`BC ${r.status} on ${service}: ${(await r.text()).slice(0,300)}`);
  const j = await r.json();
  return j.value ?? j;
}

/* helper: sum rows whose account falls in a named range */
function sumRange(rows, rangeKey, acctField = 'accountNo', amtField = 'amount') {
  const rg = CONFIG.ranges[rangeKey];
  return rows.filter(x => inRange(String(x[acctField]), rg))
             .reduce((s, x) => s + num(x[amtField]), 0);
}
const toM = v => Math.round(v / 1_000_000 * 10) / 10;   // ETB → millions, 1dp

/* ============================================================
   /api/budget-actual
   Joins BudgetVsActual(actuals) + BudgetByCategory(budget) by range.
   Revenue/CoS/OpEx come straight from G/L; GP & EBITDA are derived.
   ============================================================ */
app.get('/api/budget-actual', async (req, res) => {
  try {
    const fyFilter = `?$filter=postingDate ge ${CONFIG.FY_START}`;
    const actuals = await bc('BudgetVsActual', fyFilter);
    const budgets = await bc('BudgetByCategory',
      `?$filter=budgetName eq '${encodeURIComponent(CONFIG.BUDGET_NAME)}'`);

    const A = k => sumRange(actuals, k);
    const B = k => sumRange(budgets, k);

    const revA = A('revenue'),  revB = B('revenue');
    const cosA = Math.abs(A('costOfSales')), cosB = Math.abs(B('costOfSales'));
    const expA = Math.abs(A('opex')),        expB = Math.abs(B('opex'));
    const gpA = revA - cosA,  gpB = revB - cosB;
    const ebitdaA = gpA - expA, ebitdaB = gpB - expB;

    const lines = [
      { name: 'Revenue',       budget: toM(revB),    actual: toM(revA),    higherIsBetter: true  },
      { name: 'Cost of Sales', budget: toM(cosB),    actual: toM(cosA),    higherIsBetter: false },
      { name: 'Expenses',      budget: toM(expB),    actual: toM(expA),    higherIsBetter: false },
      { name: 'Gross Profit',  budget: toM(gpB),     actual: toM(gpA),     higherIsBetter: true  },
      { name: 'EBITDA',        budget: toM(ebitdaB), actual: toM(ebitdaA), higherIsBetter: true  }
    ];
    res.json({ asOf: new Date().toLocaleDateString('en-GB'), lines });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   /api/budget-overview
   BudgetByUnit + UsedByUnit grouped by BUSINESSUNIT; MonthlyActual for line.
   ============================================================ */
app.get('/api/budget-overview', async (req, res) => {
  try {
    const bud = await bc('BudgetByUnit',
      `?$filter=budgetName eq '${encodeURIComponent(CONFIG.BUDGET_NAME)}'`);
    const used = await bc('UsedByUnit', `?$filter=postingDate ge ${CONFIG.FY_START}`);

    // group budget by unit
    const budMap = {}, usedMap = {};
    bud.forEach(x => { const u = x.unit || 'Unassigned'; budMap[u] = (budMap[u]||0) + num(x.budget); });
    used.forEach(x => { const u = x.unit || 'Unassigned'; usedMap[u] = (usedMap[u]||0) + Math.abs(num(x.used)); });

    const units = Object.keys(budMap);
    const byUnit = units.map(u => ({ unit: u, budget: toM(budMap[u]) }));
    const utilizationYTD = units.map(u => ({ unit: u, used: toM(usedMap[u]||0), budget: toM(budMap[u]) }));

    // monthly actual vs budget
    const monthlyActual = await bc('MonthlyBudgetActual', `?$filter=postingDate ge ${CONFIG.FY_START}`);
    const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const aByMonth = Array(12).fill(0);
    monthlyActual.forEach(x => {
      // count only P&L accounts toward the trend (revenue + cost + opex)
      const acct = String(x.accountNo);
      const isPL = inRange(acct,CONFIG.ranges.revenue)||inRange(acct,CONFIG.ranges.costOfSales)||inRange(acct,CONFIG.ranges.opex);
      if (!isPL) return;
      const m = new Date(x.postingDate).getMonth();
      aByMonth[m] += num(x.amount);
    });
    const lastMonth = new Date().getMonth();
    const labels = mNames.slice(0, lastMonth + 1);
    const actual = labels.map((_, i) => toM(Math.abs(aByMonth[i])));
    // simple budget line = total annual budget / 12 (replace with real monthly budget if you split it)
    const annualBudget = Object.values(budMap).reduce((s,v)=>s+v,0);
    const budget = labels.map(() => toM(annualBudget / 12));

    res.json({ byUnit, monthly: { labels, budget, actual }, utilizationYTD });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   /api/cashflow
   CashFlowSummary (category sums) + BankBalancesDaily (running balance).
   ============================================================ */
app.get('/api/cashflow', async (req, res) => {
  try {
    const gl = await bc('CashFlowSummary', `?$filter=postingDate ge ${CONFIG.FY_START}`);
    const collections  = Math.abs(sumRange(gl, 'bankCash'));   // refine with debit-only in AL if needed
    const capexOut     = Math.abs(sumRange(gl, 'capex'));
    const operatingOut = Math.abs(sumRange(gl, 'opex')) + Math.abs(sumRange(gl, 'costOfSales'));
    const debtUsed     = Math.abs(sumRange(gl, 'debt'));

    // bank ledger → daily running balance + per-bank collections
    const bank = await bc('BankLedger', `?$filter=postingDate ge ${CONFIG.FY_START}`);
    bank.sort((a,b)=> new Date(a.postingDate) - new Date(b.postingDate));
    let run = 0; const dayMap = {}; const bankMap = {};
    bank.forEach(x => {
      run += num(x.amount);
      const d = String(x.postingDate).slice(0,10);
      dayMap[d] = run;                                   // last balance of the day
      if (num(x.amount) > 0) {                           // inflow = collection
        const b = x.bankAccountNo || 'Other';
        bankMap[b] = (bankMap[b]||0) + num(x.amount);
      }
    });
    const days = Object.keys(dayMap).sort().slice(-30);
    const bankDaily = { labels: days.map(d=>d.slice(8,10)), balances: days.map(d=>toM(dayMap[d])) };
    const collectionsByBank = Object.entries(bankMap)
      .map(([bank,amount])=>({ bank, amount: toM(amount) }))
      .sort((a,b)=>b.amount-a.amount).slice(0,6);

    res.json({
      bankDaily,
      collectionsByBank,
      flows: { collections: toM(collections), otherInflows: 0, operatingOut: toM(operatingOut), capexOut: toM(capexOut) },
      debtUtilisation:  { used: toM(debtUsed), facility: toM(debtUsed) || 1 },  // >>> EDIT facility if you track a limit
      capexUtilisation: { used: toM(capexOut), budget: toM(capexOut) || 1 }     // >>> EDIT capex budget
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   /api/reports
   PnLBridge (P&L waterfall + margins) + BalanceSheetRatios (ratios).
   ============================================================ */
app.get('/api/reports', async (req, res) => {
  try {
    const pl = await bc('PnLBridge', `?$filter=postingDate ge ${CONFIG.FY_START}`);
    const S = k => pl.filter(x => inRange(String(x.accountNo), CONFIG.ranges[k]))
                     .reduce((s,x)=> s + num(x.amount), 0);
    const rev = S('revenue'), cos = Math.abs(S('costOfSales')), op = Math.abs(S('opex'));
    const da = Math.abs(S('depAmort')), it = Math.abs(S('interestTax'));
    const gp = rev - cos, ebitda = gp - op, net = ebitda - da - it;

    const plBridge = [
      { name:'Revenue',        value: toM(rev),    type:'total' },
      { name:'Cost of Sales',  value: -toM(cos),   type:'neg' },
      { name:'Gross Profit',   value: toM(gp),     type:'subtotal' },
      { name:'Operating Exp.', value: -toM(op),    type:'neg' },
      { name:'EBITDA',         value: toM(ebitda), type:'subtotal' },
      { name:'D&A',            value: -toM(da),    type:'neg' },
      { name:'Interest & Tax', value: -toM(it),    type:'neg' },
      { name:'Net Profit',     value: toM(net),    type:'total' }
    ];

    // balance sheet ratios
    const bs = await bc('BalanceSheetRatios');
    const G = k => bs.filter(x => inRange(String(x.accountNo), CONFIG.ranges[k]))
                     .reduce((s,x)=> s + num(x.balance), 0);
    const ca = G('currentAssets'), inv = G('inventory'), cl = Math.abs(G('currentLiab'));
    const liab = Math.abs(G('totalLiabilities')), eq = Math.abs(G('equity'));
    const pct = (n,d) => d ? (n/d*100).toFixed(1)+'%' : 'n/a';
    const rat = (n,d) => d ? (n/d).toFixed(2) : 'n/a';

    const ratios = [
      { label:'Gross Margin',  value: pct(gp, rev),     trend: 0 },
      { label:'EBITDA Margin', value: pct(ebitda, rev), trend: 0 },
      { label:'Net Margin',    value: pct(net, rev),    trend: 0 },
      { label:'Current Ratio', value: rat(ca, cl),      trend: 0 },
      { label:'Quick Ratio',   value: rat(ca-inv, cl),  trend: 0 },
      { label:'Debt / Equity', value: rat(liab, eq),    trend: 0 }
    ];

    // management summary
    const management = [
      { metric:'Revenue',        month: 0, last: 0, ytd: toM(rev),    vsBudget: 0 },
      { metric:'Gross Profit',   month: 0, last: 0, ytd: toM(gp),     vsBudget: 0 },
      { metric:'EBITDA',         month: 0, last: 0, ytd: toM(ebitda), vsBudget: 0 },
      { metric:'Operating Exp.', month: 0, last: 0, ytd: toM(op),     vsBudget: 0 },
      { metric:'Net Profit',     month: 0, last: 0, ytd: toM(net),    vsBudget: 0 }
    ];

    res.json({ ratios, pl: plBridge, management });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* connectivity probe — verifies auth + reachability before GL mapping */
app.get('/probe', async (req, res) => {
  try {
    const url = `${BC_BASE}/Company`;
    const r = await fetch(url, { headers:{ Authorization: AUTH, Accept:'application/json' },
      agent: url.startsWith('https') ? httpsAgent : undefined });
    res.status(r.ok ? 200 : r.status).json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message,
    hint:'Check BC_BASE host/port, network reachability (VPN/LAN), and credentials.' }); }
});

app.get('/health', (_, res) => res.json({ ok:true, mode:'bc-onprem', company:BC_COMPANY }));
app.listen(PORT, () => console.log(`Kifiya BC on-prem proxy on :${PORT}`));
