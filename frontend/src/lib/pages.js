// Central id/label/parentId registry for every dashboard page — the single source of
// truth shared by App.jsx (which pairs each entry with its actual Page component) and
// the Admin page's per-user page-access toggles (which only need id+label, not the
// component itself). Kept separate from App.jsx to avoid a circular import between the
// two. 'admin-users' is deliberately NOT here — access to the Admin page itself is
// governed by the is_admin flag, not a per-page grant.
export const PAGE_REGISTRY = [
  { id: 'overview',      label: 'Executive Overview' },
  { id: 'financial',     label: 'Financial Performance' },
  { id: 'budget',        label: 'Corporate Budget' },
  { id: 'collections',   label: 'Collections & Revenue' },
  { id: 'balance-sheet', label: 'Balance Sheet' },
  { id: 'cashflow',      label: 'Cashflow' },
  { id: 'tax',           label: 'Tax' },
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
