import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtETB } from '../lib/fmt.js'

export default function LoanOps({ data: snapData }) {
  const ss = snapData.loanOps || {}

  const disbYTDVal     = ss.disbYTD
  const disbYestVal    = ss.disbYest
  const kifiyaShareVal = ss.kifiyaShare
  const opIncomeVal    = ss.opIncome

  const capDep    = ss.capitalDeployment
  const committed = capDep?.committed
  const deployed  = capDep?.deployed
  const undrawn   = capDep?.undrawn
  const deployPct = committed ? (deployed / committed * 100) : null

  const cashflowData = ss.cashflowProjection || []

  const monthly     = snapData.lending?.monthlyDisburse
  const monthlyData = (monthly?.labels || []).map((label, i) => ({
    label,
    Amount: monthly.data?.[i] || 0,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Loan Operations</h2>
        <p className="text-xs text-muted font-medium">Disbursements, portfolio health, and lending performance</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Disbursements YTD"
          value={disbYTDVal != null ? `ETB ${fmtETB(disbYTDVal)}` : '—'}
          sub="Loans issued year-to-date"
          trend="up"
        />
        <KpiCard
          label="Yesterday's Disbursement"
          value={disbYestVal != null ? `ETB ${fmtETB(disbYestVal)}` : '—'}
          sub="Prior day total"
          trend="up"
        />
        <KpiCard
          label="Total Operating Income"
          value={opIncomeVal != null ? `ETB ${fmtETB(opIncomeVal)}` : '—'}
          sub="YTD"
        />
        <KpiCard
          label="Kifiya Share"
          value={kifiyaShareVal != null ? `ETB ${fmtETB(kifiyaShareVal)}` : '—'}
          sub="Total Kifiya share"
          trend="up"
        />
      </div>

      {/* Capital Deployment */}
      {capDep && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Capital Deployment</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Committed</p>
              <p className="text-lg font-extrabold text-navy">ETB {fmtETB(committed)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Deployed</p>
              <p className="text-lg font-extrabold" style={{ color: '#2EBD85' }}>ETB {fmtETB(deployed)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Undrawn</p>
              <p className="text-lg font-extrabold" style={{ color: '#EB7D23' }}>ETB {fmtETB(undrawn)}</p>
            </div>
          </div>
          {deployPct != null && (
            <>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-muted">Deployment Rate</span>
                <span className="text-navy font-extrabold">{deployPct.toFixed(1)}%</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden bg-bg">
                <div className="h-full rounded-full" style={{ width: `${Math.min(deployPct, 100)}%`, background: '#2EBD85' }} />
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Monthly Disbursements from BC */}
        {monthlyData.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-4">Monthly Disbursements — BC (ETB)</h3>
            <ResponsiveContainer width="100%" height={220}>
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
        )}

        {/* Cashflow Projection */}
        {cashflowData.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-1">Last Available Cashflow Projection (ETB)</h3>
            <p className="text-[10px] text-muted font-medium mb-3">Most recent projection data from Superset · {cashflowData[0]?.label} – {cashflowData[cashflowData.length - 1]?.label}</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cashflowData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
                <Bar dataKey="Amount" fill="#1FB6A6" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
