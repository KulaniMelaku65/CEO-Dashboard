import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtETB, fmtNum, fmtPct } from '../lib/fmt.js'

export default function LoanOps({ data }) {
  const lp      = data.lending?.loanPortfolio
  const monthly = data.lending?.monthlyDisburse

  const monthlyData = (monthly?.labels || []).map((label, i) => ({
    label,
    Amount: monthly.data?.[i] || 0,
  }))

  const portfolioByUnit = lp?.portfolioByUnit || []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Loan Operations</h2>
        <p className="text-xs text-muted font-medium">Disbursements, portfolio health, and lending performance</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Disbursements YTD"
          value={`ETB ${fmtETB(data.lending?.disbursementsYTD)}`}
          sub="Loans issued year-to-date"
          trend="up"
        />
        {lp ? (
          <>
            <KpiCard
              label="Gross Portfolio"
              value={`ETB ${fmtETB(lp.grossPortfolio)}`}
              sub="Outstanding loan book"
            />
            <KpiCard
              label="Active Borrowers"
              value={fmtNum(lp.activeBorrowers)}
              sub="Current loan clients"
              trend="up"
            />
            <KpiCard
              label="PAR > 30 Days"
              value={fmtPct(lp.parPct)}
              sub={`ETB ${fmtETB(lp.overdueBalance)} overdue`}
              trend={lp.parPct > 5 ? 'down' : 'up'}
              accent={lp.parPct > 5 ? '#E5544B' : '#2EBD85'}
            />
          </>
        ) : (
          <div className="col-span-3 bg-white rounded-2xl border border-border p-5 text-muted text-sm flex items-center">
            Portfolio data not available — run snapshot.js with lending integration.
          </div>
        )}
      </div>

      {/* Monthly disbursement area chart */}
      <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
        <h3 className="text-sm font-bold text-navy mb-4">Monthly Disbursements (ETB)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="disbGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EB7D23" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#EB7D23" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={50} />
            <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
            <Area type="monotone" dataKey="Amount" stroke="#EB7D23" strokeWidth={2.5} fill="url(#disbGrad)" dot={{ fill: '#EB7D23', r: 3.5, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Portfolio by unit */}
        {portfolioByUnit.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-4">Portfolio by Unit (ETB)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={portfolioByUnit} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="unit" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={72} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
                <Bar dataKey="amount" fill="#02404F" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Overdue stats */}
        {lp && (
          <div className="grid grid-cols-2 gap-4 content-start">
            <KpiCard label="Overdue Balance"    value={`ETB ${fmtETB(lp.overdueBalance)}`} accent="#E5544B" />
            <KpiCard label="Overdue Borrowers"  value={fmtNum(lp.overdueBorrowers)} trend="down" />
            <KpiCard label="Active Borrowers"   value={fmtNum(lp.activeBorrowers)} trend="up" />
            <KpiCard
              label="Collection Rate"
              value={lp.activeBorrowers
                ? fmtPct(((lp.activeBorrowers - lp.overdueBorrowers) / lp.activeBorrowers) * 100)
                : '—'
              }
              trend="up"
            />
          </div>
        )}
      </div>
    </div>
  )
}
