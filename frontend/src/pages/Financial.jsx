import { useEffect, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from 'recharts'
import { fmtETB, fmtPct } from '../lib/fmt.js'
import { aggregateByPeriod } from '../lib/period.js'
import PeriodToggle from '../components/PeriodToggle.jsx'

// Multi-select dropdown (checkboxes) for Virtual Company / Business Unit — same pattern
// as the Tax page's tax-type filter: a native <select> can't do usable multi-select.
function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const toggle = (val) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val])
  const summary = selected.length === 0 ? 'All' : selected.length === 1
    ? (options.find(o => o.value === selected[0])?.label || selected[0])
    : `${selected.length} selected`

  return (
    <div ref={ref} className="relative flex flex-col gap-1" style={{ minWidth: 160 }}>
      <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">{label}</span>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between gap-2 bg-white border border-border rounded-xl px-3 py-2 text-xs font-bold text-navy"
      >
        <span className="truncate">{summary}</span>
        <span className="text-muted text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-border rounded-xl shadow-card z-20 py-1.5 max-h-72 overflow-y-auto">
          <button
            onClick={() => onChange([])}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold text-navy hover:bg-[#F0F7F6]"
          >
            All {selected.length === 0 && <span>✓</span>}
          </button>
          <div className="border-t border-border my-1" />
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-xs text-navy hover:bg-[#F0F7F6] cursor-pointer">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// Hierarchical Quarter → Month checkbox tree, matching the ERP's own "Filter By
// Period" slicer: each quarter has its own checkbox (checked/unchecked/indeterminate
// depending on how many of its months are selected) plus an expand/collapse arrow to
// reveal its 3 months individually. Checking a quarter selects/clears all of its
// months at once; checking one month just toggles that month. Operates purely on month
// indices (`selected`/`onChange` are the same selMonths state everything else reads),
// so a quarter is a selection shortcut, not a separate filter dimension.
function PeriodTree({ mData, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())
  const ref = useRef(null)

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const quarters = [0, 1, 2, 3].map(q => {
    const months = [q * 3, q * 3 + 1, q * 3 + 2].filter(i => i < mData.length)
    const checkedCount = months.filter(i => selected.includes(i)).length
    return { q, months, state: months.length === 0 ? 'empty' : checkedCount === 0 ? 'none' : checkedCount === months.length ? 'all' : 'partial' }
  }).filter(qt => qt.months.length > 0)

  const toggleMonth = (i) => onChange(selected.includes(i) ? selected.filter(v => v !== i) : [...selected, i])
  const toggleQuarter = (qt) => onChange(qt.state === 'all'
    ? selected.filter(v => !qt.months.includes(v))
    : [...new Set([...selected, ...qt.months])])
  const toggleExpanded = (q) => setExpanded(cur => {
    const next = new Set(cur)
    next.has(q) ? next.delete(q) : next.add(q)
    return next
  })

  const fullQuarterMatch = quarters.find(qt => qt.state === 'all' && qt.months.length === 3 && selected.length === 3)
  const summary = selected.length === 0 ? 'YTD'
    : fullQuarterMatch ? `Qtr ${fullQuarterMatch.q + 1}`
    : selected.length === 1 ? mData[selected[0]]?.label
    : `${selected.length} months`

  return (
    <div ref={ref} className="relative flex flex-col gap-1" style={{ minWidth: 170 }}>
      <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Filter by Period</span>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between gap-2 bg-white border border-border rounded-xl px-3 py-2 text-xs font-bold text-navy"
      >
        <span className="truncate">{summary}</span>
        <span className="text-muted text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-border rounded-xl shadow-card z-20 py-1.5 max-h-80 overflow-y-auto">
          <button
            onClick={() => onChange([])}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold text-navy hover:bg-[#F0F7F6]"
          >
            YTD (all) {selected.length === 0 && <span>✓</span>}
          </button>
          <div className="border-t border-border my-1" />
          {quarters.map(qt => (
            <div key={qt.q}>
              <div className="flex items-center gap-1 px-1.5 py-1 hover:bg-[#F0F7F6]">
                <button
                  onClick={() => toggleExpanded(qt.q)}
                  className="w-5 h-5 flex items-center justify-center text-muted flex-shrink-0"
                >
                  {expanded.has(qt.q) ? '−' : '+'}
                </button>
                <label className="flex items-center gap-2 flex-1 px-1.5 py-0.5 text-xs font-bold text-navy cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qt.state === 'all'}
                    ref={el => { if (el) el.indeterminate = qt.state === 'partial' }}
                    onChange={() => toggleQuarter(qt)}
                    className="w-3.5 h-3.5 flex-shrink-0"
                  />
                  Qtr {qt.q + 1}
                </label>
              </div>
              {expanded.has(qt.q) && (
                <div className="pl-9">
                  {qt.months.map(i => (
                    <label key={i} className="flex items-center gap-2 px-1.5 py-1 text-xs text-navy hover:bg-[#F0F7F6] cursor-pointer">
                      <input type="checkbox" checked={selected.includes(i)} onChange={() => toggleMonth(i)} className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{mData[i]?.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Explicit MoM/QoQ baseline picker — only rendered once the period filter has
// narrowed to a single month or a single full quarter (see `compareMode` in the
// main component), since that's the only case where "compare to" has one
// consistent granularity of options to offer. Picking nothing keeps the default
// of comparing against the immediately preceding month/quarter.
function ComparePicker({ mode, mData, current, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const options = mode === 'month'
    ? mData.map((m, i) => ({ value: i, label: m.label })).filter(o => o.value !== current)
    : [0, 1, 2, 3]
        .map(q => ({ value: q, label: `Qtr ${q + 1}`, months: [q * 3, q * 3 + 1, q * 3 + 2].filter(i => i < mData.length) }))
        .filter(o => o.months.length === 3 && o.value !== current)

  const autoLabel = mode === 'month'
    ? (current > 0 ? mData[current - 1]?.label : null)
    : (current > 0 ? `Qtr ${current}` : null)

  const summary = value != null
    ? (mode === 'month' ? mData[value]?.label : `Qtr ${value + 1}`)
    : autoLabel ? `Auto (${autoLabel})` : 'Auto (none)'

  return (
    <div ref={ref} className="relative flex flex-col gap-1" style={{ minWidth: 150 }}>
      <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Compare To</span>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between gap-2 bg-white border border-border rounded-xl px-3 py-2 text-xs font-bold text-navy"
      >
        <span className="truncate">{summary}</span>
        <span className="text-muted text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-border rounded-xl shadow-card z-20 py-1.5 max-h-72 overflow-y-auto">
          <button
            onClick={() => { onChange(null); setOpen(false) }}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold text-navy hover:bg-[#F0F7F6]"
          >
            <span className="truncate">{autoLabel ? `Auto (${autoLabel})` : 'Auto (none)'}</span>
            {value == null && <span>✓</span>}
          </button>
          <div className="border-t border-border my-1" />
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-navy hover:bg-[#F0F7F6]"
            >
              <span className="truncate">{o.label}</span>
              {value === o.value && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const LINE_COLORS = {
  Revenue:        '#02404F',
  'Cost of Sales':'#E5544B',
  Expenses:       '#EB7D23',
  'Gross Profit': '#1FB6A6',
  EBITDA:         '#2EBD85',
}

// Hidden for now — not currently wanted on this page. Underlying data/logic is left
// untouched so flipping any of these back to true brings that section right back.
const SHOW_TREND_CHART       = false // "Monthly/Quarterly/Annual Revenue vs Budget" chart + "P&L Budget Attainment" gauges
const SHOW_INCOME_STATEMENT  = false
const SHOW_PL_STATEMENT      = false // "Profit & Loss Statement" full waterfall
const SHOW_MANAGEMENT_REPORT = false
const SHOW_BU_UTILIZATION    = false // "Budget Utilization by Business Unit"
const SHOW_REVENUE_BY_BANK   = false // "Revenue by Partner Bank — YTD (ETB)"
const SHOW_MONTH_CALLOUT     = false // "{Month} — Revenue vs Budget / Monthly Budget / Attainment / vs Budget" bar

const NAVY = '#02404F'
// Same dark zebra-stripe colors as the HR Analysis table — explicit backgrounds instead
// of relying on the light bg-bg/#F4F6FA classes to get repainted for the dark theme,
// which is exactly what left the drilldown table's header unreadable (white-ish text
// over an inline light-gray background the theme repaint can't reach).
const ROW_BG = { even: '#0A3A46', odd: '#0E434D' }

// One Budget/Actual/Variance/% table, reused for every drilldown section — "Expenses"
// shows three of these stacked (by Business Unit, HR salaries by department, OPEX by
// category) since that one KPI covers three genuinely different breakdowns, while
// Revenue/Cost of Sales/Gross Profit only ever need one. `priorRows`/`priorLabel` add a
// "vs Prior" MoM/QoQ column — only passed in when exactly one month or one full quarter
// is selected, since "prior period" isn't well-defined for YTD or an arbitrary mix of
// months (so the column just doesn't render otherwise, same rows as before).
function DrilldownTable({ rows, higherIsBetterHere, getName, expandedRow, setExpandedRow, priorRows, priorLabel }) {
  const rowStat = (row) => {
    const variance = (row.actual || 0) - (row.budget || 0)
    const good = higherIsBetterHere ? variance >= 0 : variance <= 0
    const pct = row.budget ? (row.actual / row.budget) * 100 : 0
    return { variance, pct, color: good ? '#2EBD85' : '#E5544B' }
  }
  const priorMap = priorRows ? new Map(priorRows.map(p => [p.unit, p])) : null
  const priorStat = (row) => {
    if (!priorMap) return null
    const priorActual = priorMap.get(row.unit)?.actual ?? 0
    if (priorActual === 0) return null
    const growth = ((row.actual - priorActual) / Math.abs(priorActual)) * 100
    const good = higherIsBetterHere ? growth >= 0 : growth <= 0
    return { growth, color: good ? '#2EBD85' : '#E5544B' }
  }
  const headers = priorMap ? ['Description', 'Budget', 'Actual', 'Variance', '%', `vs ${priorLabel}`] : ['Description', 'Budget', 'Actual', 'Variance', '%']
  return (
    <div className="overflow-x-auto -mx-5 px-5 rounded-xl">
      <table className="w-full text-sm min-w-[460px]">
        <thead>
          <tr style={{ background: NAVY }}>
            {headers.map((h, i) => (
              <th key={h} className={`py-2.5 px-3 text-[10px] font-bold text-white/70 uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((r, i) => {
            const neg = r.actual < 0
            const hasChildren = r.children?.length > 0
            const isOpen = hasChildren && expandedRow === r.unit
            const { variance, pct, color } = rowStat(r)
            const prior = priorStat(r)
            const rowBg = i % 2 === 0 ? ROW_BG.even : ROW_BG.odd
            const parentRow = (
              <tr
                key={r.unit}
                style={{ background: rowBg }}
                className={hasChildren ? 'cursor-pointer' : undefined}
                onClick={hasChildren ? () => setExpandedRow(o => o === r.unit ? null : r.unit) : undefined}
              >
                <td className="py-2.5 px-3">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    {hasChildren && <span className="text-white/50 w-2.5 inline-block">{isOpen ? '▾' : '▸'}</span>}
                    {getName(r.unit)}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-medium" style={{ color: 'rgba(255,255,255,.55)' }}>{fmtETB(Math.abs(r.budget || 0), 1)}</td>
                <td className="py-2.5 px-3 text-right font-bold" style={{ color: neg ? '#E5544B' : '#FFFFFF' }}>
                  {neg ? '-' : ''}{fmtETB(Math.abs(r.actual), 1)}
                </td>
                <td className="py-2.5 px-3 text-right font-semibold" style={{ color }}>
                  {variance >= 0 ? '+' : ''}{fmtETB(variance, 1)}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: `${color}30`, color }}>
                    {fmtPct(pct, 0)}
                  </span>
                </td>
                {priorMap && (
                  <td className="py-2.5 px-3 text-right">
                    {prior ? (
                      <span className="text-[11px] font-extrabold" style={{ color: prior.color }}>
                        {prior.growth >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(prior.growth), 0)}
                      </span>
                    ) : <span className="text-[11px] text-white/40">—</span>}
                  </td>
                )}
              </tr>
            )
            if (!isOpen) return [parentRow]
            const childRows = r.children.map(c => {
              const cNeg = c.actual < 0
              const { variance: cVariance, pct: cPct, color: cColor } = rowStat(c)
              return (
                <tr key={c.unit} style={{ background: '#123C46' }}>
                  <td className="py-2 pl-8 pr-3 text-[11px] font-semibold text-white">{getName(c.unit)}</td>
                  <td className="py-2 px-3 text-right text-[11px] font-medium" style={{ color: 'rgba(255,255,255,.55)' }}>{fmtETB(Math.abs(c.budget || 0), 1)}</td>
                  <td className="py-2 px-3 text-right text-[11px] font-bold" style={{ color: cNeg ? '#E5544B' : '#FFFFFF' }}>
                    {cNeg ? '-' : ''}{fmtETB(Math.abs(c.actual), 1)}
                  </td>
                  <td className="py-2 px-3 text-right text-[11px] font-semibold" style={{ color: cColor }}>
                    {cVariance >= 0 ? '+' : ''}{fmtETB(cVariance, 1)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full" style={{ background: `${cColor}30`, color: cColor }}>
                      {fmtPct(cPct, 0)}
                    </span>
                  </td>
                  {priorMap && <td className="py-2 px-3 text-right text-[11px] text-white/40">—</td>}
                </tr>
              )
            })
            return [parentRow, ...childRows]
          })}
        </tbody>
      </table>
    </div>
  )
}

function FinKpi({ line, selected, onClick, priorActual, priorLabel }) {
  const pct   = line.budget ? (line.actual / line.budget) * 100 : 0
  const good  = line.higherIsBetter ? pct >= 100 : pct <= 100
  const color = good ? '#2EBD85' : line.higherIsBetter ? '#E5544B' : '#EB7D23'
  const diff  = line.actual - line.budget

  // MoM/QoQ growth — only meaningful when a prior period is well-defined (a single
  // month or single quarter is selected), and only shown when the prior figure is
  // non-zero (otherwise a % growth is undefined/misleading).
  const priorGrowth = (priorActual != null && priorActual !== 0)
    ? ((line.actual - priorActual) / Math.abs(priorActual)) * 100
    : null
  const priorGood = priorGrowth != null && (line.higherIsBetter ? priorGrowth >= 0 : priorGrowth <= 0)

  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-2xl p-4 border text-left overflow-hidden relative transition-all hover:shadow-lg active:scale-[.98] w-full"
      style={{
        borderColor: selected ? color : '#E3E9F2',
        boxShadow: selected ? `0 0 0 2px ${color}30` : undefined,
      }}
    >
      {/* left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ background: color }} />

      <div className="pl-2">
        <div className="flex items-start justify-between mb-2 gap-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted leading-tight">{line.name}</p>
          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: `${color}18`, color }}>
            {fmtPct(pct, 0)}
          </span>
        </div>

        <p className="text-xl font-extrabold text-navy leading-none mb-3">
          ETB&nbsp;{fmtETB(line.actual)}
        </p>

        <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: '#F4F6FA' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(pct, 100)}%`, background: color, transition: 'width 1s ease' }}
          />
        </div>

        <p className="text-[10px] font-semibold" style={{ color }}>
          {diff >= 0 ? '▲' : '▼'} ETB {fmtETB(Math.abs(diff))} vs budget
        </p>
        {priorGrowth != null && (
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: priorGood ? '#2EBD85' : '#E5544B' }}>
            {priorGrowth >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(priorGrowth), 1)} vs {priorLabel}
          </p>
        )}
      </div>
    </button>
  )
}

const trendArrow = t => t === 'up' ? '↑' : t === 'down' ? '↓' : '→'
const trendColor = t => t === 'up' ? '#2EBD85' : t === 'down' ? '#E5544B' : '#6B7C93'

export default function Financial({ data }) {
  const lines          = data.budgetActual?.lines || []
  const lineDrilldowns = data.budgetActual?.lineDrilldowns || {}
  const monthly        = data.budgetOverview?.monthly
  const utilization    = data.corporateBudget?.byBU || []
  const dimNames       = data.dimensionNames || {}
  const revenueByBank  = data.financialSS?.revenueByBank || []

  // Ratios / full P&L waterfall / management report — merged in from the former
  // standalone Reports & Insights tab so Financial Performance is the single P&L tab.
  const reports    = data.reports || {}
  const ratios     = reports.ratios     || []
  const pl         = reports.pl         || []
  const management = reports.management || []

  const [selMonths,   setSelMonths]   = useState([]) // month indices; [] = YTD/all — the
                                                       // one filter both the period-tree
                                                       // dropdown and the chart's bar
                                                       // clicks read from and write to
  const [selVCs,      setSelVCs]      = useState([]) // [] = all virtual companies
  const [selBUs,      setSelBUs]      = useState([]) // [] = all business units
  const [compareIdx,  setCompareIdx]  = useState(null) // explicit MoM/QoQ baseline the user
                                                       // picked (month or quarter index,
                                                       // matching whichever is currently
                                                       // selected) — null = auto (immediately
                                                       // prior period)
  const [selLine,     setSelLine]     = useState(null)
  const [period,      setPeriod]      = useState('monthly') // chart aggregation only now
  const [expandedRow, setExpandedRow] = useState(null)

  const getName = code => dimNames[code] || code
  // These two drilldowns are broken out by the account schedule's own line items
  // (M-MGT-RPT), not by department, unlike the rest of the KPI cards.
  const isScheduleLineView = selLine === 'Revenue' || selLine === 'Cost of Sales'

  const mData = (monthly?.labels || []).map((label, i) => ({
    label,
    Budget: monthly.budget?.[i] || 0,
    Actual: monthly.actual?.[i] || 0,
  }))

  // Callout below only makes sense for a single selected month — with several selected,
  // the KPI cards/table already show the combined figures.
  const selM = selMonths.length === 1 ? mData[selMonths[0]] : null
  const chartData = aggregateByPeriod(mData, period)

  const toggleIn = (setter) => (val) => setter(cur => cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val])
  const toggleQuarterMonths = (q) => {
    const months = [q * 3, q * 3 + 1, q * 3 + 2].filter(i => i < mData.length)
    const allIn = months.length > 0 && months.every(i => selMonths.includes(i))
    setSelMonths(cur => allIn ? cur.filter(i => !months.includes(i)) : [...new Set([...cur, ...months])])
  }

  // Which calendar months are currently filtered — used to scope both the KPI cards
  // (via dimActual/dimBudget below) and the line-item drilldowns. Quarters are just a
  // bulk-selection shortcut over these same month indices, not a separate dimension.
  const explicitMonths = selMonths

  // Per (month, virtual company, business unit) raw figures — lets Revenue/Cost of
  // Sales/Gross Profit/Expenses/EBITDA be recomputed for any combination of selected
  // months/quarters/VCs/BUs, not just the one YTD total the server always sends. When
  // nothing at all is filtered, `lines` (the server's exact YTD, budget capped to months
  // that actually have data) is used as-is instead, so the unfiltered view is pixel-
  // identical to before rather than a client-side recomputation with its own rounding.
  const dimActual = data.budgetActual?.dimActual || []
  const dimBudget = data.budgetActual?.dimBudget || []
  const allVCs = [...new Set(dimActual.map(r => r.vc))].sort()
  const allBUs = [...new Set(dimActual.map(r => r.bu))].sort()
  const lastDataMonth = dimActual.length ? Math.max(...dimActual.map(r => r.mi)) : -1
  const defaultMonths = Array.from({ length: lastDataMonth + 1 }, (_, i) => i)
  const monthsForDim = explicitMonths.length ? explicitMonths : defaultMonths
  const anyFilterActive = explicitMonths.length > 0 || selVCs.length > 0 || selBUs.length > 0

  const sumDim = (rows, months, vcs, bus, metric) => rows
    .filter(r => months.includes(r.mi) && (!vcs.length || vcs.includes(r.vc)) && (!bus.length || bus.includes(r.bu)) && r.metric === metric)
    .reduce((s, r) => s + r.amount, 0)

  const computeLines = (months, vcs, bus) => {
    const rev = sumDim(dimActual, months, vcs, bus, 'rev'), revB  = sumDim(dimBudget, months, vcs, bus, 'rev')
    const cos = sumDim(dimActual, months, vcs, bus, 'cos'), cosB  = sumDim(dimBudget, months, vcs, bus, 'cos')
    const sal = sumDim(dimActual, months, vcs, bus, 'sal'), salB  = sumDim(dimBudget, months, vcs, bus, 'sal')
    const opex = sumDim(dimActual, months, vcs, bus, 'opex'), opexB = sumDim(dimBudget, months, vcs, bus, 'opex')
    const gp = rev - cos, exp = sal + opex, eb = gp - exp
    const gpB = revB - cosB, expB = salB + opexB, ebB = gpB - expB
    return [
      { name: 'Revenue',       actual: rev, budget: revB, higherIsBetter: true  },
      { name: 'Cost of Sales', actual: cos, budget: cosB, higherIsBetter: false },
      { name: 'Gross Profit',  actual: gp,  budget: gpB,  higherIsBetter: true  },
      { name: 'Expenses',      actual: exp, budget: expB, higherIsBetter: false },
      { name: 'EBITDA',        actual: eb,  budget: ebB,  higherIsBetter: true  },
    ]
  }

  const activeLines = anyFilterActive ? computeLines(monthsForDim, selVCs, selBUs) : lines

  // Line-item drilldowns (Revenue by Line, Cost of Sales by Line, Expenses by
  // Department, Gross Profit bridge). Two paths: with no VC/BU filter, the server's
  // exact per-month precomputed monthlyLineDrilldowns are merged across whichever
  // months are selected (precise — no rounding-then-summing). Once a VC or BU filter
  // is engaged, the finer (month, VC, BU, account) rows below are used instead, since
  // that's the only data granular enough to also respect those two filters — same
  // small per-bucket-rounding trade-off the KPI cards already accept in that case.
  const monthlyLineDrilldowns   = data.budgetActual?.monthlyLineDrilldowns   || []
  const dimRevenueLines         = data.budgetActual?.dimRevenueLines         || []
  const dimCosLines             = data.budgetActual?.dimCosLines             || []
  const dimRevenueLinesBudget   = data.budgetActual?.dimRevenueLinesBudget   || []
  const dimCosLinesBudget       = data.budgetActual?.dimCosLinesBudget       || []

  const mergeDrilldownRows = (monthsRows) => {
    const map = new Map()
    monthsRows.forEach(rows => (rows || []).forEach(r => {
      if (!map.has(r.unit)) map.set(r.unit, { unit: r.unit, actual: 0, budget: 0, children: r.children ? new Map() : null })
      const entry = map.get(r.unit)
      entry.actual += r.actual || 0
      entry.budget += r.budget || 0
      if (r.children) r.children.forEach(c => {
        const cur = entry.children.get(c.unit) || { actual: 0, budget: 0 }
        entry.children.set(c.unit, { actual: cur.actual + (c.actual || 0), budget: cur.budget + (c.budget || 0) })
      })
    }))
    return [...map.values()]
      .map(e => ({
        unit: e.unit, actual: e.actual, budget: e.budget,
        ...(e.children ? { children: [...e.children].map(([unit, v]) => ({ unit, actual: v.actual, budget: v.budget })) } : {})
      }))
      .sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual))
  }

  // Groups filtered (month, VC, BU, X) rows by whichever key names the row (an account
  // description for Revenue/Cost of Sales, a BU code for Expenses) — called once for
  // actual rows and once for budget rows so the two maps can be merged afterward.
  const sumGroupedDimMap = (rows, months, vcs, bus, keyName) => {
    const map = new Map()
    rows.forEach(r => {
      if (!months.includes(r.mi)) return
      if (vcs.length && !vcs.includes(r.vc)) return
      if (bus.length && !bus.includes(r.bu)) return
      const key = r[keyName]
      map.set(key, (map.get(key) || 0) + r.amount)
    })
    return map
  }
  const mergeActualBudgetMaps = (actualMap, budgetMap) => {
    const keys = new Set([...actualMap.keys(), ...budgetMap.keys()])
    return [...keys].map(unit => ({ unit, actual: actualMap.get(unit) || 0, budget: budgetMap.get(unit) || 0 }))
  }

  // Revenue's BPASS lines collapse into one parent row with the individual bank
  // partners as children — mirrors the server's own byRevenueLine grouping.
  const groupBpass = (rows) => {
    const isBpass = u => /^BPASS/i.test(u)
    const bpassChildren = rows.filter(r => isBpass(r.unit)).sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual))
    const other = rows.filter(r => !isBpass(r.unit))
    const bpassRow = bpassChildren.length
      ? [{
          unit: 'BPASS (by bank partner)',
          actual: bpassChildren.reduce((s, r) => s + r.actual, 0),
          budget: bpassChildren.reduce((s, r) => s + r.budget, 0),
          children: bpassChildren
        }]
      : []
    return [...bpassRow, ...other].sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual))
  }

  // Parameterized by month set so it can be called once for the current selection and
  // again for the prior period (MoM/QoQ comparison) without duplicating this logic.
  const buildDrilldownsForMonths = (months) => {
    if (selVCs.length > 0 || selBUs.length > 0) {
      const revActualMap = sumGroupedDimMap(dimRevenueLines, months, selVCs, selBUs, 'unit')
      const revBudgetMap = sumGroupedDimMap(dimRevenueLinesBudget, months, selVCs, selBUs, 'unit')
      const revRows = mergeActualBudgetMaps(revActualMap, revBudgetMap)

      const cosActualMap = sumGroupedDimMap(dimCosLines, months, selVCs, selBUs, 'unit')
      const cosBudgetMap = sumGroupedDimMap(dimCosLinesBudget, months, selVCs, selBUs, 'unit')
      const cosRows = mergeActualBudgetMaps(cosActualMap, cosBudgetMap).sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual))

      const expActualMap = sumGroupedDimMap(dimActual.filter(r => r.metric === 'sal' || r.metric === 'opex'), months, selVCs, selBUs, 'bu')
      const expBudgetMap = sumGroupedDimMap(dimBudget.filter(r => r.metric === 'sal' || r.metric === 'opex'), months, selVCs, selBUs, 'bu')
      const expRows = mergeActualBudgetMaps(expActualMap, expBudgetMap)
        .filter(r => r.actual !== 0 || r.budget !== 0)
        .sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual))

      const revTotal = [...revActualMap.values()].reduce((s, v) => s + v, 0)
      const revBudgetTotal = [...revBudgetMap.values()].reduce((s, v) => s + v, 0)
      const cosTotal = [...cosActualMap.values()].reduce((s, v) => s + v, 0)
      const cosBudgetTotal = [...cosBudgetMap.values()].reduce((s, v) => s + v, 0)
      return {
        'Revenue':       groupBpass(revRows),
        'Cost of Sales': cosRows,
        'Expenses':      expRows,
        'Gross Profit':  [
          { unit: 'Revenue',       actual: revTotal,  budget: revBudgetTotal },
          { unit: 'Cost of Sales', actual: -cosTotal, budget: -cosBudgetTotal }
        ]
        // HR Related Expenses / OPEX by Category aren't available VC/BU-filtered —
        // those two sections just won't render in that case (guarded at render time).
      }
    }
    return {
      'Revenue':             mergeDrilldownRows(months.map(mi => monthlyLineDrilldowns[mi]?.['Revenue'] || [])),
      'Cost of Sales':       mergeDrilldownRows(months.map(mi => monthlyLineDrilldowns[mi]?.['Cost of Sales'] || [])),
      'Expenses':            mergeDrilldownRows(months.map(mi => monthlyLineDrilldowns[mi]?.['Expenses'] || [])),
      'Gross Profit':        mergeDrilldownRows(months.map(mi => monthlyLineDrilldowns[mi]?.['Gross Profit'] || [])),
      'HR Related Expenses': mergeDrilldownRows(months.map(mi => monthlyLineDrilldowns[mi]?.['HR Related Expenses'] || [])),
      'OPEX by Category':    mergeDrilldownRows(months.map(mi => monthlyLineDrilldowns[mi]?.['OPEX by Category'] || []))
    }
  }

  const activeLineDrilldowns = anyFilterActive ? buildDrilldownsForMonths(monthsForDim) : lineDrilldowns

  // "Prior period" (MoM/QoQ) is only well-defined for exactly one selected month or one
  // full selected quarter — YTD or an arbitrary multi-month mix has no single sensible
  // "previous period" to compare against, so this stays null in those cases and the
  // KPI cards/drilldown tables just don't show the comparison (existing behavior).
  const singleMonth = explicitMonths.length === 1 ? explicitMonths[0] : null
  const singleQuarterIdx = (() => {
    if (selMonths.length !== 3) return null
    const q = Math.floor(selMonths[0] / 3)
    const expected = [q * 3, q * 3 + 1, q * 3 + 2].filter(i => i < mData.length)
    return (expected.length === 3 && expected.every(i => selMonths.includes(i))) ? q : null
  })()
  const fullQuarterLabel = singleQuarterIdx != null ? `Qtr ${singleQuarterIdx + 1}` : null

  // "Compare To" only makes sense at the same granularity as the current selection
  // (month vs month, quarter vs quarter) — reset the explicit choice whenever that
  // granularity changes (or the filter no longer has one at all) so a stale index
  // from a previous mode can't be misread as e.g. a quarter when it meant a month.
  const compareMode = singleMonth != null ? 'month' : singleQuarterIdx != null ? 'quarter' : null
  useEffect(() => { setCompareIdx(null) }, [compareMode])
  // Comparing a period to itself is a no-op (always 0%) — treat it the same as not
  // having picked anything, rather than showing a degenerate "vs itself" result.
  const effectiveCompareIdx =
    compareMode === 'month' && compareIdx !== singleMonth ? compareIdx
    : compareMode === 'quarter' && compareIdx !== singleQuarterIdx ? compareIdx
    : null

  const priorMonths =
    compareMode === 'month' && effectiveCompareIdx != null ? [effectiveCompareIdx]
    : compareMode === 'quarter' && effectiveCompareIdx != null ? [effectiveCompareIdx * 3, effectiveCompareIdx * 3 + 1, effectiveCompareIdx * 3 + 2].filter(i => i < mData.length)
    : singleMonth != null ? (singleMonth > 0 ? [singleMonth - 1] : null)
    : singleQuarterIdx != null ? (singleQuarterIdx > 0 ? [singleQuarterIdx * 3 - 3, singleQuarterIdx * 3 - 2, singleQuarterIdx * 3 - 1] : null)
    : null

  const priorPeriodLabel =
    compareMode === 'month' && effectiveCompareIdx != null ? mData[effectiveCompareIdx]?.label
    : compareMode === 'quarter' && effectiveCompareIdx != null ? `Q${effectiveCompareIdx + 1}`
    : singleMonth != null ? (priorMonths ? mData[priorMonths[0]]?.label : null)
    : singleQuarterIdx != null ? (priorMonths ? `Q${singleQuarterIdx}` : null)
    : null

  const priorLines = priorMonths ? computeLines(priorMonths, selVCs, selBUs) : null
  const priorLineDrilldowns = priorMonths ? buildDrilldownsForMonths(priorMonths) : null

  const periodLabel = selMonths.length === 0
    ? 'YTD'
    : fullQuarterLabel || selMonths.map(i => mData[i]?.label).filter(Boolean).join(', ')

  const clearAllFilters = () => { setSelMonths([]); setSelVCs([]); setSelBUs([]) }

  return (
    <div className="space-y-5">

      {/* Header + filters */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">Financial Performance</h2>
          <p className="text-xs text-muted font-medium">
            {selMonths.length > 0 ? `Viewing ${periodLabel} — uncheck it (or use Clear filters) to return to YTD`
              : `Budget vs Actual — YTD through ${data.asOf || 'current period'}`}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <PeriodTree mData={mData} selected={selMonths} onChange={setSelMonths} />
          {compareMode && (
            <ComparePicker
              mode={compareMode}
              mData={mData}
              current={compareMode === 'month' ? singleMonth : singleQuarterIdx}
              value={effectiveCompareIdx}
              onChange={setCompareIdx}
            />
          )}
          <MultiSelect
            label="Virtual Company"
            selected={selVCs}
            onChange={setSelVCs}
            options={allVCs.map(vc => ({ value: vc, label: vc }))}
          />
          <MultiSelect
            label="Business Unit"
            selected={selBUs}
            onChange={setSelBUs}
            options={allBUs.map(bu => ({ value: bu, label: getName(bu) }))}
          />
          {anyFilterActive && (
            <button
              onClick={clearAllFilters}
              className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-navy hover:border-navy transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {activeLines.map(line => (
          <FinKpi
            key={line.name}
            line={line}
            selected={selLine === line.name}
            onClick={() => { setSelLine(s => s === line.name ? null : line.name); setExpandedRow(null) }}
            priorActual={priorLines?.find(p => p.name === line.name)?.actual}
            priorLabel={priorPeriodLabel}
          />
        ))}
      </div>

      {/* Line-item drilldown — click a KPI card above to expand its breakdown, scoped
          to the same month/quarter/YTD selection as the KPI cards themselves */}
      {selLine && activeLineDrilldowns[selLine]?.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <h3 className="text-sm font-bold text-navy">
                {selLine} {selLine === 'Gross Profit' ? '— How It\'s Built' : selLine === 'Expenses' ? '— Full Breakdown' : isScheduleLineView ? 'by Line' : 'by Department'}
                {' · '}{periodLabel}
              </h3>
              <p className="text-[10px] text-muted mt-0.5">
                {selLine === 'Gross Profit' ? 'Revenue minus Cost of Sales'
                  : selLine === 'Revenue' ? 'Per M-MGT-RPT account schedule — click BPASS to see it by bank partner'
                  : selLine === 'Expenses' ? 'Per M-MGT-RPT account schedule — Salaries and OPEX split out below, alongside the existing by-department view'
                  : isScheduleLineView ? 'Per M-MGT-RPT account schedule — click the card again to close'
                  : 'Click the card again to close'}
              </p>
            </div>
            <button onClick={() => { setSelLine(null); setExpandedRow(null) }} className="text-xs font-bold text-muted hover:text-navy px-2 py-1">✕</button>
          </div>
          {/* Same table treatment as the HR Analysis page: a solid navy header and
              explicit dark zebra-striped rows (ROW_BG), rather than the light
              bg-bg/#F4F6FA classes — those depend on the dark theme repainting them,
              which an inline background on the row itself blocks, leaving light text
              on a light background. Explicit colors here are visible either way.
              "Expenses" gets three stacked tables (by Business Unit / HR salaries by
              department / OPEX by category) since that one KPI genuinely covers three
              different breakdowns; every other line just gets the one table. */}
          {selLine === 'Expenses' ? (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">By Business Unit</p>
                <DrilldownTable
                  rows={activeLineDrilldowns['Expenses']}
                  higherIsBetterHere={false}
                  getName={getName}
                  expandedRow={expandedRow}
                  setExpandedRow={setExpandedRow}
                  priorRows={priorLineDrilldowns?.['Expenses']}
                  priorLabel={priorPeriodLabel}
                />
              </div>
              {activeLineDrilldowns['HR Related Expenses']?.length > 0 && (
                <div>
                  <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">HR Related Expenses (Salaries) by Department</p>
                  <DrilldownTable
                    rows={activeLineDrilldowns['HR Related Expenses']}
                    higherIsBetterHere={false}
                    getName={getName}
                    expandedRow={expandedRow}
                    setExpandedRow={setExpandedRow}
                    priorRows={priorLineDrilldowns?.['HR Related Expenses']}
                    priorLabel={priorPeriodLabel}
                  />
                </div>
              )}
              {activeLineDrilldowns['OPEX by Category']?.length > 0 && (
                <div>
                  <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">OPEX by Category</p>
                  <DrilldownTable
                    rows={activeLineDrilldowns['OPEX by Category']}
                    higherIsBetterHere={false}
                    getName={getName}
                    expandedRow={expandedRow}
                    setExpandedRow={setExpandedRow}
                    priorRows={priorLineDrilldowns?.['OPEX by Category']}
                    priorLabel={priorPeriodLabel}
                  />
                </div>
              )}
            </div>
          ) : (
            <DrilldownTable
              rows={activeLineDrilldowns[selLine]}
              higherIsBetterHere={selLine === 'Revenue' || selLine === 'Gross Profit'}
              getName={getName}
              expandedRow={expandedRow}
              setExpandedRow={setExpandedRow}
              priorRows={priorLineDrilldowns?.[selLine]}
              priorLabel={priorPeriodLabel}
            />
          )}
        </div>
      )}

      {/* Key ratios (Gross/EBITDA/Net Margin, liquidity, leverage) */}
      {ratios.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ratios.map(ratio => (
            <div key={ratio.label} className="bg-white rounded-2xl border border-border p-5 shadow-card">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{ratio.label}</p>
              <p className="text-2xl font-extrabold text-navy">{ratio.value}</p>
              {ratio.trend ? (
                <p className="text-xs font-semibold mt-1" style={{ color: trendColor(ratio.trend) }}>
                  {trendArrow(ratio.trend)} {ratio.trend === 'up' ? 'Improving' : ratio.trend === 'down' ? 'Declining' : 'Stable'}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Month callout (shown when a month pill is selected) */}
      {SHOW_MONTH_CALLOUT && selM && (
        <div className="bg-navy rounded-2xl p-4 flex flex-wrap gap-6 items-center">
          <div>
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-0.5">{selM.label} — Revenue vs Budget</p>
            <p className="text-2xl font-extrabold text-white">ETB {fmtETB(selM.Actual)}</p>
          </div>
          <div>
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-0.5">Monthly Budget</p>
            <p className="text-lg font-bold text-white/80">ETB {fmtETB(selM.Budget)}</p>
          </div>
          <div>
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-0.5">Attainment</p>
            <p className="text-lg font-extrabold" style={{ color: selM.Budget && selM.Actual / selM.Budget >= 1 ? '#2EBD85' : '#F5A870' }}>
              {selM.Budget ? fmtPct((selM.Actual / selM.Budget) * 100, 0) : '—'}
            </p>
          </div>
          <div className="flex-1 min-w-[120px]">
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-1.5">vs Budget</p>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.15)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(selM.Budget ? (selM.Actual / selM.Budget) * 100 : 0, 100)}%`,
                  background: selM.Budget && selM.Actual / selM.Budget >= 1 ? '#2EBD85' : '#EB7D23'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Charts row */}
      {SHOW_TREND_CHART && (
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* Monthly bar chart */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-border p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
            <h3 className="text-sm font-bold text-navy">
              {period === 'monthly' ? 'Monthly' : period === 'quarterly' ? 'Quarterly' : 'Annual'} Revenue vs Budget (ETB)
            </h3>
            <PeriodToggle value={period} onChange={setPeriod} />
          </div>
          <p className="text-[10px] text-muted mb-4 font-medium">
            {period === 'monthly' ? 'Click a bar to toggle that month (multiple allowed)'
              : period === 'quarterly' ? 'Click a bar to toggle that whole quarter (multiple allowed)'
              : 'Summed from monthly figures — this is just a display grouping, the Filter by Period control above still selects by month/quarter'}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              onClick={e => {
                if (e?.activeTooltipIndex === undefined) return
                if (period === 'monthly') toggleIn(setSelMonths)(e.activeTooltipIndex)
                else if (period === 'quarterly') toggleQuarterMonths(e.activeTooltipIndex)
              }}
              style={{ cursor: period === 'annually' ? 'default' : 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={46} />
              <Tooltip
                formatter={(v, n) => [`ETB ${fmtETB(v, 2)}`, n]}
                contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E3E9F2', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="Budget" radius={[3, 3, 0, 0]} maxBarSize={24} name="Budget">
                {chartData.map((_, i) => {
                  const isSel = period === 'monthly' ? selMonths.includes(i)
                    : period === 'quarterly' ? [i * 3, i * 3 + 1, i * 3 + 2].some(m => selMonths.includes(m))
                    : false
                  return <Cell key={i} fill={isSel ? '#02404F' : '#D1DCE5'} />
                })}
              </Bar>
              <Bar dataKey="Actual" radius={[3, 3, 0, 0]} maxBarSize={24} name="Actual">
                {chartData.map((_, i) => {
                  const isSel = period === 'monthly' ? selMonths.includes(i)
                    : period === 'quarterly' ? [i * 3, i * 3 + 1, i * 3 + 2].some(m => selMonths.includes(m))
                    : false
                  return <Cell key={i} fill={isSel ? '#EB7D23' : '#F5A870'} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Budget attainment mini gauges */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">P&L Budget Attainment</h3>
          <div className="space-y-4">
            {activeLines.map(line => {
              const pct   = line.budget ? (line.actual / line.budget) * 100 : 0
              const good  = line.higherIsBetter ? pct >= 100 : pct <= 100
              const color = good ? '#2EBD85' : line.higherIsBetter ? '#E5544B' : '#EB7D23'
              const isActive = selLine === line.name
              return (
                <button
                  key={line.name}
                  onClick={() => setSelLine(s => s === line.name ? null : line.name)}
                  className="w-full text-left group"
                >
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className={`font-bold ${isActive ? 'text-navy' : 'text-muted group-hover:text-navy'} transition-colors`}>
                      {line.name}
                    </span>
                    <span className="font-extrabold" style={{ color }}>{fmtPct(pct, 1)}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F4F6FA' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                    />
                  </div>
                  {isActive && (
                    <p className="text-[10px] mt-1 font-medium" style={{ color }}>
                      Actual: ETB {fmtETB(line.actual)} · Budget: ETB {fmtETB(line.budget)}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      )}

      {/* Budget by Business Unit */}
      {SHOW_BU_UTILIZATION && utilization.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Budget Utilization by Business Unit</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4">
            {utilization
              .filter(u => u.budgetYTD > 0)
              .sort((a, b) => (b.utilPct || 0) - (a.utilPct || 0))
              .map(u => {
                const pct   = u.utilPct || 0
                const color = pct > 100 ? '#E5544B' : pct > 85 ? '#EB7D23' : '#2EBD85'
                const name  = getName(u.unit)
                return (
                  <div key={u.unit}>
                    <div className="flex justify-between items-baseline mb-1.5 gap-2">
                      <span className="text-xs font-bold text-navy truncate" title={name}>{name}</span>
                      <span className="text-xs font-extrabold flex-shrink-0" style={{ color }}>
                        {fmtPct(pct, 0)}
                        {pct > 100 && ' ⚠'}
                      </span>
                    </div>
                    <div className="relative h-3 rounded-full overflow-hidden" style={{ background: '#F4F6FA' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted mt-1">
                      <span>Actual YTD: ETB {fmtETB(u.actualYTD)}</span>
                      <span>Budget: ETB {fmtETB(u.budgetYTD)}</span>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Income statement table */}
      {SHOW_INCOME_STATEMENT && (
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-navy">Income Statement</h3>
          <span className="text-xs text-muted font-medium">
            {periodLabel} · amounts in ETB (M = millions, B = billions)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr style={{ background: '#F4F6FA' }}>
                {['Line Item', 'Budget', 'Actual', 'Variance', '%'].map((h, i) => (
                  <th key={h} className={`py-3 px-5 text-[10px] font-bold text-muted uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeLines.map((line, i) => {
                const variance = line.actual - line.budget
                const pct      = line.budget ? (line.actual / line.budget) * 100 : 0
                const good     = line.higherIsBetter ? variance >= 0 : variance <= 0
                const color    = good ? '#2EBD85' : '#E5544B'
                const isSubtot = line.name === 'Gross Profit' || line.name === 'EBITDA'
                return (
                  <tr
                    key={line.name}
                    className={i % 2 ? 'bg-bg/40' : ''}
                    style={isSubtot ? { borderTop: '2px solid #E3E9F2' } : {}}
                  >
                    <td className="px-5 py-3 flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: LINE_COLORS[line.name] || '#6B7C93' }}
                      />
                      <span className={`${isSubtot ? 'font-extrabold text-navy' : 'font-semibold text-navy'}`}>{line.name}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-muted font-medium">{fmtETB(line.budget, 1)}</td>
                    <td className="px-5 py-3 text-right font-bold text-navy">{fmtETB(line.actual, 1)}</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color }}>
                      {variance >= 0 ? '+' : ''}{fmtETB(variance, 1)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className="text-[11px] font-extrabold px-2 py-0.5 rounded-full"
                        style={{ background: `${color}15`, color }}
                      >
                        {fmtPct(pct, 0)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Full P&L waterfall — Revenue through Net Profit, including D&A and Financial Costs */}
      {SHOW_PL_STATEMENT && pl.length > 0 && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Profit & Loss Statement</h3>
            <p className="text-[10px] text-muted mt-0.5 font-medium">Full waterfall including EBITDA, depreciation, financial costs and Net Profit</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {pl.map((row, i) => {
                const isHeader = row.type === 'header'
                const isTotal  = row.type === 'total'
                return (
                  <tr
                    key={`${row.name}-${i}`}
                    className={isHeader ? 'bg-navy/5' : isTotal ? 'bg-navy/10' : i % 2 ? 'bg-bg/50' : ''}
                  >
                    <td className={`px-5 py-3 ${isHeader ? 'text-[10px] uppercase tracking-wider text-muted font-bold' : isTotal ? 'font-extrabold text-navy' : 'text-navy pl-8 font-medium'}`}>
                      {row.name}
                    </td>
                    <td className={`px-5 py-3 text-right ${isTotal ? 'font-extrabold text-navy' : 'text-navy font-semibold'}`}>
                      {row.value != null ? `ETB ${fmtETB(row.value, 2)}` : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Management report — This Month / Last Month / YTD / vs Budget */}
      {SHOW_MANAGEMENT_REPORT && management.length > 0 && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Management Report</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-bg">
                  {['Metric', 'This Month', 'Last Month', 'YTD', 'vs Budget'].map((h, i) => (
                    <th key={h} className={`py-3 px-5 text-[10px] font-bold text-muted uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {management.map((row, i) => {
                  const vs  = parseFloat(row.vsBudget)
                  const col = isNaN(vs) ? '#6B7C93' : vs >= 0 ? '#2EBD85' : '#E5544B'
                  const fmtMth = (v) => row.isPercent
                    ? (v != null && v !== 0 ? `${v.toFixed(1)}%` : '—')
                    : (v  != null && v !== 0 ? `ETB ${fmtETB(v)}` : '—')
                  const fmtYtd = (v) => row.isPercent
                    ? (v != null ? `${v.toFixed(1)}%` : '—')
                    : (v  != null ? `ETB ${fmtETB(v)}` : '—')
                  return (
                    <tr key={row.metric} className={i % 2 ? 'bg-bg/50' : ''}>
                      <td className={`px-5 py-3 font-bold ${row.isPercent ? 'text-muted pl-9' : 'text-navy'}`}>{row.metric}</td>
                      <td className="px-5 py-3 text-right font-semibold text-navy">{fmtMth(row.month)}</td>
                      <td className="px-5 py-3 text-right text-muted font-medium">{fmtMth(row.last)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-navy">{fmtYtd(row.ytd)}</td>
                      <td className="px-5 py-3 text-right font-bold" style={{ color: col }}>
                        {isNaN(vs) ? '—' : `${vs >= 0 ? '+' : ''}${vs.toFixed(1)}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Revenue by Partner Bank — Superset */}
      {SHOW_REVENUE_BY_BANK && revenueByBank.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-1">Revenue by Partner Bank — YTD (ETB)</h3>
          <p className="text-[10px] text-muted font-medium mb-3">FY 2026 · operating income + provision per bank · from Superset</p>
          <ResponsiveContainer width="100%" height={Math.max(180, revenueByBank.length * 40)}>
            <BarChart data={revenueByBank} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
              <XAxis type="number" tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="bank" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={80} />
              <Tooltip formatter={(v, n) => [`ETB ${fmtETB(v, 2)}`, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Bar dataKey="Revenue" fill="#02404F" radius={[0, 4, 4, 0]} maxBarSize={20} name="Revenue" />
              <Bar dataKey="Provision" fill="#E5544B" radius={[0, 4, 4, 0]} maxBarSize={20} name="Provision" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
