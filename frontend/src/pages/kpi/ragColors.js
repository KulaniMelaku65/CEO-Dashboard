// Shared Red/Amber/Green palette + dark-surface constants for the whole KPI module —
// same explicit-hex convention used everywhere else in this app (NAVY/ROW_BG duplicated
// across Financial.jsx, Aging.jsx, Procurement.jsx, etc.) rather than Tailwind classes that
// don't repaint for dark mode.
export const NAVY = '#0F5565'
export const ROW_BG = { even: 'var(--tbl-row-even)', odd: 'var(--tbl-row-odd)' }

export const RAG_COLORS = {
  green: '#2E7D32',
  amber: '#EB7D23',
  red:   '#D32F2F',
  null:  '#6B7780', // not yet reported / can't auto-evaluate
}

export const RAG_LABELS = {
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  null: 'Pending',
}

export function ragColor(status) {
  return RAG_COLORS[status ?? 'null'] || RAG_COLORS.null
}

export function ragLabel(status) {
  return RAG_LABELS[status ?? 'null'] || RAG_LABELS.null
}

export function currentPeriod() {
  return new Date().toISOString().slice(0, 7) // 'YYYY-MM'
}
