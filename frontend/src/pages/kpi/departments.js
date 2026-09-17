// Static id/name pairs for the 12 departments, used ONLY to wire up sidebar routing
// (frontend/src/lib/pages.js) the same way procurement/reportConfig.js feeds Procurement's
// sub-tabs. Everything else about a department — its KPIs, targets, thresholds — is fetched
// live from /api/kpi/dictionary, never hardcoded, per the PRD's "load as data" requirement.
// Keep in sync with backend/services/ensure-kpi-dictionary.js's DEPARTMENTS list (ids must
// match exactly — the backend is the source of truth for names/exec owners).
export const KPI_DEPARTMENTS = [
  { id: 'kpi-technology',     name: 'Technology' },
  { id: 'kpi-finance-group',  name: 'Finance Group' },
  { id: 'kpi-fmls',           name: 'FMLS' },
  { id: 'kpi-scfmls',         name: 'SCFMLS' },
  { id: 'kpi-smart-mobility', name: 'Smart Mobility' },
  { id: 'kpi-msp',            name: 'Market Solutions Practice' },
  { id: 'kpi-csp',            name: 'Capital Solution Practice' },
  { id: 'kpi-legal',          name: 'CEO Office — Legal, Governance & Risk' },
  { id: 'kpi-chief-of-staff', name: 'CEO Office — Chief of Staff' },
  { id: 'kpi-hr',             name: 'Human Resources' },
  { id: 'kpi-ciso',           name: 'CISO' },
  { id: 'kpi-admin',          name: 'Admin' },
]
