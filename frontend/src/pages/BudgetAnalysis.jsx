import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { budget as budgetApi } from '../lib/api.js'
import { aggregateByPeriod } from '../lib/period.js'
import PeriodToggle from '../components/PeriodToggle.jsx'

const NAVY   = '#02404F'
const ORANGE = '#EB7D23'
const GREEN  = '#2EBD85'
const RED    = '#E5544B'
const TEAL   = '#1FB6A6'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'bybu',     label: 'By Business Unit' },
  { id: 'monthly',  label: 'Monthly Trend' },
  { id: 'opex',     label: 'OPEX Breakdown' },
  { id: 'matrix',   label: 'Budget Matrix' },
]

const fmtM   = v => v == null ? '—' : `${v.toFixed(1)}M`
const fmtPct = v => v == null ? '—' : `${v.toFixed(1)}%`
const fmtAmt = v => {
  if (!v) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return v.toFixed(0)
}

// Convert raw API budget data to the shape the existing 4 tabs expect
function adaptApiData(apiData) {
  if (!apiData) return null
  const toM = v => Math.round(v / 1e6 * 10) / 10
  return {
    budgetName:  apiData.budgetName,
    totalBudget: toM(apiData.totals.total),
    actualYTD:   null,
    monthly: {
      labels: apiData.months,
      budget: apiData.totals.monthly.map(toM),
      actual: Array(12).fill(0),
    },
    byBU: apiData.byBU.map(bu => ({
      unit:        bu.unit,
      budgetYTD:   toM(bu.total),
      actualYTD:   null,
      varianceYTD: null,
      varPct:      null,
      utilPct:     null,
      monthly:     bu.monthly.map(v => ({ bud: toM(v), act: 0 })),
    })),
    byAccount: apiData.byCategory.map(c => ({
      code:      c.code,
      name:      c.name,
      budgetYTD: toM(c.total),
      actualYTD: null,
      utilPct:   null,
      monthly:   c.monthly.map(v => ({ bud: toM(v), act: 0 })),
    })),
  }
}

// ── Shared sub-components ────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-border">
      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black" style={{ color: color || '#FFFFFF' }}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function UtilBar({ pct }) {
  const clamped = Math.min(Math.max(pct || 0, 0), 150)
  const color   = clamped > 100 ? RED : clamped > 80 ? ORANGE : GREEN
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(clamped, 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-14 text-right" style={{ color }}>{fmtPct(pct)}</span>
    </div>
  )
}

// ── Tab components ───────────────────────────────────────────────────────────

function OverviewTab({ cb, buLabel }) {
  const [period, setPeriod] = useState('monthly')
  const monthlyData = cb.monthly.labels.map((label, i) => ({
    label,
    Budget: cb.monthly.budget[i] || 0,
    Actual: cb.monthly.actual[i] || 0,
  }))
  const chartData = aggregateByPeriod(monthlyData, period)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <p className="text-xs font-extrabold text-muted uppercase tracking-wider">
            Budget vs Actual — {period === 'monthly' ? 'Monthly' : period === 'quarterly' ? 'Quarterly' : 'Annual'}
          </p>
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} unit="M" />
            <Tooltip formatter={v => [`${v}M`, '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Budget" fill={`${NAVY}40`} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Actual" fill={ORANGE}       radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-border p-4">
        <p className="text-xs font-extrabold text-muted uppercase tracking-wider mb-3">
          Top BU Budget YTD
        </p>
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 220 }}>
          {cb.byBU.slice(0, 12).map(r => (
            <div key={r.unit}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-navy font-semibold truncate max-w-[160px]">{buLabel(r.unit)}</span>
                <span className="text-muted">
                  {r.utilPct != null
                    ? `${fmtM(r.actualYTD)} / ${fmtM(r.budgetYTD)}`
                    : fmtM(r.budgetYTD)}
                </span>
              </div>
              {r.utilPct != null
                ? <UtilBar pct={r.utilPct} />
                : (
                  <div className="h-1.5 bg-bg rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-navy/30" style={{ width: '100%' }} />
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Hover popover — expense category breakdown for one department (rentals,
// consultancy, utilities, etc.), per the "hover to see the detail" requirement.
function CategoryHoverDetail({ categories }) {
  if (!categories || categories.length === 0) return null
  return (
    <div
      className="absolute left-0 top-full mt-1 bg-white rounded-xl border border-border shadow-xl overflow-hidden"
      style={{ zIndex: 50, width: 320 }}
    >
      <div className="px-3 py-2 border-b border-border bg-bg">
        <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Expense Category Breakdown</p>
      </div>
      <div className="max-h-56 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-1.5 font-bold text-muted">Category</th>
              <th className="text-right px-2 py-1.5 font-bold text-muted">Budget</th>
              <th className="text-right px-2 py-1.5 font-bold text-muted">Actual</th>
              <th className="text-right px-3 py-1.5 font-bold text-muted">Util %</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={c.code} className={i % 2 === 0 ? 'bg-white' : 'bg-bg/50'}>
                <td className="px-3 py-1.5 font-semibold text-navy">{c.name}</td>
                <td className="px-2 py-1.5 text-right text-muted">{fmtM(c.budgetYTD)}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-navy">{fmtM(c.actualYTD)}</td>
                <td className="px-3 py-1.5 text-right font-bold"
                  style={{ color: (c.utilPct || 0) > 100 ? RED : (c.utilPct || 0) > 80 ? ORANGE : GREEN }}>
                  {fmtPct(c.utilPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ByBUTab({ cb, buLabel }) {
  const [sort, setSort] = useState('budgetYTD')
  const [hoverUnit, setHoverUnit] = useState(null)
  const sorted = [...cb.byBU].sort((a, b) => (b[sort] || 0) - (a[sort] || 0))
  const hasActuals = cb.byBU.some(r => r.actualYTD != null)

  const cols = [
    { key: 'budgetYTD',   label: 'Budget (Annual)' },
    ...(hasActuals ? [
      { key: 'actualYTD',   label: 'Actual YTD' },
      { key: 'varianceYTD', label: 'Variance' },
      { key: 'varPct',      label: 'Var %' },
      { key: 'utilPct',     label: 'Utilization %' },
    ] : []),
  ]

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">
                Business Unit
              </th>
              {cols.map(c => (
                <th
                  key={c.key}
                  className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider cursor-pointer hover:text-navy transition-colors"
                  onClick={() => setSort(c.key)}
                  style={sort === c.key ? { color: '#FFFFFF' } : {}}
                >
                  {c.label} {sort === c.key ? '↓' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const over = (r.utilPct || 0) > 100
              const hasCategories = r.categories && r.categories.length > 0
              return (
                <tr key={r.unit} className={i % 2 === 0 ? 'bg-white' : 'bg-bg/50'}>
                  <td
                    className={`relative px-4 py-2 font-semibold text-navy ${hasCategories ? 'cursor-help' : ''}`}
                    onMouseEnter={() => hasCategories && setHoverUnit(r.unit)}
                    onMouseLeave={() => setHoverUnit(null)}
                  >
                    {buLabel(r.unit)}
                    {hasCategories && <span className="ml-1 text-[9px] text-muted" title="Hover for expense category breakdown">ⓘ</span>}
                    {hoverUnit === r.unit && <CategoryHoverDetail categories={r.categories} />}
                  </td>
                  <td className="px-4 py-2 text-right text-muted">{fmtM(r.budgetYTD)}</td>
                  {hasActuals && <>
                    <td className="px-4 py-2 text-right font-semibold text-navy">{fmtM(r.actualYTD)}</td>
                    <td className="px-4 py-2 text-right" style={{ color: (r.varianceYTD || 0) >= 0 ? GREEN : RED }}>
                      {fmtM(r.varianceYTD)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted">{fmtPct(r.varPct)}</td>
                    <td className="px-4 py-2 text-right font-bold" style={{ color: over ? RED : '#FFFFFF' }}>
                      {fmtPct(r.utilPct)}
                    </td>
                  </>}
                </tr>
              )
            })}
            {/* Total row */}
            {(() => {
              const totBud = cb.byBU.reduce((s, r) => s + (r.budgetYTD || 0), 0)
              const totAct = cb.byBU.reduce((s, r) => s + (r.actualYTD || 0), 0)
              const totVar = totBud - totAct
              return (
                <tr className="border-t-2 border-border font-extrabold bg-bg">
                  <td className="px-4 py-2 text-navy">Total</td>
                  <td className="px-4 py-2 text-right text-muted">{fmtM(totBud)}</td>
                  {hasActuals && <>
                    <td className="px-4 py-2 text-right text-navy">{fmtM(totAct)}</td>
                    <td className="px-4 py-2 text-right" style={{ color: totVar >= 0 ? GREEN : RED }}>{fmtM(totVar)}</td>
                    <td className="px-4 py-2 text-right text-muted">{fmtPct(totBud ? (totVar / totBud * 100) : null)}</td>
                    <td className="px-4 py-2 text-right text-navy">
                      {fmtPct(totBud ? (totAct / totBud * 100) : null)}
                    </td>
                  </>}
                </tr>
              )
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MonthlyTab({ cb, buLabel }) {
  const [selectedBU, setSelectedBU] = useState('__all__')
  const [period, setPeriod] = useState('monthly')

  const buList = [{ unit: '__all__', label: 'All Business Units' }, ...cb.byBU.map(r => ({ unit: r.unit, label: buLabel(r.unit) }))]

  let monthlyData
  if (selectedBU === '__all__') {
    monthlyData = cb.monthly.labels.map((label, i) => ({
      label,
      Budget: cb.monthly.budget[i] || 0,
      Actual: cb.monthly.actual[i] || 0,
    }))
  } else {
    const bu = cb.byBU.find(r => r.unit === selectedBU)
    monthlyData = (bu?.monthly || []).map((m, i) => ({
      label:  cb.monthly.labels[i] || `M${i + 1}`,
      Budget: m.bud || 0,
      Actual: m.act || 0,
    }))
  }
  const chartData = aggregateByPeriod(monthlyData, period)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-extrabold text-muted uppercase tracking-wider">Business Unit:</label>
        <select
          value={selectedBU}
          onChange={e => setSelectedBU(e.target.value)}
          className="text-xs font-semibold border border-border rounded-xl px-3 py-1.5 bg-bg text-navy outline-none focus:border-navy"
        >
          {buList.map(b => (
            <option key={b.unit} value={b.unit}>{b.label}</option>
          ))}
        </select>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      <div className="bg-white rounded-2xl border border-border p-4">
        <p className="text-xs font-extrabold text-muted uppercase tracking-wider mb-3">
          Budget vs Actual — {selectedBU === '__all__' ? 'All Business Units' : buLabel(selectedBU)}
          {period !== 'monthly' && ` · ${period === 'quarterly' ? 'Quarterly' : 'Annual'}`}
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} unit="M" />
            <Tooltip formatter={v => [`${v}M`, '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Budget" fill={`${NAVY}40`} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Actual" fill={ORANGE}       radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function OpexTab({ cb }) {
  const [selectedAcct, setSelectedAcct] = useState('__all__')

  const acctList = [
    { code: '__all__', name: 'All OPEX Categories' },
    ...cb.byAccount.map(r => ({ code: r.code, name: `${r.code} - ${r.name}` }))
  ]

  let chartData
  if (selectedAcct === '__all__') {
    chartData = cb.byAccount.map(r => ({
      label:  `${r.code}`,
      name:   r.name,
      Budget: r.budgetYTD || 0,
      Actual: r.actualYTD || 0,
    }))
  } else {
    const acct = cb.byAccount.find(r => r.code === selectedAcct)
    chartData = (acct?.monthly || []).map((m, i) => ({
      label:  cb.monthly.labels[i] || `M${i + 1}`,
      Budget: m.bud || 0,
      Actual: m.act || 0,
    }))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-xs font-extrabold text-muted uppercase tracking-wider">Account:</label>
        <select
          value={selectedAcct}
          onChange={e => setSelectedAcct(e.target.value)}
          className="text-xs font-semibold border border-border rounded-xl px-3 py-1.5 bg-bg text-navy outline-none focus:border-navy"
        >
          {acctList.map(a => (
            <option key={a.code} value={a.code}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs font-extrabold text-muted uppercase tracking-wider mb-3">
            {selectedAcct === '__all__' ? 'Budget vs Actual by Account' : 'Monthly Trend'}
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} layout={selectedAcct === '__all__' ? 'vertical' : 'horizontal'}
              margin={{ top: 0, right: 8, bottom: 0, left: selectedAcct === '__all__' ? 30 : -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2"
                horizontal={selectedAcct !== '__all__'} vertical={selectedAcct === '__all__'} />
              {selectedAcct === '__all__' ? (
                <>
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} unit="M" />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={30} />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} unit="M" />
                </>
              )}
              <Tooltip formatter={v => [`${v}M`, '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Budget" fill={`${NAVY}40`} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Actual" fill={ORANGE}       radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-bg">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">OPEX Budget</p>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 font-bold text-muted">Category</th>
                  <th className="text-right px-3 py-2 font-bold text-muted">Budget</th>
                  <th className="text-right px-3 py-2 font-bold text-muted">Actual</th>
                  <th className="text-right px-3 py-2 font-bold text-muted">Util %</th>
                </tr>
              </thead>
              <tbody>
                {cb.byAccount.map((r, i) => (
                  <tr
                    key={r.code}
                    className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-bg/50'} ${selectedAcct === r.code ? 'ring-1 ring-inset ring-navy/20' : 'hover:bg-bg'}`}
                    onClick={() => setSelectedAcct(selectedAcct === r.code ? '__all__' : r.code)}
                  >
                    <td className="px-4 py-2 font-semibold text-navy">
                      <span className="text-muted mr-1">{r.code}</span>{r.name}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">{fmtM(r.budgetYTD)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-navy">{fmtM(r.actualYTD)}</td>
                    <td className="px-3 py-2 text-right font-bold"
                      style={{ color: (r.utilPct || 0) > 100 ? RED : (r.utilPct || 0) > 80 ? ORANGE : GREEN }}>
                      {fmtPct(r.utilPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function BudgetMatrixTab({ apiData, loading, error, buLabel }) {
  const [buFilter, setBuFilter] = useState('__all__')

  // Reset BU filter when budget changes
  useEffect(() => { setBuFilter('__all__') }, [apiData?.budgetName])

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 rounded-full border-4 border-border border-t-gold animate-spin" />
        <p className="text-muted text-xs">Loading budget matrix…</p>
      </div>
    </div>
  )
  if (error) return (
    <div className="flex items-center justify-center h-48">
      <p className="text-xs" style={{ color: RED }}>{error}</p>
    </div>
  )
  if (!apiData) return null

  const getMonthly = acct =>
    buFilter === '__all__' ? acct.monthly : (acct.byBU[buFilter] || Array(12).fill(0))

  const filteredAccounts = apiData.accounts.filter(a => getMonthly(a).some(v => v !== 0))

  const totals = Array(12).fill(0)
  filteredAccounts.forEach(a => getMonthly(a).forEach((v, i) => { totals[i] += v }))
  const grandTotal = totals.reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-extrabold text-muted uppercase tracking-wider">Business Unit:</label>
        <select
          value={buFilter}
          onChange={e => setBuFilter(e.target.value)}
          className="text-xs font-semibold border border-border rounded-xl px-3 py-1.5 bg-bg text-navy outline-none focus:border-navy"
        >
          <option value="__all__">All Business Units</option>
          {apiData.BUs.map(bu => <option key={bu} value={bu}>{buLabel(bu)}</option>)}
        </select>
        <span className="text-xs text-muted ml-auto">{filteredAccounts.length} accounts · {fmtAmt(grandTotal)} total</span>
      </div>

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 1000 }}>
            <thead>
              <tr style={{ background: NAVY, color: '#fff' }}>
                <th className="text-left px-3 py-2.5 font-bold" style={{ minWidth: 240, position: 'sticky', left: 0, background: NAVY, zIndex: 2 }}>
                  Account
                </th>
                <th className="text-right px-3 py-2.5 font-bold" style={{ minWidth: 90 }}>Total</th>
                {apiData.months.map(m => (
                  <th key={m} className="text-right px-2 py-2.5 font-bold" style={{ minWidth: 68 }}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((acct, i) => {
                const monthly   = getMonthly(acct)
                const rowTotal  = monthly.reduce((s, v) => s + v, 0)
                return (
                  <tr key={acct.accountNo} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC' }}>
                    <td
                      className="px-3 py-1.5"
                      style={{ position: 'sticky', left: 0, background: i % 2 === 0 ? '#fff' : '#F8FAFC', zIndex: 1 }}
                    >
                      <span className="font-semibold block" style={{ color: NAVY }}>{acct.name || acct.accountNo}</span>
                      <span className="font-mono text-[10px]" style={{ color: '#9BAAB8' }}>{acct.accountNo}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold" style={{ color: NAVY }}>{fmtAmt(rowTotal)}</td>
                    {monthly.map((v, mi) => (
                      <td key={mi} className="px-2 py-1.5 text-right" style={{ color: v ? '#4B5563' : '#C8D1DC' }}>
                        {fmtAmt(v)}
                      </td>
                    ))}
                  </tr>
                )
              })}
              <tr style={{ borderTop: `2px solid ${NAVY}30`, background: '#EDF1F5', fontWeight: 800 }}>
                <td className="px-3 py-2" style={{ color: NAVY, position: 'sticky', left: 0, background: '#EDF1F5' }}>Total</td>
                <td className="px-3 py-2 text-right" style={{ color: NAVY }}>{fmtAmt(grandTotal)}</td>
                {totals.map((v, mi) => (
                  <td key={mi} className="px-2 py-2 text-right" style={{ color: NAVY }}>{fmtAmt(v)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BudgetAnalysis({ data }) {
  const [tab, setTab]               = useState('overview')
  const [budgetNames, setBudgetNames] = useState([])
  const [selectedBudget, setSelectedBudget] = useState(
    data?.corporateBudget?.budgetName || '20.1'
  )
  const [apiData, setApiData]       = useState(null)
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError]     = useState(null)

  // Load available budget names on mount
  useEffect(() => {
    budgetApi.names()
      .then(r => r.ok ? r.json() : [])
      .then(names => { if (names.length) setBudgetNames(names) })
      .catch(() => {})
  }, [])

  // Fetch budget data whenever selection changes
  useEffect(() => {
    setApiLoading(true)
    setApiError(null)
    budgetApi.data(selectedBudget)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error || 'Failed')))
      .then(setApiData)
      .catch(e => setApiError(typeof e === 'string' ? e : 'Failed to load budget data'))
      .finally(() => setApiLoading(false))
  }, [selectedBudget])

  // For the 4 existing tabs: prefer snapshot data (has actuals); fall back to adapted API data
  const snapshotCb = data?.corporateBudget
  const cb = useMemo(() => {
    if (snapshotCb && snapshotCb.budgetName === selectedBudget) return snapshotCb
    return adaptApiData(apiData)
  }, [snapshotCb, apiData, selectedBudget])

  const buNames  = apiData?.buNames || {}
  const buLabel  = code => buNames[code] || code

  const hasActuals  = cb?.actualYTD != null
  const utilPct     = cb?.totalBudget ? ((cb.actualYTD || 0) / cb.totalBudget * 100) : null
  const variance    = (cb?.totalBudget || 0) - (cb?.actualYTD || 0)

  const isTabLoading = apiLoading && tab !== 'matrix'  // matrix manages its own state

  return (
    <div className="space-y-4">
      {/* Header row: title + budget selector + tabs */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy">Corporate Budget Analysis</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-muted">Budget:</p>
            <select
              value={selectedBudget}
              onChange={e => setSelectedBudget(e.target.value)}
              className="text-xs font-bold border border-border rounded-lg px-2.5 py-1 bg-bg text-navy outline-none focus:border-navy"
            >
              {budgetNames.length
                ? budgetNames.map(b => (
                    <option key={b.name} value={b.name}>
                      {b.name}{b.description ? ` – ${b.description}` : ''}
                    </option>
                  ))
                : <option value={selectedBudget}>{selectedBudget}</option>}
            </select>
            {apiLoading && (
              <div className="w-3.5 h-3.5 rounded-full border-2 border-border border-t-orange-400 animate-spin" />
            )}
          </div>
        </div>

        <div className="flex gap-0.5 bg-bg rounded-xl p-1 border border-border flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
              style={tab === t.id ? { background: NAVY, color: '#fff' } : { color: '#6B7C93' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      {cb && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Total Budget" value={fmtM(cb.totalBudget)} sub={`Budget ${selectedBudget}`} />
          {hasActuals ? (
            <>
              <KpiCard label="Actual YTD" value={fmtM(cb.actualYTD)} sub="OPEX expenses" color={ORANGE} />
              <KpiCard
                label="Variance"
                value={fmtM(variance)}
                sub="Budget remaining"
                color={variance >= 0 ? GREEN : RED}
              />
              <KpiCard
                label="Utilization YTD"
                value={fmtPct(utilPct)}
                sub="vs annual budget"
                color={(utilPct || 0) > 100 ? RED : (utilPct || 0) > 80 ? ORANGE : TEAL}
              />
            </>
          ) : (
            <>
              <KpiCard label="Monthly Average" value={fmtM(cb.totalBudget ? +(cb.totalBudget / 12).toFixed(1) : null)} sub="ETB millions" />
              <KpiCard label="Business Units"  value={cb.byBU?.length ?? '—'} sub="With budget allocations" />
              <KpiCard label="Account Categories" value={cb.byAccount?.length ?? '—'} sub="OPEX categories" />
            </>
          )}
        </div>
      )}

      {/* Tab content */}
      {tab === 'matrix' ? (
        <BudgetMatrixTab apiData={apiData} loading={apiLoading} error={apiError} buLabel={buLabel} />
      ) : isTabLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 rounded-full border-4 border-border border-t-gold animate-spin" />
            <p className="text-muted text-xs">Loading budget data…</p>
          </div>
        </div>
      ) : !cb ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-muted text-sm">No budget data — sync required or BC unavailable.</p>
        </div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab cb={cb} buLabel={buLabel} />}
          {tab === 'bybu'     && <ByBUTab     cb={cb} buLabel={buLabel} />}
          {tab === 'monthly'  && <MonthlyTab  cb={cb} buLabel={buLabel} />}
          {tab === 'opex'     && <OpexTab     cb={cb} />}
        </>
      )}
    </div>
  )
}
