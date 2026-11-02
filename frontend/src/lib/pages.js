import { PROCUREMENT_REPORTS } from '../pages/procurement/reportConfig.js'
import { KPI_DEPARTMENTS } from '../pages/kpi/departments.js'

// Central id/label/parentId registry for every dashboard page — the single source of
// truth shared by App.jsx (which pairs each entry with its actual Page component) and
// the Admin page's per-user page-access toggles (which only need id+label, not the
// component itself). Kept separate from App.jsx to avoid a circular import between the
// two. 'admin-users' is deliberately NOT here — access to the Admin page itself is
// governed by the is_admin flag, not a per-page grant.
export const PAGE_REGISTRY = [
  { id: 'overview',      label: 'Executive Overview' },
  { id: 'finance',       label: 'Finance' },
  { id: 'financial',     label: 'Financial Performance',          parentId: 'finance' },
  { id: 'financial-2',   label: 'Detailed Financial Performance', parentId: 'finance' },
  { id: 'financial-bu',  label: 'P&L by Business Line',           parentId: 'finance' },
  { id: 'balance-sheet', label: 'Balance Sheet',                  parentId: 'finance' },
  { id: 'budget',        label: 'Corporate Budget',               parentId: 'finance' },
  { id: 'safee-budget',  label: 'SAFEE Budget Analysis',          parentId: 'finance' },
  { id: 'collections',   label: 'Collections & Revenue',          parentId: 'finance' },
  { id: 'cashflow',      label: 'Cashflow',                       parentId: 'finance' },
  { id: 'tax',           label: 'Tax',                            parentId: 'finance' },
  { id: 'aging',         label: 'Aging (AR/AP)',                  parentId: 'finance' },
  { id: 'procurement',   label: 'Procurement' },
  ...PROCUREMENT_REPORTS.map(r => ({ id: r.id, label: r.title, parentId: 'procurement' })),
  { id: 'kpi-dashboard', label: 'Group KPI Dashboard' },
  ...KPI_DEPARTMENTS.map(d => ({ id: d.id, label: d.name, parentId: 'kpi-dashboard' })),
  { id: 'lending',       label: 'Lending Ecosystem' },
  { id: 'risk',          label: 'Risk & Portfolio' },
  { id: 'hr',                     label: 'People & Operations Old' },
  { id: 'hr-summary',             label: 'People & Culture' },
  { id: 'employee-cost',          label: 'Employee Cost',       parentId: 'hr' },
  { id: 'employee-cost-detail',   label: 'Cost by BU',          parentId: 'hr' },
  { id: 'employee-cost-variance', label: 'MoM Comparison',      parentId: 'hr' },
  { id: 'hr-page-review',         label: 'HR Analysis' },
  { id: 'department-overrides',   label: 'Organization Mapping', parentId: 'hr-page-review' },
]
