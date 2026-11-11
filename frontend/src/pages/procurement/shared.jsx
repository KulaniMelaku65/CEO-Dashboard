import { useMemo, useState } from 'react'
import { PeriodTree, usePeriodSelection } from '../../components/PeriodFilterBar.jsx'

// Explicit hex everywhere for structural surfaces (see the note in Procurement.jsx) — same
// palette as Aging / Financial Performance so the finance pages read as one family.
export const NAVY   = '#0F5565'
export const TEAL   = '#12707F'
export const ORANGE = '#EB7D23'
export const RED    = '#D32F2F'
export const GREEN  = '#2E7D32'
export const DTEAL  = '#1A7A72'
export const BLUE   = '#3FA7E1'
export const SERIES_COLORS = [ORANGE, TEAL, BLUE, RED, '#B0862E', '#7A2E8A', GREEN, DTEAL]
export const ROW_BG = { even: 'var(--tbl-row-even)', odd: 'var(--tbl-row-odd)' }
export const AXIS_TICK = { fontSize: 10, fill: 'var(--chart-axis)' }
export const GRID_STROKE = 'var(--chart-grid)'
export const TOOLTIP_STYLE = { // retheme-skip
  contentStyle: { background: '#0A3A46', border: '1px solid rgba(255,255,255,.15)', borderRadius: 10, fontSize: 11 }, // retheme-skip
  labelStyle: { color: '#FFFFFF', fontWeight: 700 },
  itemStyle: { color: '#E6F0F3' },
  cursor: { fill: 'var(--chart-cursor)' },
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
// Same shape as procurement-builder.js's own groupSum — multiple summed fields per
// group instead of groupBy's single `total` — used to re-derive the commitments/
// variance/offContract aggregates client-side for whatever period is selected.
function groupSumMulti(rows, keyFn, valFns) {
  const m = new Map()
  rows.forEach(r => {
    const k = keyFn(r)
    if (!m.has(k)) m.set(k, { key: k, n: 0, ...Object.fromEntries(Object.keys(valFns).map(f => [f, 0])) })
    const g = m.get(k)
    g.n++
    Object.entries(valFns).forEach(([f, fn]) => { g[f] += fn(r) || 0 })
  })
  return [...m.values()]
}
const round2 = n => Math.round((n || 0) * 100) / 100
const monthOf = d => (d || '').slice(0, 7)

// ── Filter by Period ─────────────────────────────────────────────────────────────
// Each entity now carries its FULL multi-year history (procurement-builder.js no
// longer pre-filters to one year) — this Year dropdown + the same PeriodTree/
// usePeriodSelection (YTD/Quarter/Month checkbox tree) Financial Performance uses
// together pick the year first, then optionally narrow to a quarter/month within it.
// mData is that selected year's 12 real calendar months, so PeriodTree's own quarter
// grouping lines up with real Jan-Mar/Apr-Jun/etc. quarters. The year is always
// enforced (not just when a quarter/month is picked), so "YTD" still means "this
// year", not "every year since inception" — same default-to-current-year outcome the
// previous backend-side filter gave, just interactive instead of fixed.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const buildProcMonthData = year => MONTH_NAMES.map(m => ({ label: `${m} ${year}` }))
// Years offered go back to the earliest year BC has any procurement activity for (same
// 2024 floor Cashflow's own Year/Month filter uses) through the current calendar year.
export function procYearOptions() {
  const current = new Date().getFullYear()
  const years = []
  for (let y = current; y >= 2024; y--) years.push(y)
  return years
}

function inPeriod(dateStr, year, monthSet) {
  if (!dateStr) return false
  if (Number(dateStr.slice(0, 4)) !== Number(year)) return false
  return !monthSet || monthSet.has(Number(dateStr.slice(5, 7)) - 1)
}
const filterRows = (rows, dateKey, year, monthSet) => rows.filter(r => inPeriod(r[dateKey], year, monthSet))

// Re-derive commitments/variance/offContract's own totals/byMonth/byBU/byVendor/
// byBudget/topDocs/topLines from their (now period-filtered) raw rows — the exact same
// aggregation procurement-builder.js does server-side for the unfiltered/full-year
// view, just run here so a period change doesn't need a new snapshot sync.
function rebuildCommitments(rows) {
  const dates = rows.map(r => r.date).filter(Boolean).sort()
  return {
    entries: rows.length,
    totals: { lcy: round2(sumBy(rows, r => r.lcy)), usd: round2(sumBy(rows, r => r.usd)) },
    dateFrom: dates[0] || null, dateTo: dates[dates.length - 1] || null,
    byMonth: groupSumMulti(rows, r => monthOf(r.date), { lcy: r => r.lcy, usd: r => r.usd })
      .map(g => ({ m: g.key, n: g.n, lcy: round2(g.lcy), usd: round2(g.usd) })).sort((a, b) => a.m.localeCompare(b.m)),
    byBU: groupSumMulti(rows, r => r.bu || '', { lcy: r => r.lcy, usd: r => r.usd })
      .map(g => ({ bu: g.key, n: g.n, lcy: round2(g.lcy), usd: round2(g.usd) })).sort((a, b) => b.lcy - a.lcy).slice(0, 15),
    byBudget: groupSumMulti(rows, r => r.budget, { lcy: r => r.lcy, usd: r => r.usd })
      .map(g => ({ budget: g.key, n: g.n, lcy: round2(g.lcy), usd: round2(g.usd) })),
    topDocs: groupSumMulti(rows, r => r.doc, { lcy: r => r.lcy, usd: r => r.usd })
      .map(g => ({ doc: g.key, n: g.n, lcy: round2(g.lcy), usd: round2(g.usd) })).sort((a, b) => b.lcy - a.lcy).slice(0, 25),
  }
}
function rebuildVariance(rows, foreign) {
  const vNameByNo = {}
  rows.forEach(r => { if (!vNameByNo[r.vn]) vNameByNo[r.vn] = r.v })
  return {
    lines: rows.length, etbLines: rows.length,
    totals: {
      ordered: round2(sumBy(rows, r => r.amt)), received: round2(sumBy(rows, r => r.recAmt)), invoiced: round2(sumBy(rows, r => r.invAmt)),
      receivedNotInvoiced: round2(sumBy(rows, r => r.rni)), outstandingInclVat: round2(sumBy(rows, r => r.out)),
      linesWithReceipt: rows.filter(r => r.qr > 0).length, linesWithInvoice: rows.filter(r => r.qi > 0).length,
    },
    foreign,
    byBU: groupSumMulti(rows, r => r.bu || '', { ordered: r => r.amt, outstanding: r => r.out })
      .map(g => ({ bu: g.key, lines: g.n, ordered: round2(g.ordered), outstanding: round2(g.outstanding) })).sort((a, b) => b.ordered - a.ordered).slice(0, 15),
    byVendor: groupSumMulti(rows, r => r.vn, { ordered: r => r.amt, outstanding: r => r.out })
      .map(g => ({ vn: g.key, v: vNameByNo[g.key] || g.key, lines: g.n, ordered: round2(g.ordered), outstanding: round2(g.outstanding) })).sort((a, b) => b.ordered - a.ordered).slice(0, 15),
    topLines: [...rows].sort((a, b) => b.amt - a.amt).slice(0, 25).map(l => ({
      po: l.po, ln: l.ln, no: l.no, desc: l.desc, vn: l.vn, v: l.v, qty: l.qty, qr: l.qr, qi: l.qi, amt: l.amt, out: l.out, bu: l.bu,
    })),
  }
}
function rebuildOffContract(rows, foreign) {
  const offOnly = rows.filter(r => !r.onContract)
  const offValue = sumBy(offOnly, r => r.value)
  const onValue = sumBy(rows.filter(r => r.onContract), r => r.value)
  const vendorAgg = new Map()
  offOnly.forEach(l => {
    const a = vendorAgg.get(l.vn) || { vn: l.vn, v: l.v, poSet: new Set(), lines: 0, value: 0 }
    a.poSet.add(l.po); a.lines++; a.value += l.value || 0
    vendorAgg.set(l.vn, a)
  })
  return {
    lines: rows.length, pos: new Set(rows.map(r => r.po)).size, etbLines: rows.length, etbPos: new Set(rows.map(r => r.po)).size,
    onContractLines: rows.filter(r => r.onContract).length, zeroValueLines: rows.filter(r => !r.value).length,
    totals: {
      value: round2(offValue + onValue), offContract: round2(offValue), onContract: round2(onValue),
      offContractPct: offValue + onValue > 0 ? round2((offValue / (offValue + onValue)) * 100) : null,
    },
    foreign,
    byVendor: [...vendorAgg.values()].map(a => ({ vn: a.vn, v: a.v, pos: a.poSet.size, lines: a.lines, value: round2(a.value) })).sort((a, b) => b.value - a.value).slice(0, 25),
    vendors: vendorAgg.size,
    byBU: groupSumMulti(offOnly, r => r.bu || '', { value: r => r.value }).map(g => ({ bu: g.key, lines: g.n, value: round2(g.value) })).sort((a, b) => b.value - a.value).slice(0, 15),
    byMonth: groupSumMulti(offOnly.filter(r => r.date), r => monthOf(r.date), { value: r => r.value }).map(g => ({ m: g.key, lines: g.n, value: round2(g.value) })).sort((a, b) => a.m.localeCompare(b.m)),
  }
}

// Applies the selected period to every entity ProcData hands to a page — raw-row
// entities (po/spend/requisitions/pendingPr/vendorDelivery) just get their `.rows`
// filtered (the pages already aggregate those client-side); commitments/variance/
// offContract get their own aggregates rebuilt from their (now filtered) rows so every
// total/chart/table downstream stays correct instead of silently reverting to the
// full year. `budget` is deliberately left alone — a programme budget's own span
// already defines its scope (Corporate/SAFEE Budget Analysis), not this calendar period.
function applyPeriod(proc, year, monthSet) {
  const poRows = filterRows(proc.po?.rows || [], 'od', year, monthSet)
  const spendRows = filterRows(proc.spend?.rows || [], 'd', year, monthSet)
  const reqRows = filterRows(proc.requisitions?.rows || [], 'd', year, monthSet)
  const pendRows = filterRows(proc.pendingPr?.rows || [], 'd', year, monthSet)
  const vdRows = filterRows(proc.vendorDelivery?.rows || [], 'pd', year, monthSet)
  return {
    ...proc,
    po: { rows: poRows },
    spend: { rows: spendRows },
    requisitions: { ...proc.requisitions, rows: reqRows, count: reqRows.length },
    pendingPr: { ...proc.pendingPr, rows: pendRows, count: pendRows.length },
    vendorDelivery: { ...proc.vendorDelivery, rows: vdRows, count: vdRows.length },
    commitments: rebuildCommitments(filterRows(proc.commitments?.rows || [], 'date', year, monthSet)),
    variance: rebuildVariance(filterRows(proc.variance?.rows || [], 'date', year, monthSet), proc.variance?.foreign),
    offContract: rebuildOffContract(filterRows(proc.offContract?.rows || [], 'date', year, monthSet), proc.offContract?.foreign),
  }
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
      <p className="text-[9px] uppercase tracking-widest font-bold text-white/70 leading-tight">{label}</p>
      <p className="font-black text-white leading-none mt-2 tabular-nums text-xl">{value}</p>
      {sub && <p className="text-[10px] text-white/60 mt-1.5 leading-snug">{sub}</p>}
    </button>
  )
}

export function Panel({ title, subtitle, right, children }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-bold text-ink">{title}</h3>}
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
        {title && <p className="text-xs font-bold text-ink mb-0.5">{title}</p>}
        <div className="text-[11px] text-muted leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

export function PageHeader({ category, title, subtitle, asOf }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted mb-1">{category}</p>
      <h2 className="text-lg font-extrabold text-ink mb-0.5">{title}</h2>
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
          <tr style={{ background: 'var(--tbl-head-bg)', borderBottom: '1px solid var(--tbl-line)' }}>
            {columns.map(c => (
              <th key={c.key} className={`py-2.5 px-3 text-[10px] font-bold text-muted uppercase tracking-wider whitespace-nowrap ${c.align === 'left' ? 'text-left' : 'text-right'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? ROW_BG.even : ROW_BG.odd }}>
              {columns.map(c => (
                <td
                  key={c.key}
                  className={`py-2 px-3 text-xs ${c.align === 'left' ? 'text-left font-bold text-ink' : 'text-right font-semibold'} ${c.wrap ? '' : 'whitespace-nowrap'}`}
                  style={c.align === 'left' ? undefined : { color: c.color ? c.color(r) : 'var(--tbl-fg)' }}
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
// returning zero rows — instead of rendering empty charts that look like a bug. Also
// renders the Filter by Period control (unless `noPeriodFilter`) and re-scopes every
// entity it hands to `children` to whatever period is selected — see applyPeriod above.
export function ProcData({ data, need, children, noPeriodFilter }) {
  const proc = data?.procurement
  // Hooks run unconditionally (before the early returns below) per the Rules of Hooks —
  // the default year only needs procYear, which is on every snapshot regardless of
  // whether this particular entity's endpoint is ok.
  const defaultYear = proc?.procYear || new Date().getFullYear()
  const [year, setYear] = useState(defaultYear)
  const mData = useMemo(() => buildProcMonthData(year), [year])
  const sel = usePeriodSelection(mData)

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
  const monthSet = sel.selMonths.length ? new Set(sel.selMonths) : null
  const scoped = applyPeriod(proc, year, monthSet)
  return (
    <>
      {!noPeriodFilter && (
        <div className="flex flex-wrap items-end gap-2.5 justify-end">
          <div className="flex flex-col gap-1" style={{ minWidth: 100 }}>
            <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Year</span>
            <select
              value={year}
              onChange={e => { setYear(Number(e.target.value)); sel.setSelMonths([]) }}
              className="bg-white border border-border rounded-xl px-3 py-2 text-xs font-bold text-ink outline-none focus:border-navy"
            >
              {procYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <PeriodTree mData={mData} selected={sel.selMonths} onChange={sel.setSelMonths} />
          {(sel.selMonths.length > 0 || year !== defaultYear) && (
            <button
              onClick={() => { sel.clearPeriod(); setYear(defaultYear) }}
              className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-ink hover:border-navy transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {children(scoped)}
    </>
  )
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

export function legendFormatter(v) { return <span style={{ color: 'var(--tbl-fg-muted)', fontSize: 11 }}>{v}</span> }
