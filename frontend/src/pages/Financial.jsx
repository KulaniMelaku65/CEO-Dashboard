import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from 'recharts'
import { fmtETB, fmtPct } from '../lib/fmt.js'
import { aggregateByPeriod } from '../lib/period.js'
import PeriodToggle from '../components/PeriodToggle.jsx'

const LINE_COLORS = {
  Revenue:        '#02404F',
  'Cost of Sales':'#E5544B',
  Expenses:       '#EB7D23',
  'Gross Profit': '#1FB6A6',
  EBITDA:         '#2EBD85',
}

function FinKpi({ line, selected, onClick }) {
  const pct   = line.budget ? (line.actual / line.budget) * 100 : 0
  const good  = line.higherIsBetter ? pct >= 100 : pct <= 100
  const color = good ? '#2EBD85' : line.higherIsBetter ? '#E5544B' : '#EB7D23'
  const diff  = line.actual - line.budget

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

  const [selMonth,    setSelMonth]    = useState(null)
  const [selLine,     setSelLine]     = useState(null)
  const [period,      setPeriod]      = useState('monthly')
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

  // Month-level drill-down (click a bar / the month pills) only makes sense in Monthly
  // mode — a Quarterly/Annually bar no longer corresponds to one month's index.
  const selM = period === 'monthly' && selMonth !== null ? mData[selMonth] : null
  const chartData = aggregateByPeriod(mData, period)

  return (
    <div className="space-y-5">

      {/* Header + month pills */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">Financial Performance</h2>
          <p className="text-xs text-muted font-medium">
            {selM ? `Viewing ${selM.label} — click YTD to return` : `Budget vs Actual — YTD through ${data.asOf || 'current period'}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <PeriodToggle value={period} onChange={m => { setPeriod(m); setSelMonth(null) }} />
          {period === 'monthly' && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelMonth(null)}
                className="text-xs font-bold px-3 py-1.5 rounded-xl border transition-all"
                style={selMonth === null
                  ? { background: '#02404F', color: '#fff', borderColor: '#02404F' }
                  : { borderColor: '#E3E9F2', color: '#6B7C93' }}
              >
                YTD
              </button>
              {mData.map((m, i) => (
                <button
                  key={m.label}
                  onClick={() => setSelMonth(i === selMonth ? null : i)}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl border transition-all"
                  style={selMonth === i
                    ? { background: '#EB7D23', color: '#fff', borderColor: '#EB7D23' }
                    : { borderColor: '#E3E9F2', color: '#6B7C93' }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {lines.map(line => (
          <FinKpi
            key={line.name}
            line={line}
            selected={selLine === line.name}
            onClick={() => { setSelLine(s => s === line.name ? null : line.name); setExpandedRow(null) }}
          />
        ))}
      </div>

      {/* Line-item drilldown — click a KPI card above to expand its breakdown */}
      {selLine && lineDrilldowns[selLine]?.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <h3 className="text-sm font-bold text-navy">
                {selLine} {selLine === 'Gross Profit' ? '— How It\'s Built' : isScheduleLineView ? 'by Line' : 'by Department'}
              </h3>
              <p className="text-[10px] text-muted mt-0.5">
                {selLine === 'Gross Profit' ? 'Revenue minus Cost of Sales'
                  : selLine === 'Revenue' ? 'Per M-MGT-RPT account schedule — click BPASS to see it by bank partner'
                  : isScheduleLineView ? 'Per M-MGT-RPT account schedule — click the card again to close'
                  : 'Click the card again to close'}
              </p>
            </div>
            <button onClick={() => { setSelLine(null); setExpandedRow(null) }} className="text-xs font-bold text-muted hover:text-navy px-2 py-1">✕</button>
          </div>
          <div className="space-y-3">
            {(() => {
              const rows = lineDrilldowns[selLine]
              const maxAbs = Math.max(...rows.map(r => Math.abs(r.actual)), 1)
              return rows.map(r => {
                const pct = (Math.abs(r.actual) / maxAbs) * 100
                const neg = r.actual < 0
                const hasChildren = r.children?.length > 0
                const isOpen = hasChildren && expandedRow === r.unit
                const childMaxAbs = hasChildren ? Math.max(...r.children.map(c => Math.abs(c.actual)), 1) : 1
                return (
                  <div key={r.unit}>
                    <div
                      className={hasChildren ? 'cursor-pointer' : undefined}
                      onClick={hasChildren ? () => setExpandedRow(o => o === r.unit ? null : r.unit) : undefined}
                    >
                      <div className="flex justify-between items-baseline mb-1 gap-2">
                        <span className="text-xs font-bold text-navy truncate flex items-center gap-1">
                          {hasChildren && <span className="text-muted">{isOpen ? '▾' : '▸'}</span>}
                          {getName(r.unit)}
                        </span>
                        <span className="text-xs font-extrabold flex-shrink-0" style={{ color: neg ? '#E5544B' : '#FFFFFF' }}>
                          {neg ? '-' : ''}ETB {fmtETB(Math.abs(r.actual))}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#F4F6FA' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: neg ? '#E5544B' : '#1FB6A6' }}
                        />
                      </div>
                    </div>
                    {isOpen && (
                      <div className="mt-3 ml-4 pl-3 border-l-2 space-y-2.5" style={{ borderColor: '#E3E9F2' }}>
                        {r.children.map(c => {
                          const cPct = (Math.abs(c.actual) / childMaxAbs) * 100
                          const cNeg = c.actual < 0
                          return (
                            <div key={c.unit}>
                              <div className="flex justify-between items-baseline mb-1 gap-2">
                                <span className="text-[11px] font-semibold text-navy truncate">{getName(c.unit)}</span>
                                <span className="text-[11px] font-bold flex-shrink-0" style={{ color: cNeg ? '#E5544B' : '#FFFFFF' }}>
                                  {cNeg ? '-' : ''}ETB {fmtETB(Math.abs(c.actual))}
                                </span>
                              </div>
                              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F4F6FA' }}>
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${cPct}%`, background: cNeg ? '#E5544B' : '#1FB6A6' }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </div>
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
      {selM && (
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
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* Monthly bar chart */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-1">
            {period === 'monthly' ? 'Monthly' : period === 'quarterly' ? 'Quarterly' : 'Annual'} Revenue vs Budget (ETB)
          </h3>
          <p className="text-[10px] text-muted mb-4 font-medium">
            {period === 'monthly' ? 'Click a bar to drill into that month' : `Summed from monthly figures, by ${period === 'quarterly' ? 'quarter' : 'year'}`}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              onClick={e => {
                if (period === 'monthly' && e?.activeTooltipIndex !== undefined)
                  setSelMonth(i => i === e.activeTooltipIndex ? null : e.activeTooltipIndex)
              }}
              style={{ cursor: period === 'monthly' ? 'pointer' : 'default' }}
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
                {chartData.map((_, i) => <Cell key={i} fill={period === 'monthly' && i === selMonth ? '#02404F' : '#D1DCE5'} />)}
              </Bar>
              <Bar dataKey="Actual" radius={[3, 3, 0, 0]} maxBarSize={24} name="Actual">
                {chartData.map((_, i) => <Cell key={i} fill={period === 'monthly' && i === selMonth ? '#EB7D23' : '#F5A870'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Budget attainment mini gauges */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">P&L Budget Attainment</h3>
          <div className="space-y-4">
            {lines.map(line => {
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

      {/* Budget by Business Unit */}
      {utilization.length > 0 && (
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
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-navy">Income Statement</h3>
          <span className="text-xs text-muted font-medium">YTD · amounts in ETB (M = millions, B = billions)</span>
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
              {lines.map((line, i) => {
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

      {/* Full P&L waterfall — Revenue through Net Profit, including D&A and Financial Costs */}
      {pl.length > 0 && (
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
      {management.length > 0 && (
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
      {revenueByBank.length > 0 && (
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
