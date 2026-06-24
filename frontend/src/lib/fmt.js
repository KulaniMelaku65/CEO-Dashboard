// All snapshot values are stored in ETB millions (via toM). Scale: ≥1000M → B, else → M.
export const fmtETB = (n, dec = 1) => {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1000) return (v / 1000).toFixed(dec) + 'B'
  return v.toFixed(dec) + 'M'
}

export const fmtPct = (n, dec = 1) =>
  n == null || isNaN(n) ? '—' : Number(n).toFixed(dec) + '%'

export const fmtNum = (n) =>
  n == null ? '—' : Number(n).toLocaleString()

export const fmtDate = (s) =>
  s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
