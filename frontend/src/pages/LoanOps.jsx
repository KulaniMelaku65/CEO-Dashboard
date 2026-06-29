import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtETB } from '../lib/fmt.js'

const BANK_COLORS = ['#02404F', '#1FB6A6', '#EB7D23', '#2EBD85', '#3A4656', '#F5A870', '#6B7C93']

export default function LoanOps({ data: snapData }) {
  const ss = snapData.loanOps || {}

  const disbYTDVal     = ss.disbYTD
  const disbYestVal    = ss.disbYest
  const kifiyaShareVal = ss.kifiyaShare
  const opIncomeVal    = ss.opIncome
  const avgLoanSize    = ss.avgLoanSize

  const capDep    = ss.capitalDeployment
  const committed = capDep?.committed
  const deployed  = capDep?.deployed
  const undrawn   = capDep?.undrawn
  const deployPct = committed ? (deployed / committed * 100) : null

  const cashflowData     = ss.cashflowProjection || []
  const kifiyaMonthly    = ss.kifiyaMonthly || []
  const disbByBank       = ss.disbByBank || []
  const weeklyDisbTrend  = ss.weeklyDisbTrend || []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Loan Operations</h2>
        <p className="text-xs text-muted font-medium">Disbursements, portfolio health, and lending performance</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
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
          label="Kifiya Share YTD"
          value={kifiyaShareVal != null ? `ETB ${fmtETB(kifiyaShareVal)}` : '—'}
          sub="Total Kifiya share"
          trend="up"
        />
        <KpiCard
          label="Total Operating Income"
          value={opIncomeVal != null ? `ETB ${fmtETB(opIncomeVal)}` : '—'}
          sub="YTD"
        />
        <KpiCard
          label="Avg Loan Size"
          value={avgLoanSize != null ? `ETB ${avgLoanSize.toLocaleString()}` : '—'}
          sub="Per loan · all banks"
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

      {/* Disbursements by Partner Bank */}
      {disbByBank.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-1">Disbursements by Partner Bank — YTD (ETB)</h3>
          <p className="text-[10px] text-muted font-medium mb-3">FY 2026 · all banks · from Superset</p>
          <ResponsiveContainer width="100%" height={Math.max(180, disbByBank.length * 36)}>
            <BarChart data={disbByBank} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
              <XAxis type="number" tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="bank" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={80} />
              <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Bar dataKey="Amount" radius={[0, 4, 4, 0]} maxBarSize={24}>
                {disbByBank.map((_, i) => <Cell key={i} fill={BANK_COLORS[i % BANK_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Monthly Kifiya Share from Superset */}
        {kifiyaMonthly.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-1">Monthly Kifiya Share — Superset (ETB)</h3>
            <p className="text-[10px] text-muted font-medium mb-3">YTD 2026 · {kifiyaMonthly[0]?.label} – {kifiyaMonthly[kifiyaMonthly.length - 1]?.label}</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={kifiyaMonthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
                <Bar dataKey="Amount" fill="#EB7D23" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Weekly Disbursement Trend */}
        {weeklyDisbTrend.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-1">Weekly Disbursement Trend (ETB)</h3>
            <p className="text-[10px] text-muted font-medium mb-3">Real-time · {weeklyDisbTrend[0]?.label} – {weeklyDisbTrend[weeklyDisbTrend.length - 1]?.label}</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyDisbTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
                <Bar dataKey="Amount" fill="#02404F" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
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
