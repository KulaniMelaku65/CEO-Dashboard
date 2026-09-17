// Shared Red/Amber/Green palette + dark-surface constants for the whole KPI module —
// same explicit-hex convention used everywhere else in this app (NAVY/ROW_BG duplicated
// across Financial.jsx, Aging.jsx, Procurement.jsx, etc.) rather than Tailwind classes that
// don't repaint for dark mode.
export const NAVY = '#02404F'
export const ROW_BG = { even: '#0A3A46', odd: '#0E434D' }

export const RAG_COLORS = {
  green: '#2EBD85',
  amber: '#EB7D23',
  red:   '#E5544B',
  null:  '#6B7C93', // not yet reported / can't auto-evaluate
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
