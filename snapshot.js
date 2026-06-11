/* ============================================================
   KIFIYA CEO DASHBOARD — SNAPSHOT GENERATOR
   ------------------------------------------------------------
   Run this on a machine WITH access to BC (internal network or VPN).
   It queries Business Central, aggregates the figures, and OVERWRITES
   ../data.js with a fresh snapshot. The dashboard then reads that file
   directly — no proxy, no live API, viewable from anywhere.

   USAGE
     1. cd snapshot && cp .env.example .env  -> fill BC_USER + BC_KEY
        (BC_BASE is the INTERNAL address; you must be on VPN/LAN to run this).
     2. npm install
     3. node snapshot.js
        -> prints what it fetched and rewrites ../data.js
     4. Open ../index.html — it shows the snapshot. Done.
     5. Schedule it (Task Scheduler / cron) to refresh, e.g. 6am & 12pm.

   The dashboard's config.js MODE can stay "demo" — it always reads data.js,
   and this script makes data.js contain real numbers.
   ============================================================ */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
// Node 18+ has fetch built in; fall back to node-fetch on older runtimes.
const fetch = globalThis.fetch
  ? (...a) => globalThis.fetch(...a)
  : (...a) => import('node-fetch').then(({ default: f }) => f(...a));

const { BC_BASE, BC_COMPANY, BC_USER, BC_KEY, BC_ALLOW_SELF_SIGNED } = process.env;
const httpsAgent = new https.Agent({ rejectUnauthorized: BC_ALLOW_SELF_SIGNED !== 'true' });
const AUTH = 'Basic ' + Buffer.from(`${BC_USER}:${BC_KEY}`).toString('base64');

/* ============================================================
   CONFIG — derived from Kifiya's actual Chart of Accounts,
   Account Schedule (M-MGT-RPT) and G/L Budgets.
   EBITDA follows M-MGT-RPT: GP - Salaries(8010..8109) - OtherOpex.
   Ranges are inclusive string compares on G/L account No.
   ============================================================ */
const CONFIG = {
  BUDGET_NAME: '20.1',                  // 2026 Jan–Dec budget (from G/L Budgets)
  FY_START: '2026-01-01',
  ranges: {
    revenue:      ['5000', '5999'],     // 5013-5025 revenue lines (5101, 5105 etc also post here)
    // CoS split to exclude 6021/6022 (loan disbursements / agent settlements — B/S flows, not P&L)
    cosBpass:     ['6010', '6020'],     // BPASS-related direct costs (6011-6016)
    cosProduct:   ['6050', '6059'],     // Product costs per M-MGT-RPT (6051-6057)
    salaries:     ['8101', '8108'],     // Salary OpEx per M-MGT-RPT (8101-8106; 8109 is total row)
    // Operating expenses EXCLUDING salaries, depreciation and financial costs:
    opexA:        ['7000', '8100'],     // selling/distribution + other (7000-7099, 8241, 8245)
    opexB:        ['8110', '9199'],     // insurance, repairs, travel, utilities, misc (8199-9025)
    depAmort:     ['9210', '9299'],     // Depreciation
    finCosts:     ['9510', '9599'],     // Other Financial Costs (9559/9599)
    // Cash & bank
    bankCash:     ['2460', '2990'],
    // Debt (short-term overdraft/loans + long-term loans)
    debtShort:    ['3410', '3459'],
    debtLong:     ['3700', '3749'],
    // CAPEX proxy — Work in Progress
    wip:          ['1500', '1599'],
    // Loan disbursements (excluded from P&L CoS but real ETB outflows)
    disbursements:    ['6021', '6022'],
    // Balance-sheet groups for ratios
    currentAssets:    ['2000', '2995'],
    inventory:        ['2410', '2459'],
    currentLiab:      ['3005', '3599'],
    totalLiabilities: ['3000', '3999'],
    equity:           ['4000', '4999']
  },
  DEBT_FACILITY: null,   // >>> EDIT: approved debt facility in ETB millions (gauge max); null = show used vs used
  CAPEX_BUDGET: null,    // >>> EDIT: annual CAPEX budget in ETB millions; null = show used vs used

  // No config needed — snapshot fetches all dimension values from KFT_Dimension_Values
  // and builds a code → name lookup automatically.
};

const inRange = (a,[lo,hi]) => a >= lo && a <= hi;
const num = n => Number(n) || 0;
const toM = v => Math.round(v / 1e6 * 10) / 10;

async function bc(service, query) {
  query = query || '';
  let url = `${BC_BASE}/Company('${encodeURIComponent(BC_COMPANY)}')/${service}${query}`;
  let all = [];
  // BC OData returns at most ~max-page-size rows per response and gives a
  // @odata.nextLink to fetch the rest. Follow it so totals aren't truncated.
  for (let page = 0; url && page < 200; page++) {
    const r = await fetch(url, { headers:{ Authorization:AUTH, Accept:'application/json' },
      agent: url.startsWith('https') ? httpsAgent : undefined });
    if (!r.ok) throw new Error(`BC ${r.status} on ${service}: ${(await r.text()).slice(0,200)}`);
    const j = await r.json();
    const rows = j.value || j;
    if (Array.isArray(rows)) all = all.concat(rows); else return rows;
    url = j['@odata.nextLink'] || null;
  }
  return all;
}
const sumRange = (rows,k,af,amf) => {
  af = af || 'accountNo'; amf = amf || 'amount';
  return rows.filter(x => inRange(String(x[af]), CONFIG.ranges[k])).reduce((s,x)=>s+num(x[amf]),0);
};

async function build() {
  const fy = `?$filter=postingDate ge ${CONFIG.FY_START}`;
  const budF = `?$filter=budgetName eq '${encodeURIComponent(CONFIG.BUDGET_NAME)}'`;

  // Two core feeds: actuals-by-account and budget-by-account.
  const actuals = await bc('KFT_GL_Actuals', fy);
  const budgets = await bc('KFT_GL_Budget', budF);
  console.log(`  fetched: actuals ${actuals.length} rows, budget ${budgets.length} rows`);
  if (actuals.length === 0) console.warn('  WARNING: 0 actual rows — check FY_START date filter / postingDate field.');
  if (budgets.length === 0) console.warn(`  WARNING: 0 budget rows — check BUDGET_NAME='${CONFIG.BUDGET_NAME}' matches BC exactly.`);

  // In BC, income (revenue) posts as CREDIT = negative amount; expenses post
  // as DEBIT = positive. We normalise so revenue/GP/EBITDA read positive.
  const A = k => sumRange(actuals, k);
  const B = k => sumRange(budgets, k);

  const revA = -A('revenue'),  revB = B('revenue');            // actuals credit=negative so flip; budget stored as positive
  const cosA =  A('cosBpass') + A('cosProduct'),  cosB = B('cosBpass') + B('cosProduct');
  const salA =  A('salaries'),    salB = B('salaries');
  const opA  =  A('opexA') + A('opexB'),  opB = B('opexA') + B('opexB');
  const daA  =  A('depAmort'),    daB = B('depAmort');
  const finA =  A('finCosts'),    finB = B('finCosts');

  // M-MGT-RPT definitions:
  //   Gross Profit = Revenue - Cost of Sales
  //   Total OPEX   = salaries + other operating expenses
  //   EBITDA       = Gross Profit - Total OPEX
  const gpA = revA - cosA,  gpB = revB - cosB;
  const totOpexA = salA + opA,  totOpexB = salB + opB;
  const ebA = gpA - totOpexA,   ebB = gpB - totOpexB;
  const netA = ebA - daA - finA, netB = ebB - daB - finB;

  const budgetActual = { lines: [
    { name:'Revenue',       budget:toM(revB),  actual:toM(revA),  higherIsBetter:true  },
    { name:'Cost of Sales', budget:toM(cosB),  actual:toM(cosA),  higherIsBetter:false },
    { name:'Expenses',      budget:toM(totOpexB), actual:toM(totOpexA), higherIsBetter:false },
    { name:'Gross Profit',  budget:toM(gpB),   actual:toM(gpA),   higherIsBetter:true  },
    { name:'EBITDA',        budget:toM(ebB),   actual:toM(ebA),   higherIsBetter:true  }
  ]};

  /* ---- Budget Overview: by Global Dimension 2 (BUS UNIT & DEPART) ---- */
  const bm={}, um={};
  budgets.forEach(x=>{ const u=x.globalDim2||'Unassigned'; bm[u]=(bm[u]||0)+Math.abs(num(x.amount)); });
  actuals.forEach(x=>{ const a=String(x.accountNo);
    // only count P&L expense accounts toward "used" per unit
    if(inRange(a,CONFIG.ranges.cosBpass)||inRange(a,CONFIG.ranges.cosProduct)||
       inRange(a,CONFIG.ranges.salaries)||inRange(a,CONFIG.ranges.opexA)||inRange(a,CONFIG.ranges.opexB)){
      const u=x.globalDim2||'Unassigned'; um[u]=(um[u]||0)+Math.abs(num(x.amount));
    }});
  const units=Object.keys(bm).filter(u=>bm[u]>0);
  const byUnit=units.map(u=>({unit:u, budget:toM(bm[u])}));
  const utilizationYTD=units.map(u=>({unit:u, used:toM(um[u]||0), budget:toM(bm[u])}));

  // monthly: actual P&L net by month vs budget by month
  const mN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const aMonth=Array(12).fill(0), bMonth=Array(12).fill(0);
  const isPL=a=>inRange(a,CONFIG.ranges.revenue)||inRange(a,CONFIG.ranges.cosBpass)||
               inRange(a,CONFIG.ranges.cosProduct)||inRange(a,CONFIG.ranges.salaries)||
               inRange(a,CONFIG.ranges.opexA)||inRange(a,CONFIG.ranges.opexB);
  actuals.forEach(x=>{ if(isPL(String(x.accountNo))&&x.postingDate)
    aMonth[new Date(x.postingDate).getMonth()] += num(x.amount); });
  budgets.forEach(x=>{ if(isPL(String(x.accountNo))&&x.budgetDate)
    bMonth[new Date(x.budgetDate).getMonth()] += num(x.amount); });
  const lm=new Date().getMonth(); const labels=mN.slice(0,lm+1);

  // Monthly disbursements from loan disbursement accounts (6021/6022)
  const disbByMonth = Array(12).fill(0);
  actuals.forEach(x => {
    const a = String(x.accountNo);
    if (a >= '6021' && a <= '6022' && x.postingDate)
      disbByMonth[new Date(x.postingDate).getMonth()] += Math.abs(num(x.amount));
  });

  const budgetOverview = {
    byUnit,
    monthly:{ labels,
      budget: labels.map((_,i)=>toM(Math.abs(bMonth[i]))),
      actual: labels.map((_,i)=>toM(Math.abs(aMonth[i]))) },
    utilizationYTD
  };

  /* ---- GL Account Names: build account No → Name lookup ---- */
  let glAccountNames = {};
  try {
    const glAccts = await bc('KFT_GL_Accounts');
    glAccts.forEach(a => { if (a.no && a.name) glAccountNames[a.no] = a.name; });
    console.log(`  GL account names: ${Object.keys(glAccountNames).length} accounts loaded`);
  } catch(e) {
    console.warn('  KFT_GL_Accounts not reachable — bank codes will show as numbers:', e.message);
  }

  /* ---- Cash Flow ---- */
  const collections = Math.abs(A('bankCash'));   // net bank movement proxy; refine to debit-only in AL if needed
  const debtUsed    = Math.abs(A('debtShort')) + Math.abs(A('debtLong'));
  const capexOut    = Math.abs(A('wip'));
  const operatingOut= Math.abs(cosA) + Math.abs(totOpexA);

  const bank = await bc('KFT_Bank_Ledger', fy);
  bank.sort((a,b)=> new Date(a.postingDate)-new Date(b.postingDate));

  // Monthly bank collections (positive flows = inflows / repayments / collections)
  const collByMonth = Array(12).fill(0);
  bank.forEach(x => {
    if (num(x.amount) > 0 && x.postingDate)
      collByMonth[new Date(x.postingDate).getMonth()] += num(x.amount);
  });

  let run=0; const dayMap={}, bankMap={};
  bank.forEach(x=>{ run+=num(x.amount); const d=String(x.postingDate).slice(0,10); dayMap[d]=run;
    if(num(x.amount)>0){ const b=x.bankAccountNo||'Other'; bankMap[b]=(bankMap[b]||0)+num(x.amount); }});
  const days=Object.keys(dayMap).sort().slice(-30);
  const cashflow = {
    bankDaily:{ labels:days.map(d=>d.slice(8,10)), balances:days.map(d=>toM(dayMap[d])) },
    collectionsByBank:Object.entries(bankMap).map(([code,a])=>({bank:glAccountNames[code]||code,amount:toM(a)})).sort((a,b)=>b.amount-a.amount).slice(0,6),
    flows:{ collections:toM(collections), otherInflows:0, operatingOut:toM(operatingOut), capexOut:toM(capexOut) },
    debtUtilisation:{ used:toM(debtUsed), facility: CONFIG.DEBT_FACILITY || toM(debtUsed) || 1 },
    capexUtilisation:{ used:toM(capexOut), budget: CONFIG.CAPEX_BUDGET || toM(capexOut) || 1 },
    monthlyCollections:{ labels, data: labels.map((_,i)=>toM(collByMonth[i])) }
  };

  /* ---- Reports: P&L bridge + ratios (reuse the figures above) ---- */
  const pct=(n,d)=>d?(n/d*100).toFixed(1)+'%':'n/a';
  const rat=(n,d)=>d?(n/d).toFixed(2):'n/a';
  const plBridge = [
    { name:'Revenue',        value: toM(revA),     type:'total' },
    { name:'Cost of Sales',  value: -toM(cosA),    type:'neg' },
    { name:'Gross Profit',   value: toM(gpA),      type:'subtotal' },
    { name:'Salaries',       value: -toM(salA),    type:'neg' },
    { name:'Operating Exp.', value: -toM(opA),     type:'neg' },
    { name:'EBITDA',         value: toM(ebA),      type:'subtotal' },
    { name:'Depreciation',   value: -toM(daA),     type:'neg' },
    { name:'Financial Costs',value: -toM(finA),    type:'neg' },
    { name:'Net Profit',     value: toM(netA),     type:'total' }
  ];

  const bs = await bc('KFT_GL_Balances');
  const G=k=>bs.filter(x=>inRange(String(x.accountNo),CONFIG.ranges[k])).reduce((s,x)=>s+num(x.balance),0);
  const ca=G('currentAssets'), inv=G('inventory'), cl=Math.abs(G('currentLiab'));
  const liab=Math.abs(G('totalLiabilities')), eq=Math.abs(G('equity'));

  const reports = {
    ratios:[
      {label:'Gross Margin', value:pct(gpA,revA),  trend:0},
      {label:'EBITDA Margin',value:pct(ebA,revA),  trend:0},
      {label:'Net Margin',   value:pct(netA,revA), trend:0},
      {label:'Current Ratio',value:rat(ca,cl),     trend:0},
      {label:'Quick Ratio',  value:rat(ca-inv,cl), trend:0},
      {label:'Debt / Equity',value:rat(liab,eq),   trend:0}
    ],
    pl: plBridge,
    management:[
      {metric:'Revenue',        month:0,last:0,ytd:toM(revA),     vsBudget: revB? +(((revA-revB)/revB)*100).toFixed(1):0},
      {metric:'Gross Profit',   month:0,last:0,ytd:toM(gpA),      vsBudget: gpB? +(((gpA-gpB)/gpB)*100).toFixed(1):0},
      {metric:'EBITDA',         month:0,last:0,ytd:toM(ebA),      vsBudget: ebB? +(((ebA-ebB)/ebB)*100).toFixed(1):0},
      {metric:'Operating Exp.', month:0,last:0,ytd:toM(totOpexA), vsBudget: totOpexB? +(((totOpexA-totOpexB)/totOpexB)*100).toFixed(1):0},
      {metric:'Net Profit',     month:0,last:0,ytd:toM(netA),     vsBudget: netB? +(((netA-netB)/netB)*100).toFixed(1):0}
    ]
  };

  /* ---- HR / People ---- */
  const employees = await bc('GetEmployee');
  const hrByStatus={}, hrByType={}, hrByGender={};
  employees.forEach(e=>{
    const s=e.employeeStatus||'Unknown'; hrByStatus[s]=(hrByStatus[s]||0)+1;
    if(s==='Active'){
      const t=e.employeeType||'Unknown'; hrByType[t]=(hrByType[t]||0)+1;
      const g=e.gender||'Unknown';       hrByGender[g]=(hrByGender[g]||0)+1;
    }
  });
  const hr = {
    total: employees.length,
    byStatus: Object.entries(hrByStatus).map(([status,count])=>({status,count})).sort((a,b)=>b.count-a.count),
    byType:   Object.entries(hrByType).map(([type,count])=>({type,count})).sort((a,b)=>b.count-a.count),
    byGender: Object.entries(hrByGender).map(([gender,count])=>({gender,count})).sort((a,b)=>b.count-a.count)
  };
  console.log(`  HR: ${hr.total} employees — Active ${(hr.byStatus.find(x=>x.status==='Active')||{count:0}).count} | Gender: ${hr.byGender.map(x=>x.gender+' '+x.count).join(', ')}`);

  /* ---- Dimension Names: fetch all values, build code → name map ---- */
  let dimensionNames = {};
  try {
    const dimVals = await bc('KFT_Dimension_Values');
    dimVals.forEach(d => {
      if (d.code && d.name && !d.blocked)
        dimensionNames[d.code] = d.name;
    });
    console.log(`  Dimension names: ${Object.keys(dimensionNames).length} values loaded`);
  } catch(e) {
    console.warn('  KFT_Dimension_Values not reachable — names will show as codes:', e.message);
  }

  const disbursementsYTD = toM(Math.abs(A('disbursements')));

  /* ---- Loan Portfolio (KFT_Loan_Accounts + KFT_Overdue_Loans) ---- */
  let loanPortfolio = null;
  try {
    const [loanAccts, overdueLoans] = await Promise.all([
      bc('KFT_Loan_Accounts'),
      bc('KFT_Overdue_Loans')
    ]);
    const grossPortfolio = toM(loanAccts.reduce((s,x)=>s+num(x.outstandingBalance),0));
    const activeBorrowers = new Set(loanAccts.map(x=>x.customerNo)).size;
    const overdueBalance  = toM(overdueLoans.reduce((s,x)=>s+num(x.overdueBalance),0));
    const overdueBorrowers = new Set(overdueLoans.map(x=>x.customerNo)).size;
    const parPct = grossPortfolio>0 ? +(overdueBalance/grossPortfolio*100).toFixed(1) : 0;
    const byUnitMap = {};
    loanAccts.forEach(x=>{ const u=x.globalDim2||'Other'; byUnitMap[u]=(byUnitMap[u]||0)+num(x.outstandingBalance); });
    const portfolioByUnit = Object.entries(byUnitMap)
      .map(([unit,bal])=>({unit, balance:toM(bal)}))
      .sort((a,b)=>b.balance-a.balance);
    loanPortfolio = { grossPortfolio, activeBorrowers, overdueBalance, overdueBorrowers, parPct, portfolioByUnit };
    console.log(`  Loan portfolio: ${grossPortfolio}M gross, ${activeBorrowers} borrowers, PAR ${parPct}% (${overdueBalance}M overdue)`);
  } catch(e) {
    console.warn('  Loan portfolio not loaded:', e.message);
  }

  const lending = {
    disbursementsYTD,
    monthlyDisburse: { labels, data: labels.map((_,i)=>toM(disbByMonth[i])) },
    ...(loanPortfolio ? { loanPortfolio } : {})
  };
  console.log(`  Lending disbursements YTD: ${disbursementsYTD}M (accounts 6021/6022)`);
  console.log(`  Monthly bank collections: ${labels.map((_,i)=>toM(collByMonth[i])+'M').join(', ')}`);

  return { asOf: new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),
           budgetActual, budgetOverview, cashflow, reports, hr, lending, dimensionNames };
}

(async () => {
  try {
    console.log(`Fetching from BC: ${BC_BASE} (${BC_COMPANY})...`);
    const data = await build();
    const out = '/* AUTO-GENERATED by snapshot.js - do not edit by hand.\n' +
                `   Snapshot taken: ${new Date().toISOString()} */\n` +
                'window.DEMO_DATA = ' + JSON.stringify(data, null, 2) + ';\n';
    const target = path.join(__dirname, 'data.js');
    fs.writeFileSync(target, out);
    console.log('OK - snapshot written to', target);

    // Save daily archive for historical picker
    const archiveDir = path.join(__dirname, 'archive');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir);
    const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const archiveTarget = path.join(archiveDir, `${dateKey}.json`);
    fs.writeFileSync(archiveTarget, JSON.stringify(data, null, 2));
    console.log('  Archive saved:', archiveTarget);
    const L = data.budgetActual.lines;
    console.log('  as of', data.asOf);
    console.log('  Revenue       ', L[0].actual + 'M  (budget ' + L[0].budget + 'M)');
    console.log('  Cost of Sales ', L[1].actual + 'M');
    console.log('  Expenses      ', L[2].actual + 'M');
    console.log('  Gross Profit  ', L[3].actual + 'M');
    console.log('  EBITDA        ', L[4].actual + 'M');
    console.log('  Net Profit    ', data.reports.pl[data.reports.pl.length-1].value + 'M');
    console.log('  Margins: GM ' + data.reports.ratios[0].value +
                ' | EBITDA ' + data.reports.ratios[1].value +
                ' | Net ' + data.reports.ratios[2].value);
    console.log('Open index.html to view.');
  } catch (e) {
    console.error('FAILED:', e.message);
    console.error('  data.js was NOT changed (last good snapshot preserved).');
    console.error('  Check: on VPN/LAN? credentials correct? services published?');
    process.exit(1);
  }
})();
