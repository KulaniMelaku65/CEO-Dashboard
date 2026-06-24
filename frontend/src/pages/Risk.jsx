import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtETB, fmtNum, fmtPct } from '../lib/fmt.js'

export default function Risk({ data }) {
  const lp       = data.lending?.loanPortfolio
  const bankDaily = data.cashflow?.bankDaily

  const bankData = (bankDaily?.labels || []).map((label, i) => ({
    label,
    Balance: bankDaily.balances?.[i] || 0,
  }))

  const overdueBorrowerRate = lp?.activeBorrowers
    ? (lp.overdueBorrowers / lp.activeBorrowers) * 100
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Risk & Portfolio</h2>
        <p className="text-xs text-muted font-medium">Credit risk indicators, portfolio quality, and cash position</p>
      </div>

      {lp ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="PAR > 30 Days"
              value={fmtPct(lp.parPct)}
              sub="Portfolio at risk"
              trend={lp.parPct > 5 ? 'down' : 'up'}
              accent={lp.parPct > 5 ? '#E5544B' : '#2EBD85'}
            />
            <KpiCard
              label="Overdue Balance"
              value={`ETB ${fmtETB(lp.overdueBalance)}`}
              sub="Past-due outstanding"
              accent="#E5544B"
            />
            <KpiCard
              label="Overdue Borrowers"
              value={fmtNum(lp.overdueBorrowers)}
              sub={`of ${fmtNum(lp.activeBorrowers)} active`}
              trend="down"
            />
            <KpiCard
              label="Gross Portfolio"
              value={`ETB ${fmtETB(lp.grossPortfolio)}`}
              sub="Total outstanding"
            />
          </div>

          {/* Risk indicator bars */}
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-5">Portfolio Risk Indicators</h3>
            <div className="space-y-5">
              {[
                {
                  label: 'Portfolio at Risk (PAR > 30)',
                  value: lp.parPct,
                  threshold: 5,
                  max: 25,
                  unit: '%',
                },
                {
                  label: 'Overdue Borrower Rate',
                  value: overdueBorrowerRate,
                  threshold: 10,
                  max: 40,
                  unit: '%',
                },
              ].map(ind => {
                const barW  = ind.value != null ? Math.min((ind.value / ind.max) * 100, 100) : 0
                const bad   = ind.value != null && ind.value > ind.threshold
                const color = bad ? '#E5544B' : '#2EBD85'
                return (
                  <div key={ind.label}>
                    <div className="flex justify-between text-xs font-semibold mb-2">
                      <span className="text-navy">{ind.label}</span>
                      <span style={{ color }}>
                        {ind.value != null ? ind.value.toFixed(2) + ind.unit : '—'}
                        &nbsp;{ind.value != null ? (bad ? '⚠ Above threshold' : '✓ Within limits') : 'No data'}
                      </span>
                    </div>
                    <div className="relative h-3 rounded-full overflow-hidden bg-bg">
                      <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: color }} />
                      {/* threshold marker */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-muted/40"
                        style={{ left: `${(ind.threshold / ind.max) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted mt-1">
                      Threshold: {ind.threshold}{ind.unit} &nbsp;|&nbsp; Scale max: {ind.max}{ind.unit}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-border p-8 text-center text-muted text-sm">
          Loan portfolio data not available. Sync from Business Central with lending module enabled.
        </div>
      )}

      {/* Daily cash balance */}
      {bankData.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Daily Bank Cash Balance (ETB)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={bankData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1FB6A6" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#1FB6A6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Area type="monotone" dataKey="Balance" stroke="#1FB6A6" strokeWidth={2.5} fill="url(#cashGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
