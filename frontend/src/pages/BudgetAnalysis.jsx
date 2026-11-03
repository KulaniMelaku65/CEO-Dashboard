import { useState, useEffect, useMemo, Fragment } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { budget as budgetApi } from '../lib/api.js'
import { aggregateByPeriod } from '../lib/period.js'
import PeriodToggle from '../components/PeriodToggle.jsx'
import { PeriodTree, usePeriodSelection } from '../components/PeriodFilterBar.jsx'
import GLDrilldownPanel from '../components/GLDrilldownPanel.jsx'

const NAVY   = '#02404F'
const ORANGE = '#EB7D23'
const GREEN  = '#2EBD85'
const RED    = '#E5544B'
const TEAL   = '#1FB6A6'

// Same dark-theme section/zebra-stripe palette as HR Analysis's own tables
// (HRPageReview.jsx) and SAFEE Budget Analysis — keeps this page's drill-down tables
// visually consistent with the rest of the app instead of a one-off hover/white style.
const ROW_BG = { even: '#0A3A46', odd: '#0E434D' }
const SEC_BG = { open: '#123C46', closed: '#0C3841' }

// Rolls this page's own section-level Business Unit rows (e.g. "MSP-001") up under the
// SAME parent Business Unit grouping HR Analysis uses (hr.sectionToDept/deptDisplayNames
// in the snapshot — the BC "BUS UNIT & DEPART" dimension's Begin-Total/section
// hierarchy), so "Business Unit" means the same 7-or-so parent units everywhere in the
// app instead of this page's own flat list of ~40 section codes.
function groupByParentBU(byBU, sectionToDept, deptDisplayNames, buLabel) {
  const groups = {}
  byBU.forEach(r => {
    const parentCode = sectionToDept[r.unit] || r.unit
    const parentName = deptDisplayNames[parentCode] || buLabel(parentCode)
    const g = groups[parentCode] || (groups[parentCode] = {
      code: parentCode, name: parentName, children: [],
      budgetYTD: 0, actualYTD: 0, hasActuals: false
    })
    g.children.push(r)
    g.budgetYTD += r.budgetYTD || 0
    if (r.actualYTD != null) { g.hasActuals = true; g.actualYTD += r.actualYTD || 0 }
  })
  return Object.values(groups).map(g => {
    const varianceYTD = g.hasActuals ? g.budgetYTD - g.actualYTD : null
    return {
      ...g,
      actualYTD: g.hasActuals ? g.actualYTD : null,
      varianceYTD,
      varPct:  g.hasActuals && g.budgetYTD ? +(varianceYTD / g.budgetYTD * 100).toFixed(1) : null,
      utilPct: g.hasActuals && g.budgetYTD ? +(g.actualYTD / g.budgetYTD * 100).toFixed(1) : null,
      children: [...g.children].sort((a, b) => (b.budgetYTD || 0) - (a.budgetYTD || 0)),
    }
  }).sort((a, b) => (b.budgetYTD || 0) - (a.budgetYTD || 0))
}

// Dynamically imports xlsx only when Export is actually clicked, same pattern as
// GLDrilldownPanel.jsx, so the ~700KB library never loads as part of this page's
// normal bundle.
async function exportRowsToExcel(filename, sheetName, rows) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

function ExportButton({ onExport, label }) {
  const [exporting, setExporting] = useState(false)
  return (
    <button
      onClick={async () => { setExporting(true); try { await onExport() } finally { setExporting(false) } }}
      disabled={exporting}
      className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-navy hover:bg-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
    >
      {exporting ? 'Exporting…' : (label || '⬇ Export Excel')}
    </button>
  )
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'bybu',     label: 'By Business Unit' },
  { id: 'monthly',  label: 'Monthly Trend' },
  { id: 'opex',     label: 'OPEX Breakdown' },
  { id: 'matrix',   label: 'Budget Matrix' },
]

// Scale-appropriate formatting for a raw ETB amount — M above 1M, K above 1K,
// the exact figure (with thousands separators) below that. Replaces the old flat
// "always 1-decimal-millions" fmtM, which rounded anything under ~100K ETB down to a
// misleading "0.0M" — a department whose real spend was e.g. 42,000 ETB (well short of
// 0.1M) looked indistinguishable from one that spent nothing at all.
const fmtM = v => {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return Math.round(v).toLocaleString('en-US')
}
const fmtPct = v => v == null ? '—' : `${v.toFixed(1)}%`
const fmtAmt = fmtM

// Convert raw API budget data to the shape the existing 4 tabs expect — apiData
// amounts are already raw, unscaled ETB (routes/bc.js never divides/rounds them), so
// this just reshapes the payload rather than converting units.
function adaptApiData(apiData) {
  if (!apiData) return null
  return {
    budgetName:  apiData.budgetName,
    totalBudget: apiData.totals.total,
    actualYTD:   null,
    monthly: {
      labels: apiData.months,
      budget: apiData.totals.monthly,
      actual: Array(12).fill(0),
    },
    byBU: apiData.byBU.map(bu => ({
      unit:        bu.unit,
      budgetYTD:   bu.total,
      actualYTD:   null,
      varianceYTD: null,
      varPct:      null,
      utilPct:     null,
      monthly:     bu.monthly.map(v => ({ bud: v, act: 0 })),
    })),
    byAccount: apiData.byCategory.map(c => ({
      code:      c.code,
      name:      c.name,
      budgetYTD: c.total,
      actualYTD: null,
      utilPct:   null,
      monthly:   c.monthly.map(v => ({ bud: v, act: 0 })),
    })),
  }
}

// Re-derives totalBudget/actualYTD (top-level, byBU, byAccount) from each row's
// already-present `.monthly` (per-month {bud, act}) series, scoped to `selMonths`
// ([] = YTD/all, matching every other Filter by Period page) — same role
// BusinessLinePL's computeForMonths plays for business-line P&L. `categories`
// (the per-BU expense-category hover breakdown) has no monthly series from the
// backend, so it's left as YTD-only regardless of the period filter.
function applyPeriodFilter(cb, selMonths) {
  if (!cb || !selMonths.length) return cb
  const sumSel = arr => selMonths.reduce((s, i) => s + (arr[i] || 0), 0)
  const hasActuals = cb.actualYTD != null

  const totalBudget = sumSel(cb.monthly.budget)
  const actualYTD   = hasActuals ? sumSel(cb.monthly.actual) : null

  const byBU = cb.byBU.map(r => {
    const budgetYTD   = sumSel(r.monthly.map(m => m.bud))
    const act         = hasActuals ? sumSel(r.monthly.map(m => m.act)) : null
    const varianceYTD = hasActuals ? budgetYTD - act : null
    return {
      ...r, budgetYTD, actualYTD: act, varianceYTD,
      varPct:  hasActuals && budgetYTD ? +(varianceYTD / budgetYTD * 100).toFixed(1) : null,
      utilPct: hasActuals && budgetYTD ? +(act / budgetYTD * 100).toFixed(1) : null,
    }
  })

  const byAccount = cb.byAccount.map(r => {
    const budgetYTD = sumSel(r.monthly.map(m => m.bud))
    const act       = hasActuals ? sumSel(r.monthly.map(m => m.act)) : null
    return {
      ...r, budgetYTD, actualYTD: act,
      utilPct: hasActuals && budgetYTD ? +(act / budgetYTD * 100).toFixed(1) : null,
    }
  })

  return { ...cb, totalBudget, actualYTD, byBU, byAccount }
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

function OverviewTab({ cb, buLabel, periodLabel, sectionToDept, deptDisplayNames }) {
  const [period, setPeriod] = useState('monthly')
  const [expanded, setExpanded] = useState({})
  const monthlyData = cb.monthly.labels.map((label, i) => ({
    label,
    Budget: cb.monthly.budget[i] || 0,
    Actual: cb.monthly.actual[i] || 0,
  }))
  const chartData = aggregateByPeriod(monthlyData, period)

  // Same parent Business Unit grouping as HR Analysis / By Business Unit tab, so "Top
  // BU Budget" means the same business units everywhere on this page.
  const groups = useMemo(
    () => groupByParentBU(cb.byBU, sectionToDept, deptDisplayNames, buLabel),
    [cb.byBU, sectionToDept, deptDisplayNames] // eslint-disable-line react-hooks/exhaustive-deps
  )

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
            <YAxis tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} tickFormatter={fmtM} />
            <Tooltip formatter={v => [fmtM(v), '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} labelStyle={{ color: '#02404F', fontWeight: 700 }} itemStyle={{ color: '#02404F' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
            <Bar dataKey="Budget" fill={TEAL} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Actual" fill={ORANGE}       radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-border p-4">
        <p className="text-xs font-extrabold text-muted uppercase tracking-wider mb-3">
          Top BU Budget{periodLabel ? ` — ${periodLabel}` : ' YTD'}
        </p>
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 260 }}>
          {groups.map(r => {
            const isOpen = !!expanded[r.code]
            return (
              <div key={r.code}>
                <div
                  className="flex justify-between text-xs mb-0.5 cursor-pointer select-none"
                  onClick={() => setExpanded(p => ({ ...p, [r.code]: !p[r.code] }))}
                >
                  <span className="text-navy font-semibold truncate max-w-[160px] flex items-center gap-1">
                    <span className="inline-block w-2.5 text-muted transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
                    {r.name}
                  </span>
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
                {isOpen && (
                  <div className="mt-1.5 mb-1 pl-4 space-y-1.5 border-l border-border/60">
                    {r.children.map(c => (
                      <div key={c.unit}>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="text-muted truncate max-w-[140px]">{buLabel(c.unit)}</span>
                          <span className="text-muted">
                            {c.utilPct != null ? `${fmtM(c.actualYTD)} / ${fmtM(c.budgetYTD)}` : fmtM(c.budgetYTD)}
                          </span>
                        </div>
                        {c.utilPct != null && <UtilBar pct={c.utilPct} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// One section's expense-category breakdown — an inline drill-down row beneath the
// section that was clicked (same in-place expand pattern as SAFEE Budget Analysis's
// CommitmentDrilldownPanel), replacing the old hover popover so the detail is a real
// click-to-open page element rather than something that vanishes when the mouse moves.
function CategoryDrilldown({ unit, buLabel, categories, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="mx-4 my-2 rounded-xl border border-border overflow-hidden" style={{ background: 'rgba(0,0,0,0.18)' }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
            <p className="text-xs font-extrabold text-navy">{buLabel(unit)} — expense category breakdown</p>
            <ExportButton
              label="⬇ Export"
              onExport={() => exportRowsToExcel(
                `${buLabel(unit)} - Expense Categories.xlsx`, 'Categories',
                categories.map(c => ({ Category: c.name, Code: c.code, Budget: c.budgetYTD, Actual: c.actualYTD, 'Util %': c.utilPct }))
              )}
            />
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr>
                <th className="text-left px-3 py-1.5 font-bold text-muted">Category</th>
                <th className="text-right px-2 py-1.5 font-bold text-muted">Budget</th>
                <th className="text-right px-2 py-1.5 font-bold text-muted">Actual</th>
                <th className="text-right px-3 py-1.5 font-bold text-muted">Util %</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr key={c.code} style={{ background: i % 2 === 0 ? ROW_BG.even : ROW_BG.odd }}>
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
      </td>
    </tr>
  )
}

// One parent Business Unit's row (collapsed by default) plus its child sections,
// revealed on click — same collapsible pattern as SAFEE Budget Analysis's CategoryTable.
function BUGroupRows({ g, hasActuals, buLabel, expanded, onToggle, drillUnit, onToggleDrill, glUnit, onToggleGl, colSpan, ytdFrom, ytdTo }) {
  const secBg = { background: expanded ? SEC_BG.open : SEC_BG.closed }
  return (
    <>
      <tr style={secBg} className="cursor-pointer select-none" onClick={onToggle}>
        <td className="px-4 py-1.5 font-extrabold text-navy" style={secBg}>
          <span className="inline-block w-3 mr-1 text-muted transition-transform" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>▸</span>
          {g.name}
          <span className="ml-2 text-[10px] font-semibold text-muted">({g.children.length})</span>
        </td>
        <td className="px-4 py-1.5 text-right font-extrabold text-navy">{fmtM(g.budgetYTD)}</td>
        {hasActuals && <>
          <td className="px-4 py-1.5 text-right font-extrabold text-navy">{fmtM(g.actualYTD)}</td>
          <td className="px-4 py-1.5 text-right font-extrabold" style={{ color: (g.varianceYTD || 0) >= 0 ? GREEN : RED }}>{fmtM(g.varianceYTD)}</td>
          <td className="px-4 py-1.5 text-right text-navy">{fmtPct(g.varPct)}</td>
          <td className="px-4 py-1.5 text-right font-extrabold" style={{ color: (g.utilPct || 0) > 100 ? RED : '#fff' }}>{fmtPct(g.utilPct)}</td>
        </>}
      </tr>
      {expanded && g.children.map((r, i) => {
        const rowBg = { background: i % 2 === 0 ? ROW_BG.even : ROW_BG.odd }
        const hasCategories = r.categories && r.categories.length > 0
        const hasAccounts = r.accounts && r.accounts.length > 0
        const open = drillUnit === r.unit
        const glOpen = glUnit === r.unit
        return (
          <Fragment key={r.unit}>
            <tr style={rowBg}>
              <td
                className={`px-4 py-1.5 pl-8 text-navy ${hasCategories ? 'underline decoration-dotted cursor-pointer hover:text-teal-400' : ''}`}
                onClick={hasCategories ? () => onToggleDrill(r.unit) : undefined}
                title={hasCategories ? 'Click to see the expense category breakdown' : undefined}
              >
                {buLabel(r.unit)}
              </td>
              <td className="px-4 py-1.5 text-right text-navy">{fmtM(r.budgetYTD)}</td>
              {hasActuals && <>
                <td
                  className={`px-4 py-1.5 text-right font-semibold text-navy ${hasAccounts ? 'underline decoration-dotted cursor-pointer hover:text-teal-400' : ''}`}
                  onClick={hasAccounts ? () => onToggleGl(r.unit) : undefined}
                  title={hasAccounts ? 'Click to see the Business Central GL entries behind this figure' : undefined}
                >
                  {fmtM(r.actualYTD)}
                </td>
                <td className="px-4 py-1.5 text-right" style={{ color: (r.varianceYTD || 0) >= 0 ? GREEN : RED }}>{fmtM(r.varianceYTD)}</td>
                <td className="px-4 py-1.5 text-right text-muted">{fmtPct(r.varPct)}</td>
                <td className="px-4 py-1.5 text-right font-bold" style={{ color: (r.utilPct || 0) > 100 ? RED : '#fff' }}>{fmtPct(r.utilPct)}</td>
              </>}
            </tr>
            {open && <CategoryDrilldown unit={r.unit} buLabel={buLabel} categories={r.categories} colSpan={colSpan} />}
            {glOpen && (
              <GLDrilldownPanel
                colSpan={colSpan} label={buLabel(r.unit)} accounts={r.accounts}
                asOf={ytdTo} from={ytdFrom} showDescDoc={false} onClose={() => onToggleGl(r.unit)}
              />
            )}
          </Fragment>
        )
      })}
    </>
  )
}

function ByBUTab({ cb, buLabel, sectionToDept, deptDisplayNames }) {
  const [expanded, setExpanded] = useState({})
  const [drillUnit, setDrillUnit] = useState(null)
  const [glUnit, setGlUnit] = useState(null)
  const hasActuals = cb.byBU.some(r => r.actualYTD != null)
  const colSpan = hasActuals ? 6 : 2
  const groups = useMemo(
    () => groupByParentBU(cb.byBU, sectionToDept, deptDisplayNames, buLabel),
    [cb.byBU, sectionToDept, deptDisplayNames] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const cols = hasActuals
    ? ['Budget (Annual)', 'Actual YTD', 'Variance', 'Var %', 'Utilization %']
    : ['Budget (Annual)']

  const totBud = cb.byBU.reduce((s, r) => s + (r.budgetYTD || 0), 0)
  const totAct = cb.byBU.reduce((s, r) => s + (r.actualYTD || 0), 0)
  const totVar = totBud - totAct

  const handleExport = () => {
    const rows = []
    groups.forEach(g => {
      rows.push({ 'Business Unit': g.name, Section: '(All sections)', Budget: g.budgetYTD, Actual: g.actualYTD, Variance: g.varianceYTD, 'Util %': g.utilPct })
      g.children.forEach(c => {
        rows.push({ 'Business Unit': g.name, Section: buLabel(c.unit), Budget: c.budgetYTD, Actual: c.actualYTD, Variance: c.varianceYTD, 'Util %': c.utilPct })
      })
    })
    return exportRowsToExcel(`Corporate Budget by Business Unit - ${cb.budgetName}.xlsx`, 'By Business Unit', rows)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportButton onExport={handleExport} />
      </div>
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Business Unit</th>
                {cols.map(c => (
                  <th key={c} className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <BUGroupRows
                  key={g.code} g={g} hasActuals={hasActuals} buLabel={buLabel} colSpan={colSpan}
                  expanded={!!expanded[g.code]} onToggle={() => setExpanded(p => ({ ...p, [g.code]: !p[g.code] }))}
                  drillUnit={drillUnit} onToggleDrill={u => setDrillUnit(p => (p === u ? null : u))}
                  glUnit={glUnit} onToggleGl={u => setGlUnit(p => (p === u ? null : u))}
                  ytdFrom={cb.ytdFrom} ytdTo={cb.ytdTo}
                />
              ))}
              <tr className="border-t-2 border-border font-extrabold bg-bg">
                <td className="px-4 py-2 text-navy">Total</td>
                <td className="px-4 py-2 text-right text-muted">{fmtM(totBud)}</td>
                {hasActuals && <>
                  <td className="px-4 py-2 text-right text-navy">{fmtM(totAct)}</td>
                  <td className="px-4 py-2 text-right" style={{ color: totVar >= 0 ? GREEN : RED }}>{fmtM(totVar)}</td>
                  <td className="px-4 py-2 text-right text-muted">{fmtPct(totBud ? (totVar / totBud * 100) : null)}</td>
                  <td className="px-4 py-2 text-right text-navy">{fmtPct(totBud ? (totAct / totBud * 100) : null)}</td>
                </>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MonthlyTab({ cb, buLabel, sectionToDept, deptDisplayNames }) {
  const [selectedBU, setSelectedBU] = useState('__all__')
  const [period, setPeriod] = useState('monthly')

  const groups = useMemo(
    () => groupByParentBU(cb.byBU, sectionToDept, deptDisplayNames, buLabel),
    [cb.byBU, sectionToDept, deptDisplayNames] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const group = groups.find(g => g.code === selectedBU)

  let monthlyData
  if (selectedBU === '__all__') {
    monthlyData = cb.monthly.labels.map((label, i) => ({
      label,
      Budget: cb.monthly.budget[i] || 0,
      Actual: cb.monthly.actual[i] || 0,
    }))
  } else if (group) {
    // Parent Business Unit selected — sum its child sections' monthly series.
    monthlyData = cb.monthly.labels.map((label, i) => ({
      label,
      Budget: group.children.reduce((s, r) => s + (r.monthly?.[i]?.bud || 0), 0),
      Actual: group.children.reduce((s, r) => s + (r.monthly?.[i]?.act || 0), 0),
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

  const selectedLabel = selectedBU === '__all__' ? 'All Business Units' : (group ? group.name : buLabel(selectedBU))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-extrabold text-muted uppercase tracking-wider">Business Unit:</label>
        <select
          value={selectedBU}
          onChange={e => setSelectedBU(e.target.value)}
          className="text-xs font-semibold border border-border rounded-xl px-3 py-1.5 bg-bg text-navy outline-none focus:border-navy"
        >
          <option value="__all__">All Business Units</option>
          {groups.map(g => (
            <optgroup key={g.code} label={g.name}>
              <option value={g.code}>{g.name} (All sections)</option>
              {g.children.map(c => <option key={c.unit} value={c.unit}>{buLabel(c.unit)}</option>)}
            </optgroup>
          ))}
        </select>
        <PeriodToggle value={period} onChange={setPeriod} />
        <div className="ml-auto">
          <ExportButton onExport={() => exportRowsToExcel(
            `Corporate Budget Monthly Trend - ${selectedLabel} - ${cb.budgetName}.xlsx`, 'Monthly Trend',
            chartData.map(d => ({ Period: d.label, Budget: d.Budget, Actual: d.Actual }))
          )} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border p-4">
        <p className="text-xs font-extrabold text-muted uppercase tracking-wider mb-3">
          Budget vs Actual — {selectedLabel}
          {period !== 'monthly' && ` · ${period === 'quarterly' ? 'Quarterly' : 'Annual'}`}
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} tickFormatter={fmtM} />
            <Tooltip formatter={v => [fmtM(v), '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} labelStyle={{ color: '#02404F', fontWeight: 700 }} itemStyle={{ color: '#02404F' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
            <Bar dataKey="Budget" fill={TEAL} radius={[2, 2, 0, 0]} />
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
          <ResponsiveContainer width="100%" height={selectedAcct === '__all__' ? 280 : 240}>
            <BarChart data={chartData}
              margin={{ top: 8, right: 8, bottom: selectedAcct === '__all__' ? 60 : 0, left: selectedAcct === '__all__' ? 20 : -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
              {selectedAcct === '__all__' ? (
                <>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} height={60} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} tickFormatter={fmtM} />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} tickFormatter={fmtM} />
                </>
              )}
              <Tooltip formatter={v => [fmtM(v), '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} labelStyle={{ color: '#02404F', fontWeight: 700 }} itemStyle={{ color: '#02404F' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
              <Bar dataKey="Budget" fill={TEAL} radius={[2, 2, 0, 0]} />
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

function BudgetMatrixTab({ apiData, loading, error, buLabel, sectionToDept, deptDisplayNames }) {
  const [buFilter, setBuFilter] = useState('__all__')

  // Reset BU filter when budget changes
  useEffect(() => { setBuFilter('__all__') }, [apiData?.budgetName])

  // Same parent-BU grouping as HR Analysis — apiData.BUs is this budget's own flat
  // section-code list, rolled up under its Begin-Total parent so the dropdown reads as
  // Business Unit -> sections instead of ~40 section codes in one flat list.
  const buGroups = useMemo(() => {
    if (!apiData) return []
    const groups = {}
    apiData.BUs.forEach(bu => {
      const parentCode = sectionToDept[bu] || bu
      const parentName = deptDisplayNames[parentCode] || buLabel(parentCode)
      const g = groups[parentCode] || (groups[parentCode] = { code: parentCode, name: parentName, children: [] })
      g.children.push(bu)
    })
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name))
  }, [apiData, sectionToDept, deptDisplayNames]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const buGroup = buGroups.find(g => g.code === buFilter)
  const getMonthly = acct => {
    if (buFilter === '__all__') return acct.monthly
    if (buGroup) return Array(12).fill(0).map((_, i) => buGroup.children.reduce((s, code) => s + (acct.byBU[code]?.[i] || 0), 0))
    return acct.byBU[buFilter] || Array(12).fill(0)
  }

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
          {buGroups.map(g => (
            <optgroup key={g.code} label={g.name}>
              <option value={g.code}>{g.name} (All sections)</option>
              {g.children.map(code => <option key={code} value={code}>{buLabel(code)}</option>)}
            </optgroup>
          ))}
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
  const rawCb = useMemo(() => {
    if (snapshotCb && snapshotCb.budgetName === selectedBudget) return snapshotCb
    return adaptApiData(apiData)
  }, [snapshotCb, apiData, selectedBudget])

  // Filter by Period — same control/behavior as Financial Performance, scoped to
  // whichever budget's 12 months are currently loaded (`rawCb.monthly.labels`).
  const mData = useMemo(() => (rawCb?.monthly?.labels || []).map(label => ({ label })), [rawCb])
  const sel = usePeriodSelection(mData)
  const cb = useMemo(() => applyPeriodFilter(rawCb, sel.selMonths), [rawCb, sel.selMonths])

  const buNames  = apiData?.buNames || {}
  const buLabel  = code => buNames[code] || code

  // Same parent Business Unit grouping HR Analysis uses (hr.sectionToDept resolves a
  // section code like "MSP-001" to its Begin-Total parent, e.g. "MSP"; deptDisplayNames
  // holds that parent's display name) — shared across By Business Unit, Monthly Trend
  // and Budget Matrix below so "Business Unit" means the same thing everywhere.
  const sectionToDept    = data?.hr?.sectionToDept    || {}
  const deptDisplayNames = data?.hr?.deptDisplayNames || {}

  const hasActuals  = cb?.actualYTD != null
  const utilPct     = cb?.totalBudget ? ((cb.actualYTD || 0) / cb.totalBudget * 100) : null
  const variance    = (cb?.totalBudget || 0) - (cb?.actualYTD || 0)

  const isTabLoading = apiLoading && tab !== 'matrix'  // matrix manages its own state

  return (
    <div className="space-y-4">
      {/* Header row: title + budget selector (left), Filter by Period (right) — same
          top-right placement as Financial Performance/Balance Sheet/P&L by Business
          Line, pinned with ml-auto so it stays put once Clear filters appears. Tabs
          moved to their own row below so this one never has to wrap. */}
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

        {mData.length > 0 && (
          <div className="flex flex-wrap items-end gap-2.5 ml-auto">
            <PeriodTree mData={mData} selected={sel.selMonths} onChange={sel.setSelMonths} />
            {sel.selMonths.length > 0 && (
              <button
                onClick={sel.clearPeriod}
                className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-navy hover:border-navy transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-0.5 bg-bg rounded-xl p-1 border border-border flex-wrap w-fit">
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

      {/* KPI cards */}
      {cb && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label={sel.selMonths.length ? 'Budget' : 'Total Budget'} value={fmtM(cb.totalBudget)} sub={sel.selMonths.length ? sel.periodLabel : `Budget ${selectedBudget}`} />
          {hasActuals ? (
            <>
              <KpiCard label={sel.selMonths.length ? 'Actual' : 'Actual YTD'} value={fmtM(cb.actualYTD)} sub="OPEX expenses" color={ORANGE} />
              <KpiCard
                label="Variance"
                value={fmtM(variance)}
                sub="Budget remaining"
                color={variance >= 0 ? GREEN : RED}
              />
              <KpiCard
                label={sel.selMonths.length ? 'Utilization' : 'Utilization YTD'}
                value={fmtPct(utilPct)}
                sub={sel.selMonths.length ? 'vs period budget' : 'vs annual budget'}
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
        <BudgetMatrixTab apiData={apiData} loading={apiLoading} error={apiError} buLabel={buLabel} sectionToDept={sectionToDept} deptDisplayNames={deptDisplayNames} />
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
          {tab === 'overview' && <OverviewTab cb={cb} buLabel={buLabel} periodLabel={sel.selMonths.length ? sel.periodLabel : null} sectionToDept={sectionToDept} deptDisplayNames={deptDisplayNames} />}
          {tab === 'bybu'     && <ByBUTab     cb={cb} buLabel={buLabel} sectionToDept={sectionToDept} deptDisplayNames={deptDisplayNames} />}
          {tab === 'monthly'  && <MonthlyTab  cb={cb} buLabel={buLabel} sectionToDept={sectionToDept} deptDisplayNames={deptDisplayNames} />}
          {tab === 'opex'     && <OpexTab     cb={cb} />}
        </>
      )}
    </div>
  )
}
