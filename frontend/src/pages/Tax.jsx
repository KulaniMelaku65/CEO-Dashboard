import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { fmtETB } from '../lib/fmt.js'

const NAVY   = '#02404F'
const TEAL   = '#1FB6A6'
const ORANGE = '#EB7D23'
const RED    = '#E5544B'

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-border">
      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-black" style={{ color: accent || '#FFFFFF' }}>ETB {fmtETB(value)}</p>
    </div>
  )
}

const NEEDED = [
  'Tax account mapping (VAT, WHT, Payroll tax, Excise) from the Chart of Accounts',
  'Confirmation of source: Business Central tax module vs. a separate system',
  'Monthly tax period definition (calendar month close date, filing cadence)'
]

export default function Tax({ data }) {
  const tax = data?.tax || null
  const byType = tax?.byType || []
  const monthlyTotal = tax?.monthlyTotal || { labels: [], data: [] }

  const monthlyData = monthlyTotal.labels.map((label, i) => ({ label, Tax: monthlyTotal.data[i] || 0 }))
  const maxAbs = Math.max(...byType.map(t => Math.abs(t.outstanding)), 1)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Tax</h2>
        <p className="text-xs text-muted font-medium">
          {tax ? `Tax Payables (326) — outstanding as of ${tax.asOf}` : 'Monthly tax reporting · source: ERP'}
        </p>
      </div>

      {!tax || byType.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-8">
          <div className="flex items-start gap-3 mb-5">
            <span className="text-lg" style={{ color: ORANGE }}>ⓘ</span>
            <div>
              <p className="text-sm font-bold text-navy mb-1">No tax data source yet</p>
              <p className="text-xs text-muted leading-relaxed max-w-xl">
                This tab is placed here so it's tracked as part of the finance dashboard, but there's
                currently no tax account mapping in Business Central to report from. Nothing is shown
                here until Yohannes provides the tax account mapping — plugging that in is what turns
                this into a working monthly tax report (by tax type, matching the blueprint's VAT / WHT
                / Payroll / Excise breakdown).
              </p>
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">Needed to build this out</p>
            <ul className="space-y-1.5">
              {NEEDED.map(item => (
                <li key={item} className="text-xs text-navy flex items-start gap-2">
                  <span className="text-muted mt-0.5">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <>
          {/* Outstanding balance cards — total + one per tax type */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Total Tax Payable" value={tax.totalOutstanding} accent={ORANGE} />
            {byType.map(t => (
              <StatCard
                key={t.type}
                label={t.type}
                value={t.outstanding}
                accent={t.outstanding < 0 ? TEAL : NAVY}
              />
            ))}
          </div>

          {/* Monthly trend — total tax accrued (net change) per month */}
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-1">Monthly Tax Accrued (ETB)</h3>
            <p className="text-[10px] text-muted mb-4 font-medium">
              Net change across all Tax Payables accounts — positive means tax accrued that month
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={46} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, 'Tax Accrued']} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E3E9F2' }} />
                <Bar dataKey="Tax" radius={[3, 3, 0, 0]} maxBarSize={28}>
                  {monthlyData.map((d, i) => (
                    <Cell key={i} fill={d.Tax < 0 ? RED : TEAL} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By tax type — outstanding balance bars */}
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-1">Outstanding by Tax Type</h3>
            <p className="text-[10px] text-muted mb-4 font-medium">Current Tax Payables balance per account</p>
            <div className="space-y-3">
              {byType.map(t => {
                const pct = (Math.abs(t.outstanding) / maxAbs) * 100
                const neg = t.outstanding < 0
                return (
                  <div key={t.type}>
                    <div className="flex justify-between items-baseline mb-1 gap-2">
                      <span className="text-xs font-bold text-navy truncate">{t.type}</span>
                      <span className="text-xs font-extrabold flex-shrink-0" style={{ color: neg ? '#E5544B' : '#FFFFFF' }}>
                        {neg ? '-' : ''}ETB {fmtETB(Math.abs(t.outstanding))}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#F4F6FA' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: neg ? '#E5544B' : '#1FB6A6' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
