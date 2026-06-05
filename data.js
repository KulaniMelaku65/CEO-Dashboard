/* ============================================================
   KIFIYA CEO DASHBOARD — DEMO DATA  (ETB Millions)
   The shapes below are EXACTLY what your live proxy must return
   from each endpoint. Match these keys and the dashboard "just works".
   Replace numbers with real ones if you want a better demo today.
   ============================================================ */

window.DEMO_DATA = {

  asOf: "05 Jun 2026",

  /* ---- ENDPOINT: /api/budget-actual ---- */
  budgetActual: {
    // each line: budget vs actual YTD
    lines: [
      { name: "Revenue",       budget: 1420, actual: 1535, higherIsBetter: true  },
      { name: "Cost of Sales", budget: 560,  actual: 588,  higherIsBetter: false },
      { name: "Expenses",      budget: 410,  actual: 372,  higherIsBetter: false },
      { name: "Gross Profit",  budget: 860,  actual: 947,  higherIsBetter: true  },
      { name: "EBITDA",        budget: 450,  actual: 575,  higherIsBetter: true  }
    ]
  },

  /* ---- ENDPOINT: /api/budget-overview ---- */
  budgetOverview: {
    byUnit: [
      { unit: "FinTech / Lending",  budget: 720 },
      { unit: "AgTech",             budget: 380 },
      { unit: "Mobility",           budget: 240 },
      { unit: "Payments",           budget: 310 },
      { unit: "Shared / Corporate", budget: 170 }
    ],
    monthly: {
      labels: ["Jan","Feb","Mar","Apr","May","Jun"],
      budget: [300,305,310,315,320,330],
      actual: [288,312,301,330,318,345]
    },
    utilizationYTD: [
      { unit: "FinTech / Lending",  used: 470, budget: 720 },
      { unit: "AgTech",             used: 295, budget: 380 },
      { unit: "Mobility",           used: 150, budget: 240 },
      { unit: "Payments",           used: 240, budget: 310 },
      { unit: "Shared / Corporate", used: 122, budget: 170 }
    ]
  },

  /* ---- ENDPOINT: /api/cashflow ---- */
  cashflow: {
    bankDaily: {
      // last 30 days total bank balance trend
      labels: Array.from({length:30},(_,i)=>`${i+1}`),
      balances: [420,418,431,447,440,452,460,455,470,481,475,490,
                 502,498,510,521,515,530,544,539,551,560,558,572,
                 585,580,593,604,611,628]
    },
    collectionsByBank: [
      { bank: "CBE",            amount: 320 },
      { bank: "Awash",          amount: 188 },
      { bank: "Dashen",         amount: 142 },
      { bank: "Coop of Oromia", amount: 96  },
      { bank: "Other",          amount: 54  }
    ],
    flows: {
      // ETB millions, YTD
      collections:    800,   // total collections as per bank
      otherInflows:   95,    // other inflows
      operatingOut:   540,   // operating outflows
      capexOut:       180    // CAPEX outflows
    },
    debtUtilisation:  { used: 640, facility: 1000 },  // debt utilisation
    capexUtilisation: { used: 180, budget: 260 }      // CAPEX utilisation
  },

  /* ---- ENDPOINT: /api/reports ---- */
  reports: {
    ratios: [
      { label: "Gross Margin",   value: "61.7%", trend:+2.4 },
      { label: "EBITDA Margin",  value: "37.5%", trend:+5.1 },
      { label: "Net Margin",     value: "22.1%", trend:+1.8 },
      { label: "Current Ratio",  value: "1.84",  trend:+0.12 },
      { label: "Quick Ratio",    value: "1.31",  trend:+0.05 },
      { label: "Debt / Equity",  value: "0.58",  trend:-0.04 }
    ],
    // P&L bridge: revenue down to net profit
    pl: [
      { name:"Revenue",        value: 1535, type:"total" },
      { name:"Cost of Sales",  value: -588, type:"neg"   },
      { name:"Gross Profit",   value: 947,  type:"subtotal" },
      { name:"Operating Exp.", value: -372, type:"neg"   },
      { name:"EBITDA",         value: 575,  type:"subtotal" },
      { name:"D&A",            value: -110, type:"neg"   },
      { name:"Interest & Tax", value: -126, type:"neg"   },
      { name:"Net Profit",     value: 339,  type:"total" }
    ],
    management: [
      { metric:"Revenue",        month: 345, last: 318, ytd: 1535, vsBudget:+8.1 },
      { metric:"Gross Profit",   month: 214, last: 196, ytd: 947,  vsBudget:+10.1 },
      { metric:"EBITDA",         month: 131, last: 118, ytd: 575,  vsBudget:+27.8 },
      { metric:"Operating Exp.", month: 83,  last: 78,  ytd: 372,  vsBudget:-9.3 },
      { metric:"Net Cash Pos.",  month: 628, last: 593, ytd: 628,  vsBudget:+12.4 },
      { metric:"Collections",    month: 168, last: 151, ytd: 800,  vsBudget:+4.2 }
    ]
  }
};
