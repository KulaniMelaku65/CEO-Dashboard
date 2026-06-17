import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtETB } from '../lib/fmt.js'

const BANK_COLORS = ['#02404F', '#1FB6A6', '#EB7D23', '#2EBD85', '#3A4656', '#F5A870', '#6B7C93']

export default function Collections({ data }) {
  const cf        = data.cashflow || {}
  const colByBank = cf.collectionsByBank || []
  const monthly   = cf.monthlyCollections

  const monthlyData = (monthly?.labels || []).map((label, i) => ({
    label,
    Collections: monthly.data?.[i] || 0,
  }))

  const total = colByBank.reduce((s, b) => s + b.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Receivables & Collections</h2>
        <p className="text-xs text-muted font-medium">Cash collected via BPASS banking partners (GL 5013–5026)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Total Collections"
          value={`ETB ${fmtETB(cf.flows?.collections)}`}
          sub="YTD cash received"
          trend="up"
          accent="#02404F"
        />
        <KpiCard
          label="Operating Outflows"
          value={`ETB ${fmtETB(cf.flows?.operatingOut)}`}
          sub="YTD operating costs"
        />
        <KpiCard
          label="CapEx Outflows"
          value={`ETB ${fmtETB(cf.flows?.capexOut)}`}
          sub="YTD capital expenditure"
        />
      </div>

      {/* Collections by bank bar chart */}
      <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
        <h3 className="text-sm font-bold text-navy mb-4">Collections by Bank Partner (ETB)</h3>
        {colByBank.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={colByBank} margin={{ top: 4, right: 4, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
              <XAxis
                dataKey="bank"
                tick={{ fontSize: 10, fill: '#6B7C93' }}
                axisLine={false}
                tickLine={false}
                angle={-18}
                textAnchor="end"
                interval={0}
              />
              <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, 'Collections']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={44}>
                {colByBank.map((_, i) => <Cell key={i} fill={BANK_COLORS[i % BANK_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-muted text-sm">No collections data yet</div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Monthly trend */}
        {monthlyData.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-4">Monthly Collections Trend (ETB)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
                <Line type="monotone" dataKey="Collections" stroke="#1FB6A6" strokeWidth={2.5} dot={{ fill: '#1FB6A6', r: 3.5, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Bank table */}
        {colByBank.length > 0 && (
          <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-navy">Bank Detail</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg">
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">Bank</th>
                  <th className="text-right px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">Amount (ETB)</th>
                  <th className="text-right px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">Share</th>
                </tr>
              </thead>
              <tbody>
                {colByBank.map((b, i) => (
                  <tr key={b.bank} className={i % 2 ? 'bg-bg/50' : ''}>
                    <td className="px-5 py-2.5 font-bold text-navy flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: BANK_COLORS[i % BANK_COLORS.length] }} />
                      {b.bank}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold text-navy">{fmtETB(b.amount, 2)}</td>
                    <td className="px-5 py-2.5 text-right text-muted font-medium">
                      {total ? ((b.amount / total) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
