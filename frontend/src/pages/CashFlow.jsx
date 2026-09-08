import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { fmtETB } from '../lib/fmt.js'

const NAVY   = '#02404F'
const TEAL   = '#1FB6A6'
const ORANGE = '#EB7D23'
const GREEN  = '#2EBD85'
const RED    = '#E5544B'

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-border">
      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black" style={{ color: accent || '#FFFFFF' }}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function UtilGauge({ label, used, total, color }) {
  const pct = total ? Math.min((used / total) * 100, 100) : 0
  return (
    <div className="bg-white rounded-2xl border border-border p-4">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-xs font-bold text-navy">{label}</span>
        <span className="text-xs font-extrabold" style={{ color }}>{fmtETB(used)} / {fmtETB(total)}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#F4F6FA' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function CashFlow({ data }) {
  const cf = data?.cashflow || {}
  const bankDaily          = cf.bankDaily          || { labels: [], balances: [] }
  const collectionsByBank  = cf.collectionsByBank  || []
  const flows              = cf.flows              || {}
  const debtUtilisation    = cf.debtUtilisation    || {}
  const capexUtilisation   = cf.capexUtilisation   || {}
  const monthlyCollections = cf.monthlyCollections || { labels: [], data: [] }

  const dailyData = bankDaily.labels.map((label, i) => ({ label, Balance: bankDaily.balances[i] || 0 }))
  const monthlyData = monthlyCollections.labels.map((label, i) => ({ label, Collections: monthlyCollections.data[i] || 0 }))

  const netFlow = (flows.collections || 0) + (flows.otherInflows || 0) - (flows.operatingOut || 0) - (flows.capexOut || 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Cashflow</h2>
        <p className="text-xs text-muted font-medium">Cash movement view · bank balances, collections and outflows</p>
      </div>

      <div className="bg-white rounded-2xl border p-4 flex items-start gap-2.5" style={{ borderColor: '#EB7D2340', background: '#EB7D2308' }}>
        <span className="text-sm" style={{ color: ORANGE }}>ⓘ</span>
        <p className="text-[11px] font-medium text-navy leading-relaxed">
          <strong>Roadmap (lower priority):</strong> this tab currently shows what's derivable from bank
          ledger and GL data today, refreshed on the regular sync schedule. A fuller cash-from-receivable
          + payable + bank + GL automation, with daily/weekly reporting modes and syncing three times a
          day, is planned but not yet built.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Collections" value={`ETB ${fmtETB(flows.collections)}`} accent={GREEN} />
        <StatCard label="Operating Outflows" value={`ETB ${fmtETB(flows.operatingOut)}`} accent={RED} />
        <StatCard label="CapEx Outflows" value={`ETB ${fmtETB(flows.capexOut)}`} accent={ORANGE} />
        <StatCard label="Net Flow" value={`ETB ${fmtETB(netFlow)}`} accent={netFlow >= 0 ? GREEN : RED} sub="Collections − Outflows" />
      </div>

      {/* Utilisation gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UtilGauge label="Debt Facility Utilisation" used={debtUtilisation.used} total={debtUtilisation.facility} color={TEAL} />
        <UtilGauge label="CapEx Budget Utilisation" used={capexUtilisation.used} total={capexUtilisation.budget} color={ORANGE} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-1">Bank Balance — Last 30 Days (ETB)</h3>
          <p className="text-[10px] text-muted mb-4 font-medium">Running consolidated bank balance</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cfBalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={NAVY} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={NAVY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={46} />
              <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, 'Balance']} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E3E9F2' }} />
              <Area type="monotone" dataKey="Balance" stroke={NAVY} strokeWidth={2} fill="url(#cfBalGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-1">Monthly Collections (ETB)</h3>
          <p className="text-[10px] text-muted mb-4 font-medium">Positive bank inflows by month</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={46} />
              <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, 'Collections']} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E3E9F2' }} />
              <Bar dataKey="Collections" fill={TEAL} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Collections by bank */}
      {collectionsByBank.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-1">Collections by Bank</h3>
          <p className="text-[10px] text-muted font-medium mb-3">Top inflow-generating bank accounts</p>
          <ResponsiveContainer width="100%" height={Math.max(180, collectionsByBank.length * 40)}>
            <BarChart data={collectionsByBank} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
              <XAxis type="number" tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="bank" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={110} />
              <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, 'Amount']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Bar dataKey="amount" fill={NAVY} radius={[0, 4, 4, 0]} maxBarSize={20} name="Amount" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
