export const fmtETB = (n, dec = 1) => {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1e9) return (v / 1e9).toFixed(dec) + 'B'
  if (abs >= 1e6) return (v / 1e6).toFixed(dec) + 'M'
  if (abs >= 1e3) return (v / 1e3).toFixed(dec) + 'K'
  return v.toFixed(0)
}

export const fmtPct = (n, dec = 1) =>
  n == null || isNaN(n) ? '—' : Number(n).toFixed(dec) + '%'

export const fmtNum = (n) =>
  n == null ? '—' : Number(n).toLocaleString()

export const fmtDate = (s) =>
  s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
