import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtETB } from '../lib/fmt.js'

export default function Risk({ data: snapData }) {
  const ss = snapData.risk || {}

  const rarLTM      = ss.riskAdjRevenueLTM
  const netProfVal  = ss.netProfitBeforeTax
  const opIncVal    = ss.opIncome
  const rarTrend    = ss.riskAdjRevenueYTD || []
  const provTrend   = ss.provisionTrend || []
  const provPct     = ss.provisionPct

  const capDep    = ss.capitalDeployment
  const committed = capDep?.committed
  const deployed  = capDep?.deployed
  const undrawn   = capDep?.undrawn
  const deployPct = committed ? (deployed / committed * 100) : null

  const bankDaily = snapData.cashflow?.bankDaily
  const bankData  = (bankDaily?.labels || []).map((label, i) => ({
    label,
    Balance: bankDaily.balances?.[i] || 0,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Risk & Portfolio</h2>
        <p className="text-xs text-muted font-medium">Credit risk indicators, portfolio quality, and cash position</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          label="Risk-Adj. Revenue (LTM)"
          value={rarLTM != null ? `ETB ${fmtETB(rarLTM)}` : '—'}
          sub="Last 12 months"
          trend={rarLTM != null ? (rarLTM > 0 ? 'up' : 'down') : null}
          accent={rarLTM != null ? (rarLTM > 0 ? '#2EBD85' : '#E5544B') : undefined}
        />
        <KpiCard
          label="Net Profit Before Tax"
          value={netProfVal != null ? `ETB ${fmtETB(netProfVal)}` : '—'}
          sub="YTD"
          trend={netProfVal != null ? (netProfVal > 0 ? 'up' : 'down') : null}
        />
        <KpiCard
          label="Total Operating Income"
          value={opIncVal != null ? `ETB ${fmtETB(opIncVal)}` : '—'}
          sub="YTD"
          trend="up"
        />
        <KpiCard
          label="Capital Deployed"
          value={deployed != null ? `ETB ${fmtETB(deployed)}` : '—'}
          sub={deployPct != null ? `${deployPct.toFixed(1)}% of committed` : 'of committed capital'}
          trend="up"
        />
        <KpiCard
          label="Provision Rate"
          value={provPct != null ? `${provPct}%` : '—'}
          sub="Latest month · provision / revenue"
          trend={provPct != null ? (provPct > 10 ? 'down' : 'up') : null}
          accent={provPct != null ? (provPct > 10 ? '#E5544B' : provPct > 5 ? '#EB7D23' : '#2EBD85') : undefined}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Capital Deployment breakdown */}
        {capDep && (
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-4">Capital Deployment (ETB)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={[
                  { name: 'Committed', value: committed },
                  { name: 'Deployed',  value: deployed  },
                  { name: 'Undrawn',   value: undrawn   },
                ]}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  <Cell fill="#02404F" />
                  <Cell fill="#2EBD85" />
                  <Cell fill="#EB7D23" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* YTD Risk-Adjusted Revenue trend */}
        {rarTrend.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-4">YTD Risk-Adjusted Revenue (ETB)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={rarTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1FB6A6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1FB6A6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
                <Area type="monotone" dataKey="Revenue" stroke="#1FB6A6" strokeWidth={2.5} fill="url(#rarGrad)" dot={{ fill: '#1FB6A6', r: 3.5, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Monthly Provision Trend */}
      {provTrend.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-1">Monthly Provision Rate (%) — Credit Risk Indicator</h3>
          <p className="text-[10px] text-muted font-medium mb-3">Provision ÷ Revenue · FY 2026 · from Superset · lower is better</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={provTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="provGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E5544B" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#E5544B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v, n) => [n === 'ProvPct' ? `${v}%` : `ETB ${fmtETB(v, 2)}`, n === 'ProvPct' ? 'Provision %' : n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Area type="monotone" dataKey="ProvPct" stroke="#E5544B" strokeWidth={2.5} fill="url(#provGrad)" dot={{ fill: '#E5544B', r: 3.5, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Daily cash balance from BC */}
      {bankData.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Daily Bank Cash Balance (ETB)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={bankData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#02404F" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#02404F" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Area type="monotone" dataKey="Balance" stroke="#02404F" strokeWidth={2.5} fill="url(#cashGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
