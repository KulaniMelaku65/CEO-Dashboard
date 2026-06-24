import { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtETB, fmtPct } from '../lib/fmt.js'
import { superset } from '../lib/api.js'

const toM = v => v != null ? Math.round(v / 1e6 * 10) / 10 : null

function useChart(id) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    superset.chart(id)
      .then(r => r.ok ? r.json() : null)
      .then(j => setData(j?.result?.[0]?.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [id])
  return { data, loading }
}

const RAR_KEY = '(SUM(interest_collected::NUMERIC) + SUM(penality_collected::NUMERIC) + SUM(access_fee::NUMERIC)\n\n) \n\n- \nSUM(\n    outstanding_principal::NUMERIC * CASE \n        WHEN (CURRENT_DATE - DATE(maturity_date)) > 360 THEN 1.0\n        WHEN (CURRENT_DATE - DATE(maturity_date)) BETWEEN 180 AND 360 THEN 0.5\n        WHEN (CURRENT_DATE - DATE(maturity_date)) BETWEEN 90 AND 179 THEN 0.2\n        WHEN (CURRENT_DATE - DATE(maturity_date)) BETWEEN 31 AND 89 THEN 0.03\n        WHEN (CURRENT_DATE - DATE(maturity_date)) BETWEEN 0 AND 30 THEN 0.01\n        ELSE 0 -- For loans not yet due (Current)\n    END\n)'

export default function Risk({ data: snapData }) {
  const { data: riskAdjLTM }  = useChart(1)   // LTM Risk-Adjusted Revenue
  const { data: riskAdjYTD }  = useChart(10)  // YTD Risk-Adjusted Revenue (by maturity date)
  const { data: capitalDep }  = useChart(38)  // Capital Deployment
  const { data: netProfit }   = useChart(27)  // Net Profit Before Tax
  const { data: opIncome }    = useChart(23)  // Total Operating Income

  const bankDaily = snapData.cashflow?.bankDaily
  const bankData  = (bankDaily?.labels || []).map((label, i) => ({
    label,
    Balance: bankDaily.balances?.[i] || 0,
  }))

  const rarLTM     = riskAdjLTM?.[0]?.[RAR_KEY]
  const netProfVal = netProfit?.[0]?.['SUM(net_profit_before_tax::NUMERIC)']
  const opIncVal   = opIncome?.[0]?.['SUM(total_operating_income::NUMERIC)']

  const capDep    = capitalDep?.[0]
  const committed = capDep?.['Committed Amount']
  const deployed  = capDep?.['Deployed Amount']
  const undrawn   = capDep?.['Undrawn Amount']
  const deployPct = committed ? (deployed / committed * 100) : null

  // YTD risk-adjusted revenue trend (Chart 10 returns rows by maturity_date bucket)
  const rarTrend = (riskAdjYTD || [])
    .filter(r => r.maturity_date != null)
    .map(r => ({
      label: new Date(r.maturity_date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      Revenue: toM(r.Revenue)
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Risk & Portfolio</h2>
        <p className="text-xs text-muted font-medium">Credit risk indicators, portfolio quality, and cash position</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Risk-Adj. Revenue (LTM)"
          value={rarLTM != null ? `ETB ${fmtETB(toM(rarLTM))}` : '—'}
          sub="Last 12 months"
          trend={rarLTM != null ? (rarLTM > 0 ? 'up' : 'down') : null}
          accent={rarLTM != null ? (rarLTM > 0 ? '#2EBD85' : '#E5544B') : undefined}
        />
        <KpiCard
          label="Net Profit Before Tax"
          value={netProfVal != null ? `ETB ${fmtETB(toM(netProfVal))}` : '—'}
          sub="YTD"
          trend={netProfVal != null ? (netProfVal > 0 ? 'up' : 'down') : null}
        />
        <KpiCard
          label="Total Operating Income"
          value={opIncVal != null ? `ETB ${fmtETB(toM(opIncVal))}` : '—'}
          sub="YTD"
          trend="up"
        />
        <KpiCard
          label="Capital Deployed"
          value={deployed != null ? `ETB ${fmtETB(toM(deployed))}` : '—'}
          sub={deployPct != null ? `${deployPct.toFixed(1)}% of committed` : 'of committed capital'}
          trend="up"
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
                  { name: 'Committed', value: toM(committed) },
                  { name: 'Deployed',  value: toM(deployed)  },
                  { name: 'Undrawn',   value: toM(undrawn)   },
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
