import { useEffect, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts'
import { fmtETB, fmtPct } from '../lib/fmt.js'

// ═══════════════════════════════════════════════════════════════════════════
// P&L by Business Line — one management-report-style page per business line,
// sourced from data.businessLines (see backend/services/snapshot-builder.js,
// "P&L by Business Line" section). That section deliberately does NOT use the
// Total/Formula rows from the BUS-003 PL / BUS-004PL / BUS-007 PL account
// schedules — those rows are unscoped copies of the company-wide M-MGT-RPT
// totals (e.g. every schedule's "Total revenue" sums all 14 company-wide
// revenue accounts, not just this line's). Every figure here is computed
// server-side from just the hand-picked leaf accounts each schedule assigns
// to its business line, shipped as per-account monthly series so this page
// can filter by period and show MoM/QoQ the same way Financial Performance
// does — all client-side, no extra round trip.
// ═══════════════════════════════════════════════════════════════════════════

// revenue was '#02404F' (navy) — same color as the dark-mode card the "Revenue to profit
// bridge" bar sits on (see index.css's .dark-app .bg-white), so the bar itself disappeared
// the same way its axis/value labels did before that earlier fix. Blue reads clearly
// against both the light-mode white card and the dark-mode navy one, and isn't already
// used by any of the other four bars here.
const COLORS = {
  revenue:     '#4A90E2',
  cos:         '#E5544B',
  grossProfit: '#1FB6A6',
  opex:        '#8E5FD9',
  ebitda:      '#2EBD85',
}

// Period filter — identical to Financial Performance's PeriodTree (copied rather than
// shared, matching how Financial2.jsx was built as its own full replica).
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

// MoM/QoQ baseline picker — identical to Financial Performance's ComparePicker.
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

// KPI card — shows a "vs budget" line only when this line's schedule actually carries
// budget postings for that figure (many of these niche accounts don't), and a "vs prior
// period" line only when a single month/quarter is selected (same rule Financial
// Performance's FinKpi uses: a multi-month/YTD span has no one sensible "prior period").
function KpiCard({ label, value, sub, color, actual, budget, higherIsBetter, priorActual, priorLabel }) {
  const pct = budget ? (actual / budget) * 100 : null
  const diff = budget != null ? actual - budget : null
  const good = pct != null ? (higherIsBetter ? pct >= 100 : pct <= 100) : true
  const budgetColor = good ? '#2EBD85' : higherIsBetter ? '#E5544B' : '#EB7D23'
  const priorGrowth = (priorActual != null && priorActual !== 0) ? ((actual - priorActual) / Math.abs(priorActual)) * 100 : null
  const priorGood = priorGrowth != null && (higherIsBetter ? priorGrowth >= 0 : priorGrowth <= 0)

  return (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-card relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: color }} />
      <div className="pl-2">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-1">{label}</p>
        <p className="text-xl font-extrabold text-navy leading-none mb-1">{value}</p>
        {sub && <p className="text-[10px] text-muted">{sub}</p>}
        {!!budget && (
          <p className="text-[10px] font-semibold mt-1" style={{ color: budgetColor }}>
            {diff >= 0 ? '▲' : '▼'} ETB {fmtETB(Math.abs(diff))} vs budget
          </p>
        )}
        {priorGrowth != null && (
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: priorGood ? '#2EBD85' : '#E5544B' }}>
            {priorGrowth >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(priorGrowth), 1)} vs {priorLabel}
          </p>
        )}
      </div>
    </div>
  )
}

function StatementRow({ label, value, bold, indent, trStyle }) {
  return (
    <tr style={trStyle} className={bold ? 'font-extrabold' : ''}>
      <td className={`py-1.5 ${indent ? 'pl-6' : 'pl-2'} text-xs text-navy`}>{label}</td>
      <td className="py-1.5 pr-2 text-right text-xs text-navy tabular-nums">
        {value == null ? '—' : fmtETB(value)}
      </td>
    </tr>
  )
}

function SectionHeader({ label, color }) {
  return (
    <tr>
      <td colSpan={2} className="pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest" style={{ color }}>
        {label}
      </td>
    </tr>
  )
}

// Sums a line's monthly series over whichever months are selected (`sel`); `[]` means
// every month with data (the raw per-line arrays are already zero past that point).
const sumSel = (arr, sel) => (sel.length ? sel : arr.map((_, i) => i)).reduce((s, i) => s + (arr[i] || 0), 0)

// Re-derives every figure on this page from one business line's monthly series, scoped
// to `sel` (an array of month indices, [] = YTD/all) — the same role Financial
// Performance's computeLines() plays for VC/BU/month filtering.
function computeForMonths(line, sel) {
  const m = line.monthly
  const revenue  = sumSel(m.revenue, sel)
  const cos      = sumSel(m.costOfSales, sel)
  const salaries = sumSel(m.salaries, sel)
  const opex     = sumSel(m.opex, sel)
  const revenueBudget     = sumSel(m.revenueBudget, sel)
  const costOfSalesBudget = sumSel(m.costOfSalesBudget, sel)
  const salariesBudget    = sumSel(m.salariesBudget, sel)
  const opexBudget        = sumSel(m.opexBudget, sel)

  const grossProfit = revenue - cos
  const totalOpex   = salaries + opex
  const ebitda       = grossProfit - totalOpex
  const grossProfitBudget = revenueBudget - costOfSalesBudget
  const totalOpexBudget   = salariesBudget + opexBudget
  const ebitdaBudget      = grossProfitBudget - totalOpexBudget
  const grossMarginPct  = revenue ? Math.round(grossProfit / revenue * 1000) / 10 : null
  const ebitdaMarginPct = revenue ? Math.round(ebitda / revenue * 1000) / 10 : null

  const revenueMix = line.accounts.revenue.map(a => {
    const amt = -sumSel(a.monthly, sel)
    return { description: a.description, account: a.account, actual: amt, pct: revenue ? Math.round(amt / revenue * 1000) / 10 : 0 }
  }).sort((a, b) => b.actual - a.actual)

  const costOfSalesMix = line.accounts.costOfSales.map(a => {
    const amt = sumSel(a.monthly, sel)
    return { description: a.description, account: a.account, actual: amt, pct: cos ? Math.round(amt / cos * 1000) / 10 : 0 }
  }).sort((a, b) => b.actual - a.actual)

  const opexDetail = [...line.accounts.salaries, ...line.accounts.opex].map(a => {
    const amt = sumSel(a.monthly, sel)
    return { description: a.description, account: a.account, actual: amt }
  }).sort((a, b) => b.actual - a.actual)

  const monthCount = (sel.length ? sel.length : line.months) || 1
  const avgMonthlyRevenue = Math.round(revenue / monthCount * 10) / 10
  const avgMonthlyEbitda  = Math.round(ebitda / monthCount * 10) / 10

  // Same deterministic, number-driven takeaways the backend computes for YTD — ported
  // here so they stay accurate for whatever period is selected, not just YTD.
  const takeaways = []
  const nonZeroMix = revenueMix.filter(r => r.actual !== 0)
  const zeroMix = revenueMix.filter(r => r.actual === 0)
  if (revenue !== 0) {
    if (nonZeroMix.length > 1) {
      takeaways.push(`Revenue of ETB ${fmtETB(revenue)} across ${nonZeroMix.length} active revenue line(s); ${nonZeroMix[0].description} alone contributes ${fmtPct(nonZeroMix[0].pct)}.`)
    } else if (nonZeroMix.length === 1) {
      takeaways.push(`Revenue of ETB ${fmtETB(revenue)}, entirely from ${nonZeroMix[0].description}.`)
    }
    takeaways.push(`Cost of sales of ETB ${fmtETB(cos)} (${fmtPct(Math.round(cos / revenue * 1000) / 10)} of revenue) gives a gross margin of ${fmtPct(grossMarginPct)}.`)
  }
  if (salaries === 0 && opex === 0) {
    takeaways.push(`No salaries or OPEX are allocated to this line, so EBITDA of ETB ${fmtETB(ebitda)} does not reflect fully-loaded profitability.`)
  } else if (salaries === 0) {
    takeaways.push(`No salaries are allocated; OPEX of ETB ${fmtETB(opex)} is included, but EBITDA is still not fully-loaded profitability.`)
  }
  if (zeroMix.length > 0) {
    takeaways.push(`${zeroMix.map(r => r.description).join(', ')} ${zeroMix.length > 1 ? 'are' : 'is'} set up but recorded no revenue in the period.`)
  }
  if (revenue !== 0) {
    takeaways.push(`Run-rate of ETB ${fmtETB(avgMonthlyRevenue)} revenue per month implies ETB ${fmtETB(revenue / monthCount * 12)} on a 12-month basis.`)
  }

  return {
    revenue, costOfSales: cos, grossProfit, grossMarginPct, salaries, opex, totalOpex,
    ebitda, ebitdaMarginPct,
    revenueBudget, costOfSalesBudget, grossProfitBudget, totalOpexBudget, ebitdaBudget,
    avgMonthlyRevenue, avgMonthlyEbitda,
    costOfSalesToRevenuePct: revenue ? Math.round(cos / revenue * 1000) / 10 : null,
    opexToRevenuePct: revenue ? Math.round(totalOpex / revenue * 1000) / 10 : null,
    revenueMix, costOfSalesMix, opexDetail, takeaways,
  }
}

export default function BusinessLinePL({ data }) {
  const lines = data.businessLines || []
  const [selCode, setSelCode] = useState(lines[0]?.code)
  const line = lines.find(l => l.code === selCode) || lines[0]

  const mData = (data.budgetOverview?.monthly?.labels || []).map(label => ({ label }))

  const [selMonths, setSelMonths] = useState([])
  const [compareIdx, setCompareIdx] = useState(null)

  const singleMonth = selMonths.length === 1 ? selMonths[0] : null
  const singleQuarterIdx = (() => {
    if (selMonths.length !== 3) return null
    const q = Math.floor(selMonths[0] / 3)
    const expected = [q * 3, q * 3 + 1, q * 3 + 2].filter(i => i < mData.length)
    return (expected.length === 3 && expected.every(i => selMonths.includes(i))) ? q : null
  })()
  const compareMode = singleMonth != null ? 'month' : singleQuarterIdx != null ? 'quarter' : null
  useEffect(() => { setCompareIdx(null) }, [compareMode, selCode])

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

  const periodLabel = selMonths.length === 0
    ? 'YTD'
    : singleQuarterIdx != null ? `Qtr ${singleQuarterIdx + 1}`
    : selMonths.map(i => mData[i]?.label).filter(Boolean).join(', ')

  if (!line) {
    return (
      <div className="bg-white rounded-2xl border border-border p-8 text-center text-muted">
        No business line P&amp;L data available for this snapshot.
      </div>
    )
  }

  const c = computeForMonths(line, selMonths)
  const prior = priorMonths ? computeForMonths(line, priorMonths) : null

  const bridgeData = [
    { name: 'Revenue',       value: c.revenue,       color: COLORS.revenue },
    { name: 'Cost of sales', value: -c.costOfSales,  color: COLORS.cos },
    { name: 'Gross profit',  value: c.grossProfit,   color: COLORS.grossProfit },
    { name: 'OPEX',          value: -c.totalOpex,    color: COLORS.opex },
    { name: 'EBITDA',        value: c.ebitda,        color: COLORS.ebitda },
  ]
  const maxMix = Math.max(1, ...c.revenueMix.map(r => Math.abs(r.actual)))

  return (
    <div className="space-y-5">
      {/* Business line selector + period filter */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {lines.map(l => (
            <button
              key={l.code}
              onClick={() => { setSelCode(l.code); setSelMonths([]) }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                l.code === line.code ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-border hover:bg-[#F0F7F6]'
              }`}
            >
              {l.code} · {l.name}
            </button>
          ))}
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
          {selMonths.length > 0 && (
            <button
              onClick={() => setSelMonths([])}
              className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-navy hover:border-navy transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Report header */}
      <div className="bg-navy rounded-2xl p-5 text-white">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/60">Kifiya Financial Technology · Management Report</p>
        <h2 className="text-xl font-extrabold mt-1">{line.name}</h2>
        <p className="text-xs text-white/70 mt-1">
          {line.code} · Profit &amp; loss summary · {periodLabel === 'YTD' ? `1 Jan – ${data.asOf} (${line.months} month${line.months === 1 ? '' : 's'})` : periodLabel}
        </p>
        <p className="text-[10px] text-white/50 mt-2">Amounts in ETB</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Revenue" value={fmtETB(c.revenue)} color={COLORS.revenue}
          actual={c.revenue} budget={c.revenueBudget} higherIsBetter
          priorActual={prior?.revenue} priorLabel={priorPeriodLabel}
        />
        <KpiCard
          label="Gross Profit" value={fmtETB(c.grossProfit)} sub="after cost of sales" color={COLORS.grossProfit}
          actual={c.grossProfit} budget={c.grossProfitBudget} higherIsBetter
          priorActual={prior?.grossProfit} priorLabel={priorPeriodLabel}
        />
        <KpiCard
          label="Gross Margin" value={fmtPct(c.grossMarginPct)} sub="of revenue retained" color={COLORS.grossProfit}
          actual={c.grossMarginPct} priorActual={prior?.grossMarginPct} priorLabel={priorPeriodLabel} higherIsBetter
        />
        <KpiCard
          label="EBITDA" value={fmtETB(c.ebitda)} sub={`${fmtPct(c.ebitdaMarginPct)} margin`} color={COLORS.ebitda}
          actual={c.ebitda} budget={c.ebitdaBudget} higherIsBetter
          priorActual={prior?.ebitda} priorLabel={priorPeriodLabel}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* P&L statement */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-3">Profit &amp; loss statement</h3>
          <table className="w-full">
            <tbody>
              <SectionHeader label="Revenue" color={COLORS.revenue} />
              {c.revenueMix.map(r => (
                <StatementRow key={r.account} label={r.description} value={r.actual} indent />
              ))}
              <tr><td colSpan={2}><div className="border-t border-border my-1" /></td></tr>
              <StatementRow label="Total revenue" value={c.revenue} bold />

              <SectionHeader label="Cost of Sales" color={COLORS.cos} />
              {c.costOfSalesMix.length
                ? c.costOfSalesMix.map(r => <StatementRow key={r.account} label={r.description} value={r.actual} indent />)
                : <StatementRow label="—" value={null} indent />}
              <StatementRow label="Total cost of sales" value={c.costOfSales} bold />

              <tr><td colSpan={2}><div className="border-t border-border my-1" /></td></tr>
              {/* A translucent navy tint, not a flat light gray — the row's text is the
                  "text-navy" class, which .dark-app (index.css) flips to white; a flat light
                  background wouldn't follow it there and the row would go near-invisible
                  (white-on-near-white). This tint darkens right along with the dark card. */}
              <StatementRow label="Gross profit" value={c.grossProfit} bold trStyle={{ background: 'rgba(2,64,79,0.06)' }} />

              <SectionHeader label="Operating Expenses" color={COLORS.opex} />
              {c.opexDetail.length
                ? c.opexDetail.map(r => <StatementRow key={r.account} label={r.description} value={r.actual} indent />)
                : <StatementRow label="Salaries" value={null} indent />}
              <StatementRow label="Total OPEX" value={c.totalOpex} bold />

              <tr><td colSpan={2}><div className="border-t border-border my-1" /></td></tr>
              <StatementRow label="Net profit / EBITDA" value={c.ebitda} bold trStyle={{ background: '#02404F', color: '#fff' }} />
            </tbody>
          </table>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-3">Revenue to profit bridge</h3>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={bridgeData} layout="vertical" margin={{ top: 5, right: 40, left: 5, bottom: 5 }}>
                <XAxis type="number" hide />
                {/* Muted gray, not navy — this card is "bg-white" in light mode but remapped to a
                    dark navy card by .dark-app (index.css); navy text would vanish against that.
                    Every other chart on a bg-white card in this app uses this same '#6B7C93' for
                    axis/label text so it reads on both themes without a dark-mode-specific branch. */}
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtETB(Math.abs(v))} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {bridgeData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  <LabelList dataKey="value" position="right" formatter={(v) => fmtETB(Math.abs(v))}
                    style={{ fontSize: 11, fontWeight: 700, fill: '#6B7C93' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-3">Revenue by Line</h3>
            <div className="space-y-2.5">
              {c.revenueMix.map(r => (
                <div key={r.account}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-navy font-semibold">{r.description}</span>
                    <span className="text-muted">{fmtETB(r.actual)} · {fmtPct(r.pct, 1)}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F4F6FA' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(0, r.actual / maxMix * 100)}%`, background: COLORS.revenue }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-3">Run-rate</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted">Avg monthly revenue</p>
                <p className="text-sm font-extrabold text-navy">{fmtETB(c.avgMonthlyRevenue)}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted">Avg monthly EBITDA</p>
                <p className="text-sm font-extrabold text-navy">{fmtETB(c.avgMonthlyEbitda)}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted">Cost of sales / revenue</p>
                <p className="text-sm font-extrabold text-navy">{fmtPct(c.costOfSalesToRevenuePct)}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted">OPEX / revenue</p>
                <p className="text-sm font-extrabold text-navy">{fmtPct(c.opexToRevenuePct)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key takeaways */}
      {c.takeaways.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: '#EAF7EF', border: '1px solid #CDEBD8' }}>
          <h3 className="text-sm font-bold mb-2" style={{ color: '#1A7A4C' }}>Key takeaways</h3>
          <ul className="space-y-1.5">
            {c.takeaways.map((t, i) => (
              <li key={i} className="text-xs flex gap-2" style={{ color: '#1A7A4C' }}>
                <span>•</span><span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
