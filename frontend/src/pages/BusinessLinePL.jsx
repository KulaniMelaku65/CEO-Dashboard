import { useState } from 'react'
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
// to its business line.
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  revenue:     '#02404F',
  cos:         '#E5544B',
  grossProfit: '#1FB6A6',
  opex:        '#8E5FD9',
  ebitda:      '#2EBD85',
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-card relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: color }} />
      <div className="pl-2">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-1">{label}</p>
        <p className="text-xl font-extrabold text-navy leading-none mb-1">{value}</p>
        {sub && <p className="text-[10px] text-muted">{sub}</p>}
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

export default function BusinessLinePL({ data }) {
  const lines = data.businessLines || []
  const [selCode, setSelCode] = useState(lines[0]?.code)
  const line = lines.find(l => l.code === selCode) || lines[0]

  if (!line) {
    return (
      <div className="bg-white rounded-2xl border border-border p-8 text-center text-muted">
        No business line P&amp;L data available for this snapshot.
      </div>
    )
  }

  const bridgeData = [
    { name: 'Revenue',       value: line.revenue,        color: COLORS.revenue },
    { name: 'Cost of sales', value: -line.costOfSales,   color: COLORS.cos },
    { name: 'Gross profit',  value: line.grossProfit,    color: COLORS.grossProfit },
    { name: 'OPEX',          value: -line.totalOpex,     color: COLORS.opex },
    { name: 'EBITDA',        value: line.ebitda,         color: COLORS.ebitda },
  ]
  const maxMix = Math.max(1, ...line.revenueMix.map(r => Math.abs(r.actual)))

  return (
    <div className="space-y-5">
      {/* Business line selector */}
      <div className="flex flex-wrap gap-2">
        {lines.map(l => (
          <button
            key={l.code}
            onClick={() => setSelCode(l.code)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              l.code === line.code ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-border hover:bg-[#F0F7F6]'
            }`}
          >
            {l.code} · {l.name}
          </button>
        ))}
      </div>

      {/* Report header */}
      <div className="bg-navy rounded-2xl p-5 text-white">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/60">Kifiya Financial Technology · Management Report</p>
        <h2 className="text-xl font-extrabold mt-1">{line.name}</h2>
        <p className="text-xs text-white/70 mt-1">
          {line.code} · Profit &amp; loss summary · 1 Jan – {data.asOf} ({line.months} month{line.months === 1 ? '' : 's'})
        </p>
        <p className="text-[10px] text-white/50 mt-2">Amounts in ETB</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Revenue" value={fmtETB(line.revenue)} color={COLORS.revenue} />
        <KpiCard label="Gross Profit"  value={fmtETB(line.grossProfit)} sub="after cost of sales" color={COLORS.grossProfit} />
        <KpiCard label="Gross Margin"  value={fmtPct(line.grossMarginPct)} sub="of revenue retained" color={COLORS.grossProfit} />
        <KpiCard label="EBITDA"        value={fmtETB(line.ebitda)} sub={`${fmtPct(line.ebitdaMarginPct)} margin`} color={COLORS.ebitda} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* P&L statement */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-3">Profit &amp; loss statement</h3>
          <table className="w-full">
            <tbody>
              <SectionHeader label="Revenue" color={COLORS.revenue} />
              {line.revenueMix.map(r => (
                <StatementRow key={r.account} label={r.description} value={r.actual} indent />
              ))}
              <tr><td colSpan={2}><div className="border-t border-border my-1" /></td></tr>
              <StatementRow label="Total revenue" value={line.revenue} bold />

              <SectionHeader label="Cost of Sales" color={COLORS.cos} />
              {line.costOfSalesMix.length
                ? line.costOfSalesMix.map(r => <StatementRow key={r.account} label={r.description} value={r.actual} indent />)
                : <StatementRow label="—" value={null} indent />}
              <StatementRow label="Total cost of sales" value={line.costOfSales} bold />

              <tr><td colSpan={2}><div className="border-t border-border my-1" /></td></tr>
              <StatementRow label="Gross profit" value={line.grossProfit} bold trStyle={{ background: '#F0F7F6' }} />

              <SectionHeader label="Operating Expenses" color={COLORS.opex} />
              {line.opexDetail.length
                ? line.opexDetail.map(r => <StatementRow key={r.account} label={r.description} value={r.actual} indent />)
                : <StatementRow label="Salaries" value={null} indent />}
              <StatementRow label="Total OPEX" value={line.totalOpex} bold />

              <tr><td colSpan={2}><div className="border-t border-border my-1" /></td></tr>
              <StatementRow label="Net profit / EBITDA" value={line.ebitda} bold trStyle={{ background: '#02404F', color: '#fff' }} />
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
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#02404F' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtETB(Math.abs(v))} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {bridgeData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  <LabelList dataKey="value" position="right" formatter={(v) => fmtETB(Math.abs(v))}
                    style={{ fontSize: 11, fontWeight: 700, fill: '#02404F' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-3">Revenue by Line</h3>
            <div className="space-y-2.5">
              {line.revenueMix.map(r => (
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
                <p className="text-sm font-extrabold text-navy">{fmtETB(line.avgMonthlyRevenue)}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted">Avg monthly EBITDA</p>
                <p className="text-sm font-extrabold text-navy">{fmtETB(line.avgMonthlyEbitda)}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted">Cost of sales / revenue</p>
                <p className="text-sm font-extrabold text-navy">{fmtPct(line.costOfSalesToRevenuePct)}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted">OPEX / revenue</p>
                <p className="text-sm font-extrabold text-navy">{fmtPct(line.opexToRevenuePct)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key takeaways */}
      {line.takeaways.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: '#EAF7EF', border: '1px solid #CDEBD8' }}>
          <h3 className="text-sm font-bold mb-2" style={{ color: '#1A7A4C' }}>Key takeaways</h3>
          <ul className="space-y-1.5">
            {line.takeaways.map((t, i) => (
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
