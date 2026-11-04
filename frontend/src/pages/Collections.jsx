import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtETB } from '../lib/fmt.js'
import { cashflow as cashflowApi } from '../lib/api.js'
import { YearMonthFilter } from './CashFlow.jsx'

const BANK_COLORS = ['#02404F', '#1FB6A6', '#EB7D23', '#2EBD85', '#3A4656', '#F5A870', '#6B7C93']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function Collections({ data }) {
  const liveCf = data.cashflow || {}

  // Year/Month filter for Total Collections + Monthly Collections Trend — the only two
  // figures on this page backed by a period-queryable source: routes/cashflow.js now
  // builds a fresh bank-ledger Collections figure for whichever period is requested
  // (snapshot-builder.js's buildBankCollections), the same /api/cashflow endpoint the
  // Cashflow page already uses for its own Direct CF Statement. Revenue Accrued,
  // Operating/CapEx Outflows and the Disbursements-by-Bank/Revenue-by-Bank sections below
  // have no such historical source (they're account-balance/loan/Superset figures with no
  // period-scoped backend query) — they stay live/YTD-only, and say so explicitly instead
  // of silently ignoring the filter once it's active.
  const [year, setYear]       = useState(null)
  const [month, setMonth]     = useState(null)
  const [filteredCollections, setFilteredCollections] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!year) { setFilteredCollections(null); setError(''); return }
    let cancelled = false
    setLoading(true); setError('')
    cashflowApi.get(year, month)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || 'Failed to load.'))))
      .then(j => { if (!cancelled) setFilteredCollections(j.collections || null) })
      .catch(e => { if (!cancelled) setError(typeof e.message === 'string' ? e.message : 'Failed to load collections for that period.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year, month])

  // Years offered go back to the earliest year BC has any ledger activity for — same
  // 2024 floor the Cashflow/Procurement Year filters use.
  const currentYear = new Date().getFullYear()
  const years = []
  for (let y = currentYear; y >= 2024; y--) years.push(y)

  const periodLabel = year ? (month ? `${MONTH_NAMES[month - 1]} ${year}` : String(year)) : 'YTD'
  const cf = year ? (filteredCollections || {}) : liveCf

  const colByBank = data.loanOps?.disbByBank || []
  const monthly   = cf.monthlyCollections
  const revenueByBank = data.financialSS?.revenueByBank || []
  const revMonthly    = data.budgetOverview?.monthly

  const monthlyData = (monthly?.labels || []).map((label, i) => ({
    label,
    Collections: monthly.data?.[i] || 0,
  }))

  const total = colByBank.reduce((s, b) => s + (b.Amount || 0), 0)

  // Revenue accrued — latest accrued month only (per decision: not a running trend here).
  const revLabels = revMonthly?.labels || []
  const latestIdx = revLabels.length - 1
  const revenueAccruedLabel  = latestIdx >= 0 ? revLabels[latestIdx] : null
  const revenueAccruedAmount = latestIdx >= 0 ? (revMonthly.actual?.[latestIdx] || 0) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">Receivables & Collections</h2>
          <p className="text-xs text-muted font-medium">Cash collected via BPASS banking partners (GL 5013–5026)</p>
        </div>
        <YearMonthFilter
          year={year} month={month}
          onYear={y => { setYear(y); setMonth(null) }}
          onMonth={setMonth}
          onClear={() => { setYear(null); setMonth(null) }}
          years={years}
        />
      </div>

      {error && <p className="text-xs font-semibold" style={{ color: '#E5544B' }}>{error}</p>}
      {year && (
        <p className="text-[11px] text-muted font-medium -mt-3">
          Total Collections and the Monthly Collections Trend below follow this filter. Revenue Accrued, Operating/CapEx
          Outflows, and the Revenue/Disbursements-by-Bank charts have no historical source yet and always show live YTD figures.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Collections"
          value={loading ? '…' : `ETB ${fmtETB(cf.flows?.collections)}`}
          sub={`${periodLabel} cash received`}
          trend="up"
          accent="#02404F"
        />
        <KpiCard
          label="Revenue Accrued"
          value={revenueAccruedAmount != null ? `ETB ${fmtETB(revenueAccruedAmount)}` : '—'}
          sub={revenueAccruedLabel ? `Latest accrued month — ${revenueAccruedLabel} (live only)` : 'No accrual data yet'}
          accent="#1FB6A6"
        />
        <KpiCard
          label="Operating Outflows"
          value={`ETB ${fmtETB(liveCf.flows?.operatingOut)}`}
          sub="YTD operating costs (live only)"
        />
        <KpiCard
          label="CapEx Outflows"
          value={`ETB ${fmtETB(liveCf.flows?.capexOut)}`}
          sub="YTD capital expenditure (live only)"
        />
      </div>

      {/* Revenue by Partner Bank — YTD (no period-scoped source yet, see note above) */}
      {revenueByBank.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-1">Revenue by Partner Bank — YTD (ETB)</h3>
          <p className="text-[10px] text-muted font-medium mb-3">Operating income + provision per bank</p>
          <ResponsiveContainer width="100%" height={Math.max(180, revenueByBank.length * 40)}>
            <BarChart data={revenueByBank} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
              <XAxis type="number" tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="bank" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={80} />
              <Tooltip formatter={(v, n) => [`ETB ${fmtETB(v, 2)}`, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Bar dataKey="Revenue" fill="#02404F" radius={[0, 4, 4, 0]} maxBarSize={20} name="Revenue" />
              <Bar dataKey="Provision" fill="#E5544B" radius={[0, 4, 4, 0]} maxBarSize={20} name="Provision" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Collections by bank bar chart — Disbursements, YTD only (no period-scoped source yet) */}
      <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
        <h3 className="text-sm font-bold text-navy mb-4">Disbursements by Partner Bank — YTD (ETB)</h3>
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
              <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, 'Disbursements']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Bar dataKey="Amount" radius={[4, 4, 0, 0]} maxBarSize={44}>
                {colByBank.map((_, i) => <Cell key={i} fill={BANK_COLORS[i % BANK_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-muted text-sm">No disbursements data yet</div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Monthly trend — follows the Year/Month filter above */}
        {monthlyData.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-4">Monthly Collections Trend — {periodLabel} (ETB)</h3>
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
                    <td className="px-5 py-2.5 text-right font-semibold text-navy">{fmtETB(b.Amount, 2)}</td>
                    <td className="px-5 py-2.5 text-right text-muted font-medium">
                      {total ? ((b.Amount / total) * 100).toFixed(1) : 0}%
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
