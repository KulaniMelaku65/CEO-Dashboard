const db = require('../db');

// Transcribed verbatim from "Preliminary KPI Metric_Inventory.pdf" (Appendix A: Full Metric
// Inventory, 90 KPIs across 12 functions). Rows marked `pending: true` are the 13 rows the
// source document itself flags with `†` as needing a definition/target — they seed with
// target_value = null and the placeholder-figures caveat on page 1 of that PDF applies: don't
// treat any of this as final, it's the CFO's dictionary to edit once confirmed.
const DEPARTMENTS = [
  { id: 'kpi-technology',      name: 'Technology',                             accountableExec: 'Group Chief Technology & Product' },
  { id: 'kpi-finance-group',   name: 'Finance Group',                          accountableExec: 'Group CFO' },
  { id: 'kpi-fmls',            name: 'FMLS',                                   accountableExec: 'Chief Business Officer — FMLS' },
  { id: 'kpi-scfmls',          name: 'SCFMLS',                                 accountableExec: 'Chief Growth Officer — SCFMLS' },
  { id: 'kpi-smart-mobility',  name: 'Smart Mobility',                         accountableExec: 'GM Smart Mobility' },
  { id: 'kpi-msp',             name: 'Market Solutions Practice',              accountableExec: 'Senior Director, MSP' },
  { id: 'kpi-csp',             name: 'Capital Solution Practice',              accountableExec: 'Head of CSP' },
  { id: 'kpi-legal',           name: 'CEO Office — Legal, Governance & Risk',  accountableExec: 'Director of Legal' },
  { id: 'kpi-chief-of-staff',  name: 'CEO Office — Chief of Staff',            accountableExec: 'Chief of Staff' },
  { id: 'kpi-hr',              name: 'Human Resources',                        accountableExec: 'Chief HR Officer' },
  { id: 'kpi-ciso',            name: 'CISO',                                   accountableExec: 'Chief Information Security Officer' },
  { id: 'kpi-admin',           name: 'Admin',                                  accountableExec: 'Head of Admin' },
]

// "One number, one place" (PRD §8) — these two milestones appear in more than one
// department's pack. Tagging them with the same shared_key lets the group roll-up count each
// one once instead of once per department that references it.
const SHARED_NEW_BUSINESS_LINES = 'shared-new-business-lines-live'
const SHARED_COUNTRY_EXPANSION  = 'shared-country-expansion'

const KPIS = [
  // 1. Technology
  { dept: 'kpi-technology', name: 'Requests from FMLS/SCFMLS delivered on time', type: 'T7',           target: '100% within SLA',                          source: 'Request log',                        method: 'S' },
  { dept: 'kpi-technology', name: 'New business lines live',                    type: 'T3',           target: '4 live on both books',                     source: 'Release log (shared milestone)',     method: 'M', sharedKey: SHARED_NEW_BUSINESS_LINES },
  { dept: 'kpi-technology', name: 'New market instances live',                  type: 'T3',           target: 'Rwanda + 2nd country live',                source: 'Release log (shared milestone)',     method: 'M', sharedKey: SHARED_COUNTRY_EXPANSION },
  { dept: 'kpi-technology', name: 'Core lending platform uptime',               type: 'T2',           target: '≥99.5%',                                   source: 'Uptime monitoring',                  method: 'A' },
  { dept: 'kpi-technology', name: '# of products released',                    type: 'T1/T3',        target: 'vs product roadmap',                       source: 'Release log / catalogue',            method: 'S', pending: true },
  { dept: 'kpi-technology', name: 'Time to market per product',                 type: 'T5',           target: '≤90 days',                                 source: 'Release log',                        method: 'S' },
  { dept: 'kpi-technology', name: 'Post-launch defect rate',                    type: 'T4',           target: 'Zero Sev-1',                               source: 'Release/defect log',                 method: 'S' },
  { dept: 'kpi-technology', name: 'Volume of data amassed',                     type: 'T1',           target: 'vs data acquisition plan',                 source: 'Data platform catalogue',            method: 'A', pending: true },
  { dept: 'kpi-technology', name: 'CPV data completeness',                      type: 'T7',           target: '≥98%, 7 CPVs automated',                   source: 'Data platform',                      method: 'A' },
  { dept: 'kpi-technology', name: 'Data quality & dashboard availability',      type: 'T7',           target: 'Recon ≥98%; on-schedule',                  source: 'Reconciliation logs',                method: 'A' },
  { dept: 'kpi-technology', name: '# risk models in production',               type: 'T1/T3',        target: 'vs model roadmap',                         source: 'Model inventory',                    method: 'S', pending: true },
  { dept: 'kpi-technology', name: 'Model accuracy',                            type: 'T2',           target: 'AUC ≥0.70; coverage 100%',                 source: 'Model inventory',                    method: 'S' },

  // 2. Finance Group
  { dept: 'kpi-finance-group', name: 'Minimum cash balance',                    type: 'T2 (compound)', target: '≥ETB 50M & ≥90 days',                     source: 'ERP / treasury',                     method: 'A' },
  { dept: 'kpi-finance-group', name: 'Rolling cash flow forecast',              type: 'T7',            target: '100% on time, weekly',                    source: 'ERP / treasury',                     method: 'S' },
  { dept: 'kpi-finance-group', name: 'Month-end close & reporting',             type: 'T4/T5',         target: 'Accounts by WD10; zero material errors',  source: 'ERP',                                method: 'S' },
  { dept: 'kpi-finance-group', name: 'Budget control',                         type: 'T6',            target: 'No dept beyond ±10% w/o plan',             source: 'ERP',                                method: 'A' },
  { dept: 'kpi-finance-group', name: 'Capital & financing',                    type: 'T7',            target: '100% facilities with drawdown plan',       source: 'Facility register',                  method: 'M' },
  { dept: 'kpi-finance-group', name: 'CPV dashboard live',                     type: 'T3/T7',         target: '7 CPVs, single source',                    source: 'CPV dashboard (dep. Tech 9)',        method: 'A' },
  { dept: 'kpi-finance-group', name: 'KPI dictionary signed off',              type: 'T7',            target: '100% defined & agreed',                    source: 'Dictionary (this build)',            method: 'M' },
  { dept: 'kpi-finance-group', name: 'Reported data accuracy vs source',       type: 'T7',            target: '≥98% (dep. Tech 10)',                      source: 'Reconciliation',                     method: 'A' },
  { dept: 'kpi-finance-group', name: 'Departmental KPI reporting coverage',    type: 'T7',            target: '12/12 by WD5',                             source: 'Portal (this build)',                method: 'A' },

  // 3. FMLS
  { dept: 'kpi-fmls', name: '# MSMEs served',            type: 'T1', target: '777,908',            source: 'CPV dashboard', method: 'A' },
  { dept: 'kpi-fmls', name: '# loans disbursed',          type: 'T1', target: '1,101,274',          source: 'CPV dashboard', method: 'A' },
  { dept: 'kpi-fmls', name: '# devices financed',         type: 'T1', target: '369,342',            source: 'CPV dashboard', method: 'A' },
  { dept: 'kpi-fmls', name: '# invoices financed',        type: 'T1', target: '3,468',              source: 'CPV dashboard', method: 'A' },
  { dept: 'kpi-fmls', name: '# SHF served',               type: 'T1', target: '135,450',            source: 'CPV dashboard', method: 'A' },
  { dept: 'kpi-fmls', name: 'Agri GMV',                   type: 'T1', target: 'ETB 23,902m',        source: 'CPV dashboard', method: 'A' },
  { dept: 'kpi-fmls', name: 'New business lines launched', type: 'T3', target: '4 live & transacting', source: 'Shared milestone', method: 'M', sharedKey: SHARED_NEW_BUSINESS_LINES },

  // 4. SCFMLS
  { dept: 'kpi-scfmls', name: '# MSMEs served',            type: 'T1', target: '194,478',              source: 'CPV (Sharia book)',     method: 'A' },
  { dept: 'kpi-scfmls', name: '# loans disbursed',         type: 'T1', target: '275,320',              source: 'CPV (Sharia book)',     method: 'A' },
  { dept: 'kpi-scfmls', name: '# devices financed',        type: 'T1', target: '92,336',               source: 'CPV (Sharia book)',     method: 'A' },
  { dept: 'kpi-scfmls', name: '# invoices financed',       type: 'T1', target: '867',                  source: 'CPV (Sharia book)',     method: 'A' },
  { dept: 'kpi-scfmls', name: 'Sharia compliance',         type: 'T4', target: 'Zero findings; 100% sign-off', source: 'Compliance register', method: 'M' },
  { dept: 'kpi-scfmls', name: 'New business lines launched', type: 'T3', target: '4 Sharia variants live', source: 'Shared milestone', method: 'M', sharedKey: SHARED_NEW_BUSINESS_LINES },
  { dept: 'kpi-scfmls', name: 'Market expansion',          type: 'T3', target: 'Rwanda + 2nd country', source: 'Shared milestone', method: 'M', sharedKey: SHARED_COUNTRY_EXPANSION },

  // 5. Smart Mobility
  { dept: 'kpi-smart-mobility', name: '# commuters served',              type: 'T1',            target: '≥3,526,381 (H1 actual; target pending)', source: 'Mobility platform',  method: 'A', pending: true },
  { dept: 'kpi-smart-mobility', name: '# drivers financed',              type: 'T1',            target: 'vs plan',                                 source: 'Mobility platform',  method: 'A', pending: true },
  { dept: 'kpi-smart-mobility', name: 'Fleet SaaS operators live',       type: 'T3 (compound)', target: 'vs plan; TAT ≤14 days',                   source: 'Fleet SaaS billing', method: 'S', pending: true },
  { dept: 'kpi-smart-mobility', name: 'SaaS subscription revenue',       type: 'T2',            target: '≥ETB 730,545/qtr',                        source: 'Fleet SaaS billing', method: 'A' },
  { dept: 'kpi-smart-mobility', name: 'Ticketing commission volume',     type: 'T1 (compound)', target: '≥ETB 28.85m; settle ≥90%',                source: 'Ticketing settlement', method: 'A' },
  { dept: 'kpi-smart-mobility', name: 'Freight commercialisation',       type: 'T3',            target: 'Pilot → commercial by 31 Dec',            source: 'Mobility platform',  method: 'M' },
  { dept: 'kpi-smart-mobility', name: 'Core mobility modules delivered', type: 'T1/T3',         target: 'vs plan',                                 source: 'Mobility platform',  method: 'S', pending: true },

  // 6. Market Solutions Practice
  { dept: 'kpi-msp', name: '# MSMEs & SHF enrolled (pipeline)',  type: 'T1', target: 'vs enrolment plan (funnel to FMLS)', source: 'Programme MIS', method: 'S', pending: true },
  { dept: 'kpi-msp', name: '# banks/MFIs/partners onboarded',    type: 'T1', target: 'vs plan',                            source: 'Programme MIS', method: 'M', pending: true },
  { dept: 'kpi-msp', name: '# inclusion targets met',            type: 'T7', target: '100%',                               source: 'Programme MIS', method: 'M' },
  { dept: 'kpi-msp', name: 'Budget utilisation',                 type: 'T6', target: '≥80%; within ±5%',                   source: 'ERP / MIS',     method: 'S' },
  { dept: 'kpi-msp', name: '# studies/playbooks published',      type: 'T3', target: '≥1 in H2',                           source: 'Programme MIS', method: 'M' },
  { dept: 'kpi-msp', name: 'Partner activation rate',            type: 'T2', target: '≥90% within 60 days',                source: 'Programme MIS', method: 'S' },
  { dept: 'kpi-msp', name: 'Funder & programme reporting',       type: 'T7', target: '100% on time & accurate',            source: 'Partner returns', method: 'M' },

  // 7. Capital Solution Practice
  { dept: 'kpi-csp', name: 'Capital secured vs H2 requirement',       type: 'T7', target: '100% committed',      source: 'Facility register',    method: 'M' },
  { dept: 'kpi-csp', name: '# funds/facilities structured & deployed', type: 'T1', target: 'vs pipeline',        source: 'Facility register',    method: 'M', pending: true },
  { dept: 'kpi-csp', name: 'Facility utilisation rate',              type: 'T2', target: '≥80% drawn',          source: 'Facility register',    method: 'S' },
  { dept: 'kpi-csp', name: 'TLF management & compliance',            type: 'T4', target: '100% every cycle',    source: 'DFI reporting pack',   method: 'M' },
  { dept: 'kpi-csp', name: 'DFI & partner reporting',                type: 'T7', target: '100% on time & accurate', source: 'DFI reporting pack', method: 'M' },
  { dept: 'kpi-csp', name: 'Funder pipeline',                        type: 'T1', target: 'vs plan',             source: 'Facility register',    method: 'M', pending: true },

  // 8. CEO Office — Legal, Governance & Risk
  { dept: 'kpi-legal', name: 'Regulatory compliance',               type: 'T4/T7', target: 'Zero breaches; 100% filings on time', source: 'Filing calendar',                   method: 'M' },
  { dept: 'kpi-legal', name: 'Licensing (Rwanda + 2nd market)',      type: 'T3/T4', target: '100% valid; zero lapses',             source: 'Licence register (shared milestone)', method: 'M', sharedKey: SHARED_COUNTRY_EXPANSION },
  { dept: 'kpi-legal', name: 'Legal sign-off on new launches',       type: 'T4',    target: '100% cleared before launch',          source: 'Contract/launch register (shared)', method: 'M' },
  { dept: 'kpi-legal', name: 'Contract turnaround',                  type: 'T5',    target: '≤10 working days',                    source: 'Contract register',                 method: 'S' },
  { dept: 'kpi-legal', name: 'Litigation & legal exposure',          type: 'T4',    target: 'Zero unresolved material',            source: 'Legal register',                    method: 'M' },
  { dept: 'kpi-legal', name: 'Regulatory engagement',                type: 'T7',    target: '100% within window',                  source: 'Filing calendar',                   method: 'M' },
  { dept: 'kpi-legal', name: 'Data protection & privacy',            type: 'T4/T7', target: 'Zero breaches; 100% assessed',        source: 'Legal/privacy register',            method: 'M' },

  // 9. CEO Office — Chief of Staff
  { dept: 'kpi-chief-of-staff', name: 'Capital raises & strategic deals',   type: 'T7', target: 'vs strategic plan',                         source: 'Deal tracker',                       method: 'M', pending: true },
  { dept: 'kpi-chief-of-staff', name: 'Country expansion (Rwanda + 1)',     type: 'T3', target: 'Both on plan by 31 Dec (2nd unnamed)',       source: 'Decision register (shared milestone)', method: 'M', sharedKey: SHARED_COUNTRY_EXPANSION, pending: true },
  { dept: 'kpi-chief-of-staff', name: 'ExCo cadence execution',             type: 'T7', target: '≥90%; 100% actions closed',                 source: 'ExCo action log',                    method: 'S' },
  { dept: 'kpi-chief-of-staff', name: 'Senior leadership hiring',           type: 'T5', target: 'All filled within 60 days',                 source: 'HRIS',                                method: 'S' },
  { dept: 'kpi-chief-of-staff', name: 'Corporate communications',          type: 'T4', target: '100% accuracy; zero missed',                source: 'Comms log',                          method: 'M' },
  { dept: 'kpi-chief-of-staff', name: 'Board & governance calendar',        type: 'T7', target: '100% held; papers 5 days ahead',            source: 'Governance calendar',                method: 'M' },
  { dept: 'kpi-chief-of-staff', name: 'Strategic initiative tracking',      type: 'T7', target: '100% owned & current',                      source: 'Decision register',                  method: 'M' },

  // 10. Human Resources
  { dept: 'kpi-hr', name: 'Critical role vacancy rate',            type: 'T2', target: '≤10%',                     source: 'HRIS',           method: 'A' },
  { dept: 'kpi-hr', name: 'Time to fill critical roles',           type: 'T5', target: '≤60 days',                 source: 'HRIS',           method: 'S' },
  { dept: 'kpi-hr', name: 'Staff with approved KPIs & reviews',    type: 'T7', target: '100%',                     source: 'HRIS',           method: 'S' },
  { dept: 'kpi-hr', name: 'People cost vs budget',                 type: 'T6', target: 'Within approved budget',   source: 'Payroll / ERP',  method: 'A' },
  { dept: 'kpi-hr', name: 'Payroll accuracy',                      type: 'T4', target: '100%; zero errors',        source: 'Payroll',        method: 'A' },
  { dept: 'kpi-hr', name: 'Regrettable attrition',                 type: 'T2', target: '≤5%',                      source: 'HRIS',           method: 'S' },
  { dept: 'kpi-hr', name: 'Mandatory training completion',         type: 'T7', target: '100%',                     source: 'HRIS / LMS',     method: 'A' },

  // 11. CISO
  { dept: 'kpi-ciso', name: 'Cyber security incidents',        type: 'T4 (compound)', target: 'Zero critical; MTTR ≤4h',                 source: 'Incident register',            method: 'S' },
  { dept: 'kpi-ciso', name: 'ERP uptime',                      type: 'T2',            target: '≥99.2%',                                  source: 'Uptime logs',                  method: 'A' },
  { dept: 'kpi-ciso', name: 'Power BI uptime',                 type: 'T2',            target: '≥99.0%',                                  source: 'Uptime logs',                  method: 'A' },
  { dept: 'kpi-ciso', name: 'Physical security incidents',     type: 'T4',            target: 'Zero major',                              source: 'Incident register',            method: 'M' },
  { dept: 'kpi-ciso', name: 'DR test & security training',     type: 'T3 (compound)', target: 'DR passed (RTO≤4h/RPO≤1h); 100% trained', source: 'DR report / training records',  method: 'S' },
  { dept: 'kpi-ciso', name: 'Vulnerability remediation',       type: 'T7',            target: '100% critical within 30 days',            source: 'Vuln scanner',                 method: 'S' },
  { dept: 'kpi-ciso', name: 'Privileged access review',        type: 'T7',            target: '100% reviewed each quarter',              source: 'IAM logs',                     method: 'S' },

  // 12. Admin
  { dept: 'kpi-admin', name: 'Procurement cycle time',              type: 'T5',            target: '≤10 days',              source: 'Procurement system',      method: 'S' },
  { dept: 'kpi-admin', name: 'Admin SLA compliance',                type: 'T7',            target: '≥90%',                  source: 'Procurement / ticketing', method: 'S' },
  { dept: 'kpi-admin', name: 'Admin budget variance',               type: 'T6',            target: 'Within ±10%',           source: 'ERP',                      method: 'A' },
  { dept: 'kpi-admin', name: 'Asset register accuracy & recovery',  type: 'T7',            target: '≥95%; 100% recovery',   source: 'Asset register',           method: 'S' },
  { dept: 'kpi-admin', name: 'Vehicle & fleet availability',        type: 'T2',            target: '≥90%',                  source: 'Fleet log',                method: 'S' },
  { dept: 'kpi-admin', name: 'Facilities availability',             type: 'T2 (compound)', target: '≥99%; zero major incidents', source: 'Facilities log',       method: 'M' },
  { dept: 'kpi-admin', name: 'Supplier performance',                type: 'T7',            target: '≥90% to SLA',           source: 'Procurement system',       method: 'S' },
]

// Extracts a single numeric target from the free-text H2 Target column, ONLY when the text
// contains exactly one number — e.g. "≥99.5%" -> 99.5, "1,101,274" -> 1101274, "≤10%" -> 10.
// Multi-clause targets ("≥ETB 50M & ≥90 days", milestones, "vs plan") are intentionally left
// null: the full text is always kept in target_note for display, and a wrong guess at a single
// number for a two-part condition would be worse than no number at all.
function parseTargetValue(text) {
  const cleaned = text.replace(/,(?=\d{3})/g, '')
  const matches = cleaned.match(/\d+(\.\d+)?/g)
  if (!matches || matches.length !== 1) return null
  return parseFloat(matches[0])
}

const upsertDept = db.prepare(`
  INSERT INTO kpi_departments (id, name, accountable_exec, sort_order) VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO NOTHING
`)

const kpiExists = db.prepare(
  'SELECT 1 FROM kpi_dictionary WHERE department_id = ? AND name = ?'
)
const insertKpi = db.prepare(`
  INSERT INTO kpi_dictionary
    (department_id, name, type, target_value, target_note, source, method, shared_key, sort_order)
  VALUES (@dept, @name, @type, @targetValue, @targetNote, @source, @method, @sharedKey, @sortOrder)
`)

// Idempotent, startup-safe seed — same shape as ensure-users.js. Only inserts a KPI row if
// one with the same (department, name) doesn't already exist, so a CFO's later edits (target
// changes, threshold overrides, deactivating a KPI) are never clobbered by a restart.
function ensureKpiDictionary() {
  DEPARTMENTS.forEach((d, i) => upsertDept.run(d.id, d.name, d.accountableExec, i + 1))

  let inserted = 0
  const deptSortCounters = {}
  KPIS.forEach(k => {
    if (kpiExists.get(k.dept, k.name)) return
    deptSortCounters[k.dept] = (deptSortCounters[k.dept] || 0) + 1
    insertKpi.run({
      dept: k.dept,
      name: k.name,
      type: k.type,
      targetValue: k.pending ? null : parseTargetValue(k.target),
      targetNote: k.target,
      source: k.source,
      method: k.method,
      sharedKey: k.sharedKey || null,
      sortOrder: deptSortCounters[k.dept],
    })
    inserted++
  })
  if (inserted > 0) console.log(`[startup] Seeded ${inserted} KPI dictionary rows across ${DEPARTMENTS.length} departments.`)
}

module.exports = { ensureKpiDictionary, DEPARTMENTS, KPIS }
