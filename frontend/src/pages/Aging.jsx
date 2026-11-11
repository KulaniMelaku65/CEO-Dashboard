import { useState } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  ResponsiveContainer
} from 'recharts'
import { fmtETB, fmtPct } from '../lib/fmt.js'

// Same palette as Tax/HR Analysis/Financial Performance — kept identical for visual
// consistency across the finance pages rather than introducing a new one here.
const NAVY   = '#0F5565'
const TEAL   = '#12707F'
const ORANGE = '#EB7D23'
const RED    = '#D32F2F'
const DTEAL  = '#1A7A72'
const SERIES_COLORS = [ORANGE, TEAL, NAVY, RED, DTEAL, '#3FA7E1', '#B0862E', '#7A2E8A']
// Same dark zebra-stripe colors as HR Analysis / Financial Performance's drilldown
// table — explicit backgrounds so text stays legible regardless of theme repaint.
const ROW_BG = { even: 'var(--tbl-row-even)', odd: 'var(--tbl-row-odd)' }
const AGING_BUCKETS = ['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days']

// `raw` bypasses both the ETB-currency and percent formatters for a pre-formatted
// string value (e.g. "34d") — without it, a non-numeric value like that got forced
// through fmtETB, which only knows numbers, and silently rendered as "ETB —".
function Kpi({ label, value, isPct, raw, sub, accent, onClick, selected }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex flex-col justify-between p-4 rounded-xl text-left transition-transform disabled:cursor-default"
      style={{
        background: accent || NAVY,
        boxShadow: selected ? `0 0 0 2px #FFFFFF, 0 0 0 4px ${accent || NAVY}` : 'none',
        cursor: onClick ? 'pointer' : 'default',
        transform: selected ? 'scale(1.02)' : 'none'
      }}
    >
      <p className="text-[9px] uppercase tracking-widest font-bold text-white/70 leading-tight">{label}</p>
      <p className="font-black text-white leading-none mt-2 tabular-nums text-xl">
        {raw ? value : isPct ? fmtPct(value, 1) : `ETB ${fmtETB(value)}`}
      </p>
      {sub && <p className="text-[10px] text-white/60 mt-1 truncate">{sub}</p>}
    </button>
  )
}

// Same table treatment as Financial Performance's line-item drilldowns: solid navy
// header, dark zebra-striped rows — explicit colors instead of the light bg-bg/
// #F7F9FA classes, which don't get repainted once an inline background is set.
function DrillTable({ columns, rows, emptyLabel }) {
  if (!rows.length) return <p className="text-xs text-muted py-6 text-center">{emptyLabel || 'No data'}</p>
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm min-w-[420px]">
        <thead>
          <tr style={{ background: 'var(--tbl-head-bg)', borderBottom: '1px solid var(--tbl-line)' }}>
            {columns.map((c, i) => (
              <th key={c.key} className={`py-2.5 px-3 text-[10px] font-bold text-muted uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? ROW_BG.even : ROW_BG.odd }}>
              {columns.map((c, ci) => {
                const val = r[c.key]
                const neg = typeof val === 'number' && val < 0
                return (
                  <td
                    key={c.key}
                    className={`py-2 px-3 text-xs ${ci === 0 ? 'font-bold text-ink' : 'font-semibold text-right'}`}
                    style={ci > 0 ? { color: c.colorNeg && neg ? c.colorNeg : (c.color || 'var(--tbl-fg)') } : undefined}
                  >
                    {c.format ? c.format(val, r) : val}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const money = (v) => `${v < 0 ? '-' : ''}ETB ${fmtETB(Math.abs(v || 0), 1)}`
// Recharts doesn't wrap category-axis tick text — a long customer/vendor name just
// renders past the tick's line height and overlaps the row above/below it. Truncating
// only the rendered label (not the underlying data) keeps the full name in the tooltip.
const truncateLabel = (s, max = 16) => (s && s.length > max) ? `${s.slice(0, max - 1)}…` : s

const NEEDED = [
  'KFT_AR_Aging / KFT_AP_Aging OData endpoints reachable from this server',
  'Each row is one open ledger entry with a dueDate — buckets are computed here from days overdue',
]

// Days elapsed so far this fiscal year, derived from however many months already have
// a posted Revenue actual — used to annualize AR/AP into a DSO/DPO estimate since there's
// no payment-terms or realized-payment-date field on these endpoints to compute a precise
// "average days to pay" the way a dedicated AR/AP module would.
function daysElapsed(data) {
  const months = (data?.budgetActual?.monthlyLines || []).filter(m => m.find(l => l.name === 'Revenue')?.actual != null).length
  return Math.max(months, 1) * 30.4
}

// Full Party × Bucket pivot (every party, not just the top 8 the charts show) — the
// "Total AR/AP" KPI's drilldown.
function buildPartyPivot(aging) {
  const map = new Map()
  AGING_BUCKETS.forEach(bucket => {
    (aging.partiesByBucket?.[bucket] || []).forEach(p => {
      if (!map.has(p.name)) map.set(p.name, { name: p.name })
      map.get(p.name)[bucket] = p.amount
    })
  })
  return [...map.values()]
    .map(r => ({ ...r, total: AGING_BUCKETS.reduce((s, b) => s + (r[b] || 0), 0) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
}

// Every party's combined balance across the non-Current buckets — the "Overdue" KPI's
// drilldown.
function buildOverduePivot(aging) {
  const map = new Map()
  AGING_BUCKETS.filter(b => b !== 'Current').forEach(bucket => {
    (aging.partiesByBucket?.[bucket] || []).forEach(p => map.set(p.name, (map.get(p.name) || 0) + p.amount))
  })
  return [...map.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
}

function AgingSection({ title, fullTitle, subtitle, aging, accent, salesLabel, salesValue, days, data }) {
  const [selectedBucket, setSelectedBucket] = useState(null)
  const [selectedKpi, setSelectedKpi] = useState(null) // 'total' | 'sales' | 'overdue' | null

  if (!aging) {
    return (
      <div className="bg-white rounded-2xl border border-border p-8">
        <p className="text-sm font-bold text-ink mb-1">{fullTitle} — no data yet</p>
        <p className="text-xs text-muted leading-relaxed max-w-xl">Nothing came back from the ERP endpoint for this yet. Needed:</p>
        <ul className="space-y-1.5 mt-2">
          {NEEDED.map(item => (
            <li key={item} className="text-xs text-ink flex items-start gap-2">
              <span className="text-muted mt-0.5">—</span><span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const overdue = aging.byBucket.filter(b => b.bucket !== 'Current').reduce((s, b) => s + b.amount, 0)
  const overduePct = aging.totalOutstanding ? (overdue / aging.totalOutstanding) * 100 : 0
  const daysOutstanding = salesValue ? (aging.totalOutstanding / salesValue) * days : null

  // Business unit codes (globalDim2, e.g. "FIN-001") resolved to their real names —
  // same dimensionNames lookup Financial Performance already uses for the same codes.
  const dimNames = data?.dimensionNames || {}
  const getName = (code) => dimNames[code] || code

  const bucketRows = aging.byBucket.map(b => ({ ...b, isCurrent: b.bucket === 'Current' }))

  const partyRows = (selectedBucket ? aging.partiesByBucket?.[selectedBucket] : aging.topParties.map(p => ({ name: p.name, amount: p.total })))
    ?.slice(0, 8) || []
  const buRows = (selectedBucket ? aging.buByBucket?.[selectedBucket] : aging.byBU?.map(b => ({ unit: b.unit, amount: b.total })))
    ?.slice(0, 8).map(b => ({ ...b, unit: getName(b.unit) })) || []

  const toggleKpi = (k) => setSelectedKpi(cur => cur === k ? null : k)
  const isAR = title === 'AR'

  return (
    <div className="space-y-4">
      {/* Banner header */}
      <div className="bg-white rounded-2xl border border-border shadow-card px-5 py-4 flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-black text-ink tracking-tight">{fullTitle}</h2>
        <span className="text-[10px] font-extrabold text-muted uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: 'var(--tone-muted-bg)' }}>
          {title} Overview
        </span>
      </div>

      {/* KPIs — click Total/Sales-or-Spend/Overdue to drill into the detail below */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label={`Total ${title}`} value={aging.totalOutstanding} accent={accent} onClick={() => toggleKpi('total')} selected={selectedKpi === 'total'} />
        <Kpi label={salesLabel} value={salesValue} accent={NAVY} onClick={() => toggleKpi('sales')} selected={selectedKpi === 'sales'} />
        <Kpi label="Overdue" value={overdue} accent={RED} onClick={() => toggleKpi('overdue')} selected={selectedKpi === 'overdue'} />
        <Kpi label="Overdue %" value={overduePct} isPct accent={ORANGE} onClick={() => toggleKpi('overdue')} selected={selectedKpi === 'overdue'} />
        <Kpi
          label={isAR ? 'Est. DSO' : 'Est. DPO'}
          value={daysOutstanding == null ? '—' : `${Math.round(daysOutstanding)}d`}
          raw
          accent={DTEAL}
          sub={`${title} ÷ period ${isAR ? 'sales' : 'spend'} × days — approximation, no payment-terms field yet`}
        />
      </div>

      {/* KPI drilldown panel */}
      {selectedKpi && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-ink">
              {selectedKpi === 'total' ? `Total ${title} by ${isAR ? 'Customer' : 'Vendor'} & Bucket`
                : selectedKpi === 'sales' ? salesLabel
                : 'Overdue by ' + (isAR ? 'Customer' : 'Vendor')}
            </h3>
            <button onClick={() => setSelectedKpi(null)} className="text-xs font-bold text-muted hover:text-ink px-2 py-1">✕</button>
          </div>
          <p className="text-[10px] text-muted mb-4 font-medium">
            {selectedKpi === 'total' ? 'Every open entry, not just the top 8 shown in the charts below'
              : selectedKpi === 'sales' ? (isAR ? 'Per M-MGT-RPT Revenue schedule — same breakdown as Financial Performance' : 'Per M-MGT-RPT Cost of Sales + Expenses schedules')
              : `Combined balance across ${AGING_BUCKETS.slice(1).join(', ')}`}
          </p>

          {selectedKpi === 'total' && (
            <DrillTable
              rows={buildPartyPivot(aging)}
              columns={[
                { key: 'name', label: isAR ? 'Customer' : 'Vendor' },
                ...AGING_BUCKETS.map(b => ({ key: b, label: b.replace(' Days', 'd'), format: money })),
                { key: 'total', label: 'Total', format: money }
              ]}
            />
          )}

          {selectedKpi === 'overdue' && (
            <DrillTable
              rows={buildOverduePivot(aging)}
              columns={[
                { key: 'name', label: isAR ? 'Customer' : 'Vendor' },
                { key: 'amount', label: 'Overdue', format: money, colorNeg: '#D32F2F' }
              ]}
            />
          )}

          {selectedKpi === 'sales' && isAR && (
            <DrillTable
              rows={data?.budgetActual?.lineDrilldowns?.Revenue || []}
              emptyLabel="No Revenue breakdown available"
              columns={[
                { key: 'unit', label: 'Revenue Line' },
                { key: 'budget', label: 'Budget', format: money },
                { key: 'actual', label: 'Actual', format: money }
              ]}
            />
          )}

          {selectedKpi === 'sales' && !isAR && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">Cost of Sales by Line</p>
                <DrillTable
                  rows={data?.budgetActual?.lineDrilldowns?.['Cost of Sales'] || []}
                  emptyLabel="No Cost of Sales breakdown available"
                  columns={[
                    { key: 'unit', label: 'Line' },
                    { key: 'budget', label: 'Budget', format: money },
                    { key: 'actual', label: 'Actual', format: money }
                  ]}
                />
              </div>
              <div>
                <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">Expenses by Department</p>
                <DrillTable
                  rows={data?.budgetActual?.lineDrilldowns?.Expenses || []}
                  emptyLabel="No Expenses breakdown available"
                  columns={[
                    { key: 'unit', label: 'Department' },
                    { key: 'budget', label: 'Budget', format: money },
                    { key: 'actual', label: 'Actual', format: money }
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Aging bar chart — click a bar to filter the two panels below to just that bucket */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-ink">{title} Aging</h3>
            {selectedBucket && (
              <button
                onClick={() => setSelectedBucket(null)}
                className="text-[10px] font-bold px-2 py-1 rounded-lg text-white"
                style={{ background: ORANGE }}
              >
                {selectedBucket} ✕
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted mb-4 font-medium">{subtitle} — click a bar to see who's in it</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bucketRows} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EC" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#6B7780' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7780' }} axisLine={false} tickLine={false} width={46} />
              <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, title]} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E6E9EC' }} />
              <Bar
                dataKey="amount"
                radius={[4, 4, 0, 0]}
                maxBarSize={54}
                cursor="pointer"
                onClick={(d) => setSelectedBucket(cur => cur === d.bucket ? null : d.bucket)}
              >
                <LabelList dataKey="amount" position="top" formatter={v => fmtETB(v)} style={{ fontSize: 11, fontWeight: 700, fill: 'var(--tbl-fg)' }} />
                {bucketRows.map((b, i) => (
                  <Cell
                    key={i}
                    fill={b.isCurrent ? TEAL : ORANGE}
                    opacity={selectedBucket && selectedBucket !== b.bucket ? 0.35 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Outstanding by Business Unit — real dimension already on every entry,
            standing in for a "payment performance" panel we don't have data for */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-ink mb-1">Outstanding by Business Unit</h3>
          <p className="text-[10px] text-muted mb-4 font-medium">
            {selectedBucket ? `${selectedBucket} only` : 'All buckets'} · top {buRows.length}
          </p>
          {buRows.length === 0 ? (
            <p className="text-xs text-muted py-8 text-center">No entries in this bucket</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, buRows.length * 40)}>
              <BarChart data={buRows} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EC" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7780' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="unit" tickFormatter={v => truncateLabel(v, 16)} tick={{ fontSize: 10, fill: '#6B7780' }} axisLine={false} tickLine={false} width={110} interval={0} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, 'Outstanding']} labelFormatter={l => l} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E6E9EC' }} />
                <Bar dataKey="amount" fill={accent} radius={[0, 4, 4, 0]} maxBarSize={20}>
                  <LabelList dataKey="amount" position="right" formatter={v => fmtETB(v)} style={{ fontSize: 10, fill: 'var(--tbl-fg)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top customers/vendors — same bucket filter as above */}
      <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
        <h3 className="text-sm font-bold text-ink mb-1">Top {isAR ? 'Customers' : 'Vendors'} by Outstanding</h3>
        <p className="text-[10px] text-muted mb-4 font-medium">{selectedBucket ? `${selectedBucket} only` : 'All buckets'}</p>
        {partyRows.length === 0 ? (
          <p className="text-xs text-muted py-8 text-center">No entries in this bucket</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, partyRows.length * 40)}>
            <BarChart data={partyRows} layout="vertical" margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EC" horizontal={false} />
              <XAxis type="number" tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7780' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tickFormatter={v => truncateLabel(v, 22)} tick={{ fontSize: 10, fill: '#6B7780' }} axisLine={false} tickLine={false} width={150} interval={0} />
              <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, 'Outstanding']} labelFormatter={l => l} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E6E9EC' }} />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={20}>
                <LabelList dataKey="amount" position="right" formatter={v => fmtETB(v)} style={{ fontSize: 10, fill: 'var(--tbl-fg)' }} />
                {partyRows.map((_, i) => <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export default function Aging({ data }) {
  const arAging = data?.arAging || null
  const apAging = data?.apAging || null
  const lines = data?.budgetActual?.lines || []
  const revenueActual = lines.find(l => l.name === 'Revenue')?.actual || 0
  const cosActual      = lines.find(l => l.name === 'Cost of Sales')?.actual || 0
  const expActual      = lines.find(l => l.name === 'Expenses')?.actual || 0
  const days = daysElapsed(data)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-ink mb-0.5">Aging (AR/AP)</h2>
        <p className="text-xs text-muted font-medium">
          Open receivables and payables by aging bucket — as of {data?.asOf || 'current period'} · source: ERP
        </p>
      </div>

      <AgingSection
        title="AR" fullTitle="Accounts Receivable" subtitle="Receivables Aging Report"
        aging={arAging} accent={ORANGE} data={data}
        salesLabel="YTD Sales" salesValue={revenueActual} days={days}
      />
      <AgingSection
        title="AP" fullTitle="Accounts Payable" subtitle="Payables Aging Report"
        aging={apAging} accent={DTEAL} data={data}
        salesLabel="YTD Spend" salesValue={cosActual + expActual} days={days}
      />
    </div>
  )
}
