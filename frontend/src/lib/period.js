// Aggregates a monthly series (array of { label, ...numericKeys }, Jan→Dec order) into
// Quarterly or Annually buckets by summing. 'monthly' is a passthrough. Calendar-year
// quarters (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec), matching the fiscal year config (FY_START
// is Jan 1) — so this needs no knowledge of which months are actually present beyond order.
export const PERIOD_MODES = ['monthly', 'quarterly', 'annually']

export function aggregateByPeriod(rows, mode) {
  if (mode === 'monthly' || !rows || rows.length === 0) return rows || []
  const numericKeys = Object.keys(rows[0]).filter(k => k !== 'label')
  const sumRows = (chunk, label) => {
    const out = { label }
    numericKeys.forEach(k => { out[k] = chunk.reduce((s, r) => s + (r[k] || 0), 0) })
    return out
  }
  if (mode === 'annually') return [sumRows(rows, 'FY')]
  // quarterly — group every 3 consecutive months (Jan-Mar = Q1, etc.)
  const quarters = []
  for (let i = 0; i < rows.length; i += 3) {
    const chunk = rows.slice(i, i + 3)
    if (chunk.length) quarters.push(sumRows(chunk, `Q${quarters.length + 1}`))
  }
  return quarters
}
