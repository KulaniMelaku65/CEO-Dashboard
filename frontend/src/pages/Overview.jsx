import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtETB, fmtPct, fmtNum } from '../lib/fmt.js'

const BANK_COLORS = ['#02404F', '#1FB6A6', '#EB7D23', '#2EBD85', '#3A4656', '#F5A870', '#6B7C93']

export default function Overview({ data }) {
  const lines   = data.budgetActual?.lines || []
  const rev     = lines.find(l => l.name === 'Revenue')
  const gp      = lines.find(l => l.name === 'Gross Profit')
  const ebitda  = lines.find(l => l.name === 'EBITDA')
  const lp      = data.lending?.loanPortfolio
  const monthly = data.budgetOverview?.monthly

  const monthlyData = (monthly?.labels || []).map((label, i) => ({
    label,
    Budget: monthly.budget?.[i] || 0,
    Actual: monthly.actual?.[i] || 0,
  }))

  const colByBank = data.cashflow?.collectionsByBank || []

  const revPct = rev?.budget ? (rev.actual / rev.budget) * 100 : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Executive Overview</h2>
        <p className="text-xs text-muted font-medium">Year-to-date performance — all business units</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Revenue YTD"
          value={`ETB ${fmtETB(rev?.actual)}`}
          sub={revPct != null ? `${fmtPct(revPct)} of budget` : null}
          trend={revPct != null ? (revPct >= 100 ? 'up' : 'down') : null}
        />
        <KpiCard
          label="Gross Profit"
          value={`ETB ${fmtETB(gp?.actual)}`}
          sub={gp?.budget ? `${fmtPct((gp.actual / gp.budget) * 100)} of budget` : null}
          trend={gp?.actual >= gp?.budget ? 'up' : 'down'}
        />
        <KpiCard
          label="EBITDA"
          value={`ETB ${fmtETB(ebitda?.actual)}`}
          sub="YTD"
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
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={46} />
              <Tooltip formatter={(v, n) => [`ETB ${fmtETB(v, 2)}`, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Bar dataKey="Budget" fill="#E3E9F2" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Actual" fill="#EB7D23" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Collections by Bank (ETB)</h3>
          {colByBank.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={colByBank} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="bank" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={64} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {colByBank.map((_, i) => <Cell key={i} fill={BANK_COLORS[i % BANK_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm">No collections data yet</div>
          )}
        </div>
      </div>

      {/* Budget vs Actual progress bars */}
      <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
        <h3 className="text-sm font-bold text-navy mb-4">P&L — Budget Attainment</h3>
        <div className="space-y-4">
          {lines.map(line => {
            const pct = line.budget ? (line.actual / line.budget) * 100 : 0
            const good = line.higherIsBetter ? pct >= 100 : pct <= 100
            const color = good ? '#2EBD85' : '#E5544B'
            return (
              <div key={line.name}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-navy">{line.name}</span>
                  <span style={{ color }}>{fmtPct(pct)} of budget</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-bg">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted mt-0.5">
                  <span>Actual: ETB {fmtETB(line.actual)}</span>
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
