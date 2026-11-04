// All snapshot values are stored in ETB millions (via toM). Scale: ≥1000M → B, else → M.
// `trim`, when true, drops trailing zeros beyond 2 decimals (e.g. dec=4's "0.6600M" reads
// as "0.66M", while a genuinely 4-decimal figure like "0.6785M" is left exactly as computed)
// instead of always padding out to `dec` places — for a page whose real precision varies
// line to line (SAFEE Budget's small intervention-level figures) rather than being uniform.
export const fmtETB = (n, dec = 1, trim = false) => {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  const scaled = abs >= 1000 ? v / 1000 : v
  const suffix = abs >= 1000 ? 'B' : 'M'
  let text = scaled.toFixed(dec)
  if (trim && text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '')
  return text + suffix
}

export const fmtPct = (n, dec = 1) =>
  n == null || isNaN(n) ? '—' : Number(n).toFixed(dec) + '%'

export const fmtNum = (n) =>
  n == null ? '—' : Number(n).toLocaleString()

export const fmtDate = (s) =>
  s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
