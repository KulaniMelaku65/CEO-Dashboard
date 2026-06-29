import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from 'recharts'
import { fmtETB, fmtPct } from '../lib/fmt.js'

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

export default function Financial({ data }) {
  const lines          = data.budgetActual?.lines || []
  const monthly        = data.budgetOverview?.monthly
  const utilization    = data.budgetOverview?.utilizationYTD || []
  const dimNames       = data.dimensionNames || {}
  const revenueByBank  = data.financialSS?.revenueByBank || []

  const [selMonth, setSelMonth] = useState(null)
  const [selLine,  setSelLine]  = useState(null)

  const getName = code => dimNames[code] || code

  const mData = (monthly?.labels || []).map((label, i) => ({
    label,
    Budget: monthly.budget?.[i] || 0,
    Actual: monthly.actual?.[i] || 0,
  }))

  const selM = selMonth !== null ? mData[selMonth] : null

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
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {lines.map(line => (
          <FinKpi
            key={line.name}
            line={line}
            selected={selLine === line.name}
            onClick={() => setSelLine(s => s === line.name ? null : line.name)}
          />
        ))}
      </div>

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
          <h3 className="text-sm font-bold text-navy mb-1">Monthly Revenue vs Budget (ETB)</h3>
          <p className="text-[10px] text-muted mb-4 font-medium">Click a bar to drill into that month</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={mData}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              onClick={e => {
                if (e?.activeTooltipIndex !== undefined)
                  setSelMonth(i => i === e.activeTooltipIndex ? null : e.activeTooltipIndex)
              }}
              style={{ cursor: 'pointer' }}
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
                {mData.map((_, i) => <Cell key={i} fill={i === selMonth ? '#02404F' : '#D1DCE5'} />)}
              </Bar>
              <Bar dataKey="Actual" radius={[3, 3, 0, 0]} maxBarSize={24} name="Actual">
                {mData.map((_, i) => <Cell key={i} fill={i === selMonth ? '#EB7D23' : '#F5A870'} />)}
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
              .filter(u => u.budget > 0)
              .sort((a, b) => b.used / b.budget - a.used / a.budget)
              .map(u => {
                const pct   = u.budget ? (u.used / u.budget) * 100 : 0
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
                      <span>Used: ETB {fmtETB(u.used)}</span>
                      <span>Budget: ETB {fmtETB(u.budget)}</span>
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
