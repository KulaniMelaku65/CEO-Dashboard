import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtETB, fmtPct, fmtNum } from '../lib/fmt.js'

const BANK_COLORS = ['#1FB6A6', '#EB7D23', '#2EBD85', '#F5A870', '#90D4CE', '#E5544B', '#9BAAB8']
const AXIS_COLOR = 'rgba(255,255,255,0.55)'
const GRID_COLOR = 'rgba(255,255,255,0.12)'
const TOOLTIP_STYLE = { fontSize: 11, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: '#0A3A46', color: '#fff' }

export default function Overview({ data }) {
  const monthly    = data.budgetOverview?.monthly
  const monthLabels = monthly?.labels || []
  const monthIndex       = monthLabels.length - 1  // 0-based index of snapshot month
  const snapshotMonthName = monthLabels[monthIndex] || ''

  // Always show the snapshot month's own data (monthIndex = lm from the backend)
  const monthlyLines = data.budgetActual?.monthlyLines
  const effectiveMonthName = snapshotMonthName
  const lines = (monthlyLines && monthIndex >= 0)
    ? monthlyLines[monthIndex]
    : (data.budgetActual?.lines || [])

  const rev     = lines.find(l => l.name === 'Revenue')
  const cos     = lines.find(l => l.name === 'Cost of Sales')
  const gp      = lines.find(l => l.name === 'Gross Profit')
  const ebitda  = lines.find(l => l.name === 'EBITDA')
  const lp      = data.lending?.loanPortfolio

  const monthlyData = (monthly?.labels || []).map((label, i) => ({
    label,
    Budget: monthly.budget?.[i] || 0,
    Actual: monthly.actual?.[i] || 0,
  }))

  const disbByBank = data.loanOps?.disbByBank || []

  const revPct = rev?.budget ? (rev.actual / rev.budget) * 100 : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Executive Overview</h2>
        <p className="text-xs text-muted font-medium">Year-to-date performance — all business units</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-4">
        <KpiCard
          label={`Revenue ${effectiveMonthName}`}
          value={`ETB ${fmtETB(rev?.actual)}`}
          sub={revPct != null ? `${fmtPct(revPct)} of budget` : null}
          trend={revPct != null ? (revPct >= 100 ? 'up' : 'down') : null}
        />
        <KpiCard
          label={`Cost of Sales ${effectiveMonthName}`}
          value={`ETB ${fmtETB(cos?.actual)}`}
          sub={cos?.budget ? `${fmtPct((cos.actual / cos.budget) * 100)} of budget` : null}
          trend={cos?.actual != null ? (cos.actual <= cos?.budget ? 'up' : 'down') : null}
          accent={cos?.actual != null && cos.actual > cos?.budget ? '#E5544B' : undefined}
        />
        <KpiCard
          label={`Gross Profit ${effectiveMonthName}`}
          value={`ETB ${fmtETB(gp?.actual)}`}
          sub={gp?.budget ? `${fmtPct((gp.actual / gp.budget) * 100)} of budget` : null}
          trend={gp?.actual >= gp?.budget ? 'up' : 'down'}
        />
        <KpiCard
          label={`EBITDA ${effectiveMonthName}`}
          value={`ETB ${fmtETB(ebitda?.actual)}`}
          sub={`vs ${effectiveMonthName} budget`}
          trend={ebitda?.actual > 0 ? 'up' : 'down'}
        />
        <KpiCard
          label="Collections"
          value={`ETB ${fmtETB(data.cashflow?.flows?.collections)}`}
          sub="YTD cash received"
          trend="up"
        />
        <KpiCard
          label="Disbursements"
          value={`ETB ${fmtETB(data.lending?.disbursementsYTD)}`}
          sub="YTD loans issued"
          trend="up"
        />
        <KpiCard
          label="Headcount"
          value={fmtNum(data.hr?.total)}
          sub={lp ? `PAR: ${fmtPct(lp.parPct)}` : 'Active staff'}
          trend={lp ? (lp.parPct > 5 ? 'down' : 'up') : null}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Monthly Revenue — Budget vs Actual (ETB)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS_COLOR }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: AXIS_COLOR }} axisLine={false} tickLine={false} width={46} />
              <Tooltip formatter={(v, n) => [`ETB ${fmtETB(v, 2)}`, n]} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="Budget" fill="rgba(255,255,255,0.30)" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Actual" fill="#EB7D23" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Disbursements by Partner Bank — YTD (ETB)</h3>
          {disbByBank.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={disbByBank} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: AXIS_COLOR }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="bank" tick={{ fontSize: 10, fill: AXIS_COLOR }} axisLine={false} tickLine={false} width={64} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, 'Disbursements']} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="Amount" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {disbByBank.map((_, i) => <Cell key={i} fill={BANK_COLORS[i % BANK_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm">No disbursements data yet</div>
          )}
        </div>
      </div>

      {/* Budget vs Actual progress bars */}
      <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
        <h3 className="text-sm font-bold text-navy mb-4">
          P&L — Budget Attainment{effectiveMonthName ? ` (${effectiveMonthName})` : ''}
        </h3>
        <div className="space-y-4">
          {lines.map(line => {
            const hasActual = line.actual != null
            const pct = hasActual && line.budget ? (line.actual / line.budget) * 100 : null
            const good = pct != null ? (line.higherIsBetter ? pct >= 100 : pct <= 100) : null
            const color = good === null ? '#9BAAB8' : good ? '#2EBD85' : '#E5544B'
            return (
              <div key={line.name}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-navy">{line.name}</span>
                  <span style={{ color }}>
                    {pct != null ? `${fmtPct(pct)} of budget` : 'No data yet'}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-bg">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct ?? 0, 100)}%`, background: color }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted mt-0.5">
                  <span>Actual: {hasActual ? `ETB ${fmtETB(line.actual)}` : '—'}</span>
                  <span>Budget: ETB {fmtETB(line.budget)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
