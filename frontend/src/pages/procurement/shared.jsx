import { useState } from 'react'

// Explicit hex everywhere for structural surfaces (see the note in Procurement.jsx) — same
// palette as Aging / Financial Performance so the finance pages read as one family.
export const NAVY   = '#02404F'
export const TEAL   = '#1FB6A6'
export const ORANGE = '#EB7D23'
export const RED    = '#E5544B'
export const GREEN  = '#2EBD85'
export const DTEAL  = '#1A7A72'
export const BLUE   = '#3FA7E1'
export const SERIES_COLORS = [ORANGE, TEAL, BLUE, RED, '#B0862E', '#7A2E8A', GREEN, DTEAL]
export const ROW_BG = { even: '#0A3A46', odd: '#0E434D' }
export const AXIS_TICK = { fontSize: 10, fill: '#9FB4BD' }
export const GRID_STROKE = 'rgba(255,255,255,.08)'
export const TOOLTIP_STYLE = {
  contentStyle: { background: '#0A3A46', border: '1px solid rgba(255,255,255,.15)', borderRadius: 10, fontSize: 11 },
  labelStyle: { color: '#FFFFFF', fontWeight: 700 },
  itemStyle: { color: '#E6F0F3' },
  cursor: { fill: 'rgba(255,255,255,.05)' },
}

// Raw currency amounts (unlike lib/fmt.js's fmtETB, which expects ETB *millions*).
export function fmtMoney(v, cur = 'ETB', dec = 1) {
  if (v == null || isNaN(v)) return '—'
  const abs = Math.abs(v)
  const s = abs >= 1e9 ? `${(v / 1e9).toFixed(dec)}B` : abs >= 1e6 ? `${(v / 1e6).toFixed(dec)}M` : abs >= 1e3 ? `${(v / 1e3).toFixed(dec)}K` : v.toFixed(0)
  return `${cur} ${s}`
}
// Props for a month-category XAxis. Rotated so 13-20 monthly labels stay legible instead of
// running into each other at typical chart widths.
export const monthAxis = dataKey => ({
  dataKey, tickFormatter: fmtMonth, interval: 0, height: 46, axisLine: false, tickLine: false,
  tick: { ...AXIS_TICK, angle: -40, textAnchor: 'end' },
})
export const fmtInt = n => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString())
export const fmtDay = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Fixed 3-letter months — toLocaleDateString('en-GB') renders September as "Sept", which
// makes the axis labels uneven and crowds the right-hand end of a 13-month chart.
export const fmtMonth = m => (m ? `${MONTH_ABBR[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}` : '—')
export const truncateLabel = (s, max = 18) => (s && s.length > max ? `${s.slice(0, max - 1)}…` : s)
export const daysBetween = (fromIso, toIso) => Math.round((new Date(toIso + 'T12:00:00') - new Date(fromIso + 'T12:00:00')) / 86400000)

export function sumBy(rows, fn) { return rows.reduce((s, r) => s + (fn(r) || 0), 0) }
export function groupBy(rows, keyFn, valFn = () => 1) {
  const m = new Map()
  rows.forEach(r => { const k = keyFn(r); const g = m.get(k) || { key: k, n: 0, total: 0 }; g.n++; g.total += valFn(r) || 0; m.set(k, g) })
  return [...m.values()]
}

export function Kpi({ label, value, sub, accent, onClick, selected }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex flex-col justify-start p-4 rounded-xl text-left transition-transform disabled:cursor-default"
      style={{
        background: accent || NAVY,
        boxShadow: selected ? `0 0 0 2px #FFFFFF, 0 0 0 4px ${accent || NAVY}` : 'none',
        cursor: onClick ? 'pointer' : 'default',
        transform: selected ? 'scale(1.02)' : 'none',
      }}
    >
      <p className="text-[9px] uppercase tracking-widest font-bold text-white/60 leading-tight">{label}</p>
      <p className="font-black text-white leading-none mt-2 tabular-nums text-xl">{value}</p>
      {sub && <p className="text-[10px] text-white/55 mt-1.5 leading-snug">{sub}</p>}
    </button>
  )
}

export function Panel({ title, subtitle, right, children }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-bold text-navy">{title}</h3>}
            {subtitle && <p className="text-[11px] text-muted mt-0.5 leading-snug">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

const NOTICE_TONES = {
  info: { border: 'rgba(63,167,225,.5)', bg: 'rgba(63,167,225,.10)', dot: BLUE },
  warn: { border: 'rgba(235,125,35,.55)', bg: 'rgba(235,125,35,.10)', dot: ORANGE },
  bad:  { border: 'rgba(229,84,75,.55)', bg: 'rgba(229,84,75,.10)', dot: RED },
}
export function Notice({ tone = 'info', title, children }) {
  const t = NOTICE_TONES[tone]
  return (
    <div className="rounded-2xl border px-4 py-3 flex gap-3" style={{ borderColor: t.border, background: t.bg }}>
      <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: t.dot }} />
      <div className="min-w-0">
        {title && <p className="text-xs font-bold text-navy mb-0.5">{title}</p>}
        <div className="text-[11px] text-muted leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

export function PageHeader({ category, title, subtitle, asOf }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted mb-1">{category}</p>
      <h2 className="text-lg font-extrabold text-navy mb-0.5">{title}</h2>
      <p className="text-xs text-muted font-medium">{subtitle}{asOf ? ` · as of ${asOf}` : ''}</p>
    </div>
  )
}

// Same solid-navy header + dark zebra rows as the Financial/Aging drilldowns.
export function DrillTable({ columns, rows, emptyLabel, maxHeight }) {
  if (!rows.length) return <p className="text-xs text-muted py-6 text-center">{emptyLabel || 'No data'}</p>
  return (
    <div className="overflow-auto -mx-5 px-5" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full text-sm min-w-[520px]">
        <thead className="sticky top-0">
          <tr style={{ background: NAVY }}>
            {columns.map(c => (
              <th key={c.key} className={`py-2.5 px-3 text-[10px] font-bold text-white/70 uppercase tracking-wider whitespace-nowrap ${c.align === 'left' ? 'text-left' : 'text-right'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? ROW_BG.even : ROW_BG.odd }}>
              {columns.map(c => (
                <td
                  key={c.key}
                  className={`py-2 px-3 text-xs ${c.align === 'left' ? 'text-left font-bold text-white' : 'text-right font-semibold'} ${c.wrap ? '' : 'whitespace-nowrap'}`}
                  style={c.align === 'left' ? undefined : { color: c.color ? c.color(r) : '#FFFFFF' }}
                >
                  {c.format ? c.format(r[c.key], r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Gate for every data-driven procurement page. Explains exactly *why* there's nothing to
// show — snapshot predates procurement, endpoint missing (404), or endpoint connected but
// returning zero rows — instead of rendering empty charts that look like a bug.
export function ProcData({ data, need, children }) {
  const proc = data?.procurement
  if (!proc) {
    return (
      <Notice tone="warn" title="Procurement data isn't in this snapshot">
        Procurement is only pulled for the latest snapshot (its Business Central sources have no point-in-time filter, so
        historical dates can't be rebuilt). Switch the date picker back to <strong>Latest</strong>, or refresh to run a new sync.
      </Notice>
    )
  }
  const keys = Array.isArray(need) ? need : [need]
  for (const k of keys) {
    const ep = proc.endpoints?.[k]
    if (!ep) continue
    if (!ep.ok) {
      return (
        <Notice tone="bad" title={`${ep.name} could not be read`}>
          {ep.error || 'The endpoint returned an error.'}
        </Notice>
      )
    }
    if (ep.rows === 0) {
      return (
        <Notice tone="warn" title={`${ep.name} is connected but returned 0 rows`}>
          The endpoint exists and answered, but Business Central has no records for it right now.
        </Notice>
      )
    }
  }
  return children(proc)
}

// Foreign-currency POs can't be added into ETB totals (no FX rate anywhere on these
// endpoints), so every ETB figure excludes them and this line says so, with their native totals.
export function ForeignNote({ rows, valueKey = 'amt', label = 'POs' }) {
  const foreign = rows.filter(r => r.cur !== 'ETB')
  if (!foreign.length) return null
  const by = new Map()
  foreign.forEach(r => by.set(r.cur, (by.get(r.cur) || 0) + (r[valueKey] || 0)))
  return (
    <Notice tone="info" title={`${foreign.length} foreign-currency ${label} are excluded from the ETB totals`}>
      No exchange rate is available on these endpoints, so they aren't converted or added in. Native totals:{' '}
      {[...by.entries()].map(([c, v]) => `${c} ${Math.round(v).toLocaleString()}`).join(' · ')}.
    </Notice>
  )
}

export function useSelection() {
  const [sel, setSel] = useState(null)
  return [sel, (k) => setSel(cur => (cur === k ? null : k))]
}

export function legendFormatter(v) { return <span style={{ color: '#CFE0E6', fontSize: 11 }}>{v}</span> }
