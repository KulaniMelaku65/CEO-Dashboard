import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie
} from 'recharts'
import { fmtETB } from '../lib/fmt.js'

// Same palette as the HR Analysis page's KpiBlock (NAVY/TEAL/ORANGE, plus the darker
// teal variant it uses for a 4th accent) — kept identical here for visual consistency
// across the two pages, rather than introducing a separate ad hoc chart palette.
const NAVY   = '#0F5565'
const TEAL   = '#12707F'
const ORANGE = '#EB7D23'
const RED    = '#D32F2F'
const DTEAL  = '#1A7A72'
const SLICE_COLORS = [ORANGE, TEAL, NAVY, RED, DTEAL]

// Same solid-background KPI block style as HR Analysis's KpiBlock — white text on an
// accent-colored card, instead of colored text on a white card, for consistency.
function StatCard({ label, value, accent, sub }) {
  return (
    <div className="flex flex-col justify-between p-4 rounded-xl" style={{ background: accent || NAVY }}>
      <p className="text-[9px] uppercase tracking-widest font-bold text-white/60 leading-tight">{label}</p>
      <p className="font-extrabold text-white leading-none mt-2 tabular-nums text-[18px]">ETB {fmtETB(value)}</p>
      {sub && <p className="text-[10px] text-white/50 mt-1 truncate">{sub}</p>}
    </div>
  )
}

// Multi-select dropdown, same visual language as the HR page's filter bar (PeopleOpsFilterBar's
// `Sel`) — label above a bordered white control — but with checkboxes since more than one
// tax type can be picked at once, which a native <select> can't do with usable UX.
function TypeMultiSelect({ options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const toggle = (type) => onChange(selected.includes(type) ? selected.filter(t => t !== type) : [...selected, type])
  const label = selected.length === 0 ? 'All types' : selected.length === 1 ? selected[0] : `${selected.length} types selected`

  return (
    <div ref={ref} className="relative flex flex-col gap-1" style={{ minWidth: 180 }}>
      <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Tax Type</span>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between gap-2 bg-white border border-border rounded-lg px-3 py-2 text-xs font-bold text-ink"
      >
        <span className="truncate">{label}</span>
        <span className="text-muted text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-border rounded-xl shadow-card z-20 py-1.5 max-h-72 overflow-y-auto">
          <button
            onClick={() => onChange([])}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold text-ink hover:bg-[#F0F7F6]"
          >
            All types {selected.length === 0 && <span>✓</span>}
          </button>
          <div className="border-t border-border my-1" />
          {options.map(o => (
            <label key={o} className="flex items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-[#F0F7F6] cursor-pointer">
              <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{o}</span>
            </label>
          ))}
        </div>
      )}
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
  const byVC = tax?.byVirtualCompany || []
  const monthlyTotal = tax?.monthlyTotal || { labels: [], data: [] }
  const labels = tax?.labels || monthlyTotal.labels || []

  const [fromIdx, setFromIdx] = useState(0)
  const toIdxDefault = Math.max(labels.length - 1, 0)
  const [toIdx, setToIdx] = useState(toIdxDefault)
  // Clamp once data actually arrives — the state above is created before `labels`
  // has a length, so a stale toIdx (e.g. 0) is corrected the first time real data lands.
  const rangeTo = Math.min(toIdx, toIdxDefault)
  const rangeFrom = Math.min(fromIdx, rangeTo)

  // Multi-select tax-type filter — empty array means "all types". Every section on the
  // page (KPI cards included) reads from the same filtered list, so picking one or more
  // types in the dropdown narrows everything at once.
  const [selectedTypes, setSelectedTypes] = useState([])
  const typeOptions = byType.map(t => t.type)

  const sumRange = (arr) => (arr || []).slice(rangeFrom, rangeTo + 1).reduce((s, v) => s + (v || 0), 0)

  const filteredTypeList = selectedTypes.length ? byType.filter(t => selectedTypes.includes(t.type)) : byType

  // Sums the selected types' monthly arrays together, element-wise — a no-op merge when
  // exactly one type (or none) is selected, so it doesn't need a special case.
  const mergeMonthly = (types) => {
    const arr = Array(labels.length).fill(0)
    types.forEach(t => (t.monthly?.data || []).forEach((v, i) => { arr[i] += v || 0 }))
    return { labels, data: arr }
  }
  const mergeByVC = (types) => {
    const map = {}
    types.forEach(t => (t.byVirtualCompany || []).forEach(v => {
      if (!map[v.vc]) map[v.vc] = Array(labels.length).fill(0)
      ;(v.monthly?.data || []).forEach((val, i) => { map[v.vc][i] += val || 0 })
    }))
    return Object.entries(map).map(([vc, data]) => ({ vc, monthly: { labels, data } }))
  }

  const filteredVCList = selectedTypes.length ? mergeByVC(filteredTypeList) : byVC
  const monthlyTotalSource = selectedTypes.length ? mergeMonthly(filteredTypeList) : monthlyTotal

  // Pie slices need a non-negative `size` for Recharts to compute arc angles from —
  // `amount` stays signed (net accrued vs. reversed) for the legend/tooltip text, but
  // feeding signed values into the Pie itself breaks its angle math and the ring never
  // draws at all (legend and center-total text still render since those are plain JS).
  const toRangeSlices = (list, keyName) => list
    .map(x => ({ [keyName]: x[keyName], amount: sumRange(x.monthly?.data) }))
    .filter(x => Math.abs(x.amount) > 0.0001)
    .map(x => ({ ...x, size: Math.abs(x.amount) }))
    .sort((a, b) => b.size - a.size)

  const rangeByType = useMemo(() => toRangeSlices(filteredTypeList, 'type'), [filteredTypeList, rangeFrom, rangeTo])
  const rangeByVC = useMemo(() => toRangeSlices(filteredVCList, 'vc'), [filteredVCList, rangeFrom, rangeTo])

  const monthlyData = (monthlyTotalSource.labels || [])
    .slice(rangeFrom, rangeTo + 1)
    .map((label, i) => ({ label, Tax: monthlyTotalSource.data[rangeFrom + i] || 0 }))

  const rangeTotal = rangeByType.reduce((s, t) => s + t.amount, 0)
  const vcTotal = rangeByVC.reduce((s, v) => s + v.amount, 0)
  const monthCols = labels.slice(rangeFrom, rangeTo + 1)
  const typeFilterLabel = selectedTypes.length === 1 ? selectedTypes[0] : selectedTypes.length > 1 ? `${selectedTypes.length} types` : ''

  const anyFilterActive = selectedTypes.length > 0 || rangeFrom !== 0 || rangeTo !== toIdxDefault
  const clearFilters = () => { setSelectedTypes([]); setFromIdx(0); setToIdx(toIdxDefault) }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-ink mb-0.5">Taxes Payable</h2>
        <p className="text-xs text-muted font-medium">
          {tax
            ? `Tax Payables (326) · live outstanding balance ETB ${fmtETB(tax.totalOutstanding)} as of ${tax.asOf}`
            : 'Monthly tax reporting · source: ERP'}
        </p>
      </div>

      {/* Filter bar — same layout as the HR page's filter bar: a white card of
          label-over-control filters, with a Clear filters button once any is active. */}
      {tax && byType.length > 0 && labels.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-4 shadow-card">
          <div className="flex flex-wrap gap-4 items-end">
            <TypeMultiSelect options={typeOptions} selected={selectedTypes} onChange={setSelectedTypes} />
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">From</span>
              <select
                value={rangeFrom}
                onChange={e => setFromIdx(Number(e.target.value))}
                className="text-xs font-bold text-ink border border-border rounded-lg px-3 py-2 outline-none"
              >
                {labels.map((l, i) => <option key={i} value={i} disabled={i > rangeTo}>{l}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">To</span>
              <select
                value={rangeTo}
                onChange={e => setToIdx(Number(e.target.value))}
                className="text-xs font-bold text-ink border border-border rounded-lg px-3 py-2 outline-none"
              >
                {labels.map((l, i) => <option key={i} value={i} disabled={i < rangeFrom}>{l}</option>)}
              </select>
            </div>
            {anyFilterActive && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 rounded-lg text-[11px] font-bold border border-border text-muted hover:text-ink hover:border-navy transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {!tax || byType.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-8">
          <div className="flex items-start gap-3 mb-5">
            <span className="text-lg" style={{ color: ORANGE }}>ⓘ</span>
            <div>
              <p className="text-sm font-bold text-ink mb-1">No tax data source yet</p>
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
                <li key={item} className="text-xs text-ink flex items-start gap-2">
                  <span className="text-muted mt-0.5">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <>
          {/* Tax accrued cards — total + one per selected type, scoped to both the date
              range and the Tax Type filter above, so this row (and everything below it)
              narrows down to whatever's picked in the filter bar. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total Tax Accrued"
              value={rangeTotal}
              sub={`${labels[rangeFrom]}–${labels[rangeTo]}${typeFilterLabel ? ` · ${typeFilterLabel}` : ' · all types'}`}
              accent={ORANGE}
            />
            {rangeByType.map((t, i) => (
              <StatCard
                key={t.type}
                label={t.type}
                value={t.amount}
                sub={t.amount < 0 ? 'Net reversed' : 'Net accrued'}
                accent={[NAVY, TEAL, DTEAL][i % 3]}
              />
            ))}
          </div>

          {/* Total Tax By Virtual Company + Tax Areas — both scoped to the selected range */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
              <h3 className="text-sm font-bold text-ink mb-1">Total Tax By Virtual Company</h3>
              <p className="text-[10px] text-muted mb-4 font-medium">
                Tax accrued, {labels[rangeFrom]}–{labels[rangeTo]}{typeFilterLabel ? ` · ${typeFilterLabel}` : ''}
              </p>
              {rangeByVC.length > 0 ? (
                <div className="flex items-center gap-6 flex-wrap">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={rangeByVC} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="size" nameKey="vc" paddingAngle={2}>
                        {rangeByVC.map((_, i) => <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [`ETB ${fmtETB(Math.abs(v))}`, n]} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E6E9EC' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 flex-1 min-w-[140px]">
                    {rangeByVC.map((v, i) => {
                      const pct = vcTotal ? (Math.abs(v.amount) / rangeByVC.reduce((s, x) => s + Math.abs(x.amount), 0) * 100) : 0
                      return (
                        <div key={v.vc} className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                          <span className="text-xs font-semibold text-ink flex-1 truncate">{v.vc}</span>
                          <span className="text-[10px] text-muted">{pct.toFixed(1)}%</span>
                          <span className="text-xs font-bold text-ink">ETB {fmtETB(Math.abs(v.amount))}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : <p className="text-xs text-muted py-8 text-center">No tax activity in this range</p>}
            </div>

            <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
              <h3 className="text-sm font-bold text-ink mb-1">Tax Areas</h3>
              <p className="text-[10px] text-muted mb-4 font-medium">
                {typeFilterLabel ? `${typeFilterLabel}, ` : 'Tax accrued by type, '}{labels[rangeFrom]}–{labels[rangeTo]}
              </p>
              {rangeByType.length > 0 ? (
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="relative flex-shrink-0" style={{ width: 180, height: 180 }}>
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie data={rangeByType} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="size" nameKey="type" paddingAngle={2}>
                          {rangeByType.map((_, i) => <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [`ETB ${fmtETB(Math.abs(v))}`, n]} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E6E9EC' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-lg font-black text-ink">{rangeTotal < 0 ? '-' : ''}{fmtETB(Math.abs(rangeTotal))}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-[140px]">
                    {rangeByType.map((t, i) => {
                      const sumAbs = rangeByType.reduce((s, x) => s + Math.abs(x.amount), 0)
                      const pct = sumAbs ? (Math.abs(t.amount) / sumAbs * 100) : 0
                      return (
                        <div key={t.type} className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                          <span className="text-xs font-semibold text-ink flex-1 truncate">{t.type}</span>
                          <span className="text-[10px] text-muted">{pct.toFixed(1)}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : <p className="text-xs text-muted py-8 text-center">No tax activity in this range</p>}
            </div>
          </div>

          {/* Monthly trend — total tax accrued (net change) per month */}
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-ink mb-1">Monthly Tax Accrued (ETB)</h3>
            <p className="text-[10px] text-muted mb-4 font-medium">
              Net change {typeFilterLabel ? `for ${typeFilterLabel}` : 'across all Tax Payables accounts'}, {labels[rangeFrom]}–{labels[rangeTo]} — positive means tax accrued that month
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EC" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7780' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmtETB(v)} tick={{ fontSize: 10, fill: '#6B7780' }} axisLine={false} tickLine={false} width={46} />
                <Tooltip formatter={v => [`ETB ${fmtETB(v, 2)}`, 'Tax Accrued']} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E6E9EC' }} />
                <Bar dataKey="Tax" radius={[3, 3, 0, 0]} maxBarSize={28}>
                  {monthlyData.map((d, i) => (
                    <Cell key={i} fill={d.Tax < 0 ? RED : TEAL} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By tax type — accrued-in-range bars */}
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-ink mb-1">Accrued by Type</h3>
            <p className="text-[10px] text-muted mb-4 font-medium">
              Tax accrued, {labels[rangeFrom]}–{labels[rangeTo]}{typeFilterLabel ? ` · ${typeFilterLabel}` : ''}
            </p>
            <div className="space-y-3">
              {rangeByType.map(t => {
                const pct = (t.size / Math.max(...rangeByType.map(x => x.size), 1)) * 100
                const neg = t.amount < 0
                return (
                  <div key={t.type}>
                    <div className="flex justify-between items-baseline mb-1 gap-2">
                      <span className="text-xs font-bold text-ink truncate">{t.type}</span>
                      <span className="text-xs font-extrabold flex-shrink-0" style={{ color: neg ? RED : 'var(--tbl-fg)' }}>
                        {neg ? '-' : ''}ETB {fmtETB(t.size)}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#F7F9FA' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: neg ? RED : TEAL }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Description × Month pivot — matches the ERP tax report layout */}
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card overflow-x-auto">
            <h3 className="text-sm font-bold text-ink mb-1">Monthly Detail by Type</h3>
            <p className="text-[10px] text-muted mb-4 font-medium">
              Monthly breakdown, {labels[rangeFrom]}–{labels[rangeTo]}{typeFilterLabel ? ` · ${typeFilterLabel}` : ''}
            </p>
            <table className="w-full text-xs border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-extrabold text-muted uppercase tracking-wider text-[10px] py-2 pr-3">Description</th>
                  {monthCols.map(m => (
                    <th key={m} className="text-right font-extrabold text-muted uppercase tracking-wider text-[10px] py-2 px-2">{m}</th>
                  ))}
                  <th className="text-right font-extrabold text-muted uppercase tracking-wider text-[10px] py-2 pl-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredTypeList.map(t => {
                  const rowTotal = sumRange(t.monthly?.data)
                  return (
                    <tr key={t.type} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-semibold text-ink whitespace-nowrap">{t.type}</td>
                      {monthCols.map((m, ci) => {
                        const v = t.monthly?.data?.[rangeFrom + ci] || 0
                        return (
                          <td key={m} className="text-right py-2 px-2 font-medium" style={{ color: v < 0 ? RED : 'var(--tbl-fg)' }}>
                            {v ? fmtETB(v, 2) : '—'}
                          </td>
                        )
                      })}
                      <td className="text-right py-2 pl-2 font-extrabold" style={{ color: rowTotal < 0 ? RED : 'var(--tbl-fg)' }}>
                        {fmtETB(rowTotal, 2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2" style={{ borderColor: NAVY }}>
                  <td className="py-2 pr-3 font-black text-ink">Total</td>
                  {monthCols.map((m, ci) => {
                    const v = filteredTypeList.reduce((s, t) => s + (t.monthly?.data?.[rangeFrom + ci] || 0), 0)
                    return (
                      <td key={m} className="text-right py-2 px-2 font-black" style={{ color: v < 0 ? RED : 'var(--tbl-fg)' }}>
                        {fmtETB(v, 2)}
                      </td>
                    )
                  })}
                  <td className="text-right py-2 pl-2 font-black" style={{ color: rangeTotal < 0 ? RED : 'var(--tbl-fg)' }}>
                    {fmtETB(rangeTotal, 2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
