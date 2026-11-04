import { Fragment, useEffect, useState } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'
import { fmtETB, fmtPct } from '../lib/fmt.js'
import { safeeBudget as safeeBudgetApi } from '../lib/api.js'
import PeriodToggle from '../components/PeriodToggle.jsx'

const NAVY   = '#02404F'
const TEAL   = '#1FB6A6'
const ORANGE = '#EB7D23'
const GREEN  = '#2EBD85'
const RED    = '#E5544B'
// NAVY deliberately excluded — this page's cards render on a dark-navy background in
// dark mode, so a navy pie slice (or bar) was blending straight into it, making
// whichever category landed on that color (e.g. "Delivery Fee") invisible.
const PIE_COLORS = [ORANGE, TEAL, GREEN, RED, '#8E5FD9', '#4A90E2', '#C9A227', '#F2B705']

// Same dark-theme zebra-stripe/section palette as HR Analysis's own tables (HRPageReview.jsx)
// — explicit hex rather than relying on index.css's bg-white dark-mode remap, so this
// table reads as one consistent "system" with HR Analysis instead of two different
// dark-navy tones next to each other.
const ROW_BG = { even: '#0A3A46', odd: '#0E434D' }
const SEC_BG = { open: '#123C46', closed: '#0C3841' }

const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'program',      label: 'Program View' },
  { id: 'intervention', label: 'Intervention View' },
  { id: 'activity',     label: 'Budget Activity' }, // Annual Summary + vs Quarter + Monthly all merged in here, switched via the Monthly/Quarterly/Annually toggle
  { id: 'int-budget',   label: 'vs Intervention' },
]

const tooltipFmt = v => [`ETB ${fmtETB(v, 4, true)}`, '']

// Dynamically imports xlsx only when Export is actually clicked, same lazy pattern
// Corporate Budget Analysis's own per-table export uses — the ~700KB library never
// loads as part of this page's normal bundle.
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

// Flattens the Budget Activity table (category totals + each line) into one row per
// line, with columns matching whatever granularity is currently on screen — Annually
// exports a single Budget/Utilized/Unutilized/% group, Quarterly/Monthly exports one
// such group per period, same breakdown the table itself is showing.
function buildActivityExportRows(categories, granularity, periods, periodKey) {
  const rows = []
  const pct1 = v => v == null ? null : +v.toFixed(1)
  categories.forEach(cat => {
    if (granularity === 'annually') {
      rows.push({
        Category: cat.name, Line: '(Category Total)',
        'Budget (M)': cat.budget, 'Utilized (M)': cat.utilized, 'Unutilized (M)': cat.unutilized,
        '% Unutilized': pct1(cat.pctUnutilized),
      })
      cat.lines.forEach(line => rows.push({
        Category: cat.name, Line: `${line.code}: ${line.name}`,
        'Budget (M)': line.budget, 'Utilized (M)': line.utilized, 'Unutilized (M)': line.unutilized,
        '% Unutilized': pct1(line.pctUnutilized),
      }))
    } else {
      cat.lines.forEach(line => {
        const row = { Category: cat.name, Line: `${line.code}: ${line.name}` }
        periods.forEach(p => {
          const lp = line[periodKey].find(x => x.id === p.id) || { budget: 0, utilized: 0, unutilized: 0, pctUnutilized: null }
          row[`${p.label} Budget (M)`]     = lp.budget
          row[`${p.label} Utilized (M)`]   = lp.utilized
          row[`${p.label} Unutilized (M)`] = lp.unutilized
          row[`${p.label} % Unutilized`]   = pct1(lp.pctUnutilized)
        })
        rows.push(row)
      })
    }
  })
  return rows
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-4 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: accent || NAVY }} />
      <div className="pl-2">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-1">{label}</p>
        <p className="text-xl font-extrabold text-navy leading-none mb-1">{value}</p>
        {sub && <p className="text-[10px] text-muted">{sub}</p>}
      </div>
    </div>
  )
}

// "Select Budget" dropdown — same style/placement as Corporate Budget Analysis's own
// "Budget:" selector (label + a bordered <select>, "code – description" option text),
// instead of the previous row of Year 1-5 pills, for visual consistency between the two
// budget pages. `years` is whatever budget years actually exist right now (see
// services/safee-budget.js's discoverBudgetYears) — a newly added year appears here with
// no code change, same as Corporate Budget Analysis's own dynamic list.
function BudgetYearPicker({ value, onChange, years }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-xs text-muted">Budget:</p>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs font-bold border border-border rounded-lg px-2.5 py-1 bg-bg text-navy outline-none focus:border-navy"
      >
        {years?.length
          ? years.map(y => (
              <option key={y.budgetName} value={y.budgetName}>
                {y.budgetName} – {y.label}{y.startLabel ? ` (${y.startLabel} – ${y.endLabel})` : ''}
              </option>
            ))
          : <option value={value}>{value || 'Loading…'}</option>}
      </select>
    </div>
  )
}

function fmtAmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
}
function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Click-the-Utilized-number drilldown — same idea as GLDrilldownPanel (an inline row
// that expands directly under the line that was clicked, not a disconnected modal),
// but hitting SAFEE's own /drilldown endpoint. That endpoint reads the budget year's
// already-cached BC data (one shared 10-minute cache behind every SAFEE Budget tab),
// so beyond the first load of a given year this is served with no live BC round trip —
// what makes it load fast.
function CommitmentDrilldownPanel({ colSpan, label, budgetName, catCode, lineCode, selMonths, team, intervention, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setData(null)
    safeeBudgetApi.drilldown(budgetName, catCode, lineCode, selMonths, team, intervention)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load entries.')))
      .then(j => { if (!cancelled) setData(j) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [budgetName, catCode, lineCode, selMonths, team, intervention]) // eslint-disable-line react-hooks/exhaustive-deps

  const entries = data?.entries || []

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="mx-4 my-2 rounded-xl border border-border overflow-hidden" style={{ background: 'rgba(0,0,0,0.18)' }}>
          <div className="flex items-start justify-between px-4 py-2.5 border-b border-border/50 gap-3">
            <div>
              <p className="text-xs font-extrabold text-navy">{label} — utilized entries (Business Central)</p>
              <p className="text-[10px] text-muted mt-0.5">{data ? `${data.count} entr${data.count === 1 ? 'y' : 'ies'}` : '…'}</p>
            </div>
            <button onClick={onClose} className="text-muted hover:text-navy text-base leading-none px-1.5 flex-shrink-0">×</button>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {loading ? (
              <p className="text-xs text-muted px-4 py-5 text-center">Loading entries from Business Central…</p>
            ) : error ? (
              <p className="text-xs font-bold px-4 py-5 text-center" style={{ color: RED }}>{error}</p>
            ) : entries.length === 0 ? (
              <p className="text-xs text-muted px-4 py-5 text-center">No utilized entries found for this line.</p>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0" style={{ background: '#052C36' }}>
                  <tr>
                    <th className="text-left px-4 py-1.5 font-extrabold text-muted uppercase tracking-wider">Date</th>
                    <th className="text-left px-3 py-1.5 font-extrabold text-muted uppercase tracking-wider">Account</th>
                    <th className="text-right px-4 py-1.5 font-extrabold text-muted uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-t border-border/30 hover:bg-white/5">
                      <td className="px-4 py-1.5 text-navy whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-3 py-1.5 text-navy">{e.accountNo}{e.accountName ? ` — ${e.accountName}` : ''}</td>
                      <td className="px-4 py-1.5 text-right font-semibold text-navy whitespace-nowrap">ETB {fmtAmt(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!loading && !error && entries.length > 0 && (
            <div className="flex items-center justify-end px-4 py-2 border-t border-border/50" style={{ background: 'rgba(0,0,0,0.12)' }}>
              <p className="text-xs font-extrabold text-navy">Total: ETB {fmtAmt(data.total)}</p>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// Nested Category -> Line table (Category Description, Budget, Utilized, Unutilized,
// % Unutilized) — the base table behind the Budget Activity tab's Monthly/Quarterly/
// Annually toggle (same three granularities Corporate Budget Analysis's own chart
// toggle offers, just rendered as a table here instead of bars — see PeriodToggle).
// `granularity === 'annually'` is the flat Annual total (one Budget/Utilized/Unutilized/%
// column group, same as this table always showed before); 'quarter'/'month' instead
// repeat that same 4-column group once per period, reading each line's own byQuarter/
// byMonth breakdown (see services/safee-budget.js). Categories start collapsed (just
// the group name + totals) and expand on click to reveal their lines — keeps the table
// scannable instead of dumping every line at once. In Annual mode, clicking a line's
// Utilized figure opens an inline panel with the real BC entries behind it (see
// CommitmentDrilldownPanel above) — per-period drilldown isn't wired up (the annual
// total already covers the same entries), so that's Annual-only.
function CategoryTable({ categories, granularity, periods, budgetName, selMonths, team, intervention }) {
  const [expanded, setExpanded] = useState({})
  // { key: `${catCode}|${lineCode}`, periodId: 'annual' | a quarter/month id } or null —
  // periodId tracks WHICH column was clicked so Quarterly/Monthly mode can drill into one
  // specific period instead of only ever the whole year.
  const [openDrill, setOpenDrill] = useState(null)
  const toggleCategory = code => setExpanded(prev => ({ ...prev, [code]: !prev[code] }))
  const toggleDrill = (key, periodId) => setOpenDrill(prev =>
    (prev?.key === key && prev?.periodId === periodId) ? null : { key, periodId })

  const grouped = granularity !== 'annually'
  const periodKey = granularity === 'monthly' ? 'byMonth' : 'byQuarter'

  const total = categories.reduce((s, c) => ({
    budget: s.budget + c.budget, utilized: s.utilized + c.utilized, unutilized: s.unutilized + c.unutilized
  }), { budget: 0, utilized: 0, unutilized: 0 })
  const totalPctUnutil = total.budget ? (total.unutilized / total.budget * 100) : null
  const colSpan = grouped ? 1 + periods.length * 4 : 5

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={grouped ? { minWidth: periods.length * 160 + 180 } : undefined}>
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider sticky left-0 bg-bg">Category Description</th>
              {!grouped ? (
                <>
                  <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Budget</th>
                  <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Utilized</th>
                  <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Unutilized</th>
                  <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">% Unutilized</th>
                </>
              ) : (
                periods.map(p => (
                  <th key={p.id} colSpan={4} className="text-center px-2 py-2.5 font-extrabold text-muted uppercase tracking-wider border-l border-border">{p.label}</th>
                ))
              )}
            </tr>
            {grouped && (
              <tr className="border-b border-border bg-bg">
                <th className="sticky left-0 bg-bg" />
                {periods.map(p => (
                  <Fragment key={p.id}>
                    <th className="text-right px-2 py-1.5 font-bold text-muted border-l border-border">Budget</th>
                    <th className="text-right px-2 py-1.5 font-bold text-muted">Utilized</th>
                    <th className="text-right px-2 py-1.5 font-bold text-muted">Unutil.</th>
                    <th className="text-right px-2 py-1.5 font-bold text-muted">%</th>
                  </Fragment>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {categories.map(cat => (
              <CategoryRows
                key={cat.code} cat={cat} grouped={grouped} periods={periods} periodKey={periodKey}
                expanded={!!expanded[cat.code]} onToggleCategory={() => toggleCategory(cat.code)}
                openDrill={openDrill} onToggleDrill={toggleDrill} colSpan={colSpan}
                budgetName={budgetName} selMonths={selMonths} team={team} intervention={intervention}
              />
            ))}
            <tr className="border-t-2 border-border font-extrabold bg-bg">
              <td className="px-4 py-2 text-navy sticky left-0 bg-bg">Total</td>
              {!grouped ? (
                <>
                  <td className="px-4 py-2 text-right text-navy">{fmtETB(total.budget, 4, true)}</td>
                  <td className="px-4 py-2 text-right text-navy">{fmtETB(total.utilized, 4, true)}</td>
                  <td className="px-4 py-2 text-right text-navy">{fmtETB(total.unutilized, 4, true)}</td>
                  <td className="px-4 py-2 text-right text-navy">{fmtPct(totalPctUnutil, 1)}</td>
                </>
              ) : periods.map(p => {
                const agg = categories.reduce((s, c) => {
                  const cq = c.lines.reduce((ss, l) => {
                    const lp = l[periodKey].find(x => x.id === p.id) || { budget: 0, utilized: 0, unutilized: 0 }
                    return { budget: ss.budget + lp.budget, utilized: ss.utilized + lp.utilized, unutilized: ss.unutilized + lp.unutilized }
                  }, { budget: 0, utilized: 0, unutilized: 0 })
                  return { budget: s.budget + cq.budget, utilized: s.utilized + cq.utilized, unutilized: s.unutilized + cq.unutilized }
                }, { budget: 0, utilized: 0, unutilized: 0 })
                const pct = agg.budget ? (agg.unutilized / agg.budget * 100) : null
                return (
                  <Fragment key={p.id}>
                    <td className="px-2 py-2 text-right text-navy border-l border-border">{fmtETB(agg.budget, 4, true)}</td>
                    <td className="px-2 py-2 text-right text-navy">{fmtETB(agg.utilized, 4, true)}</td>
                    <td className="px-2 py-2 text-right text-navy">{fmtETB(agg.unutilized, 4, true)}</td>
                    <td className="px-2 py-2 text-right text-navy">{fmtPct(pct, 1)}</td>
                  </Fragment>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CategoryRows({ cat, grouped, periods, periodKey, expanded, onToggleCategory, openDrill, onToggleDrill, colSpan, budgetName, selMonths, team, intervention }) {
  // Same section/zebra-stripe palette as HR Analysis's own tables (SEC_BG/ROW_BG,
  // HRPageReview.jsx) — an explicit dark-navy background (not a translucent tint) so
  // the sticky first column reads identically to the rest of the row at any scroll
  // position, and the table matches HR Analysis's look rather than its own one-off tint.
  const secBg = { background: expanded ? SEC_BG.open : SEC_BG.closed }
  const canDrill = !grouped && budgetName
  // Grouped (Quarterly/Monthly) mode's category summary row used to render a single
  // blank cell here — every figure was only visible once a category was expanded down
  // to its lines. Roll the lines' own per-period figures up to the category level so
  // the collapsed row shows real numbers too, same as the ungrouped (Annually) table.
  const catByPeriod = grouped
    ? periods.map(p => {
        const agg = cat.lines.reduce((s, l) => {
          const lp = l[periodKey].find(x => x.id === p.id) || { budget: 0, utilized: 0, unutilized: 0 }
          return { budget: s.budget + lp.budget, utilized: s.utilized + lp.utilized, unutilized: s.unutilized + lp.unutilized }
        }, { budget: 0, utilized: 0, unutilized: 0 })
        return { id: p.id, ...agg, pctUnutilized: agg.budget ? (agg.unutilized / agg.budget * 100) : null }
      })
    : []
  return (
    <>
      <tr style={secBg} className="cursor-pointer select-none" onClick={onToggleCategory}>
        <td className="px-4 py-1.5 font-extrabold text-navy sticky left-0" style={secBg}>
          <span className="inline-block w-3 mr-1 text-muted transition-transform" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>▸</span>
          {cat.name}
          <span className="ml-2 text-[10px] font-semibold text-muted">({cat.lines.length})</span>
        </td>
        {!grouped ? (
          <>
            <td className="px-4 py-1.5 text-right font-extrabold text-navy">{fmtETB(cat.budget, 4, true)}</td>
            <td className="px-4 py-1.5 text-right font-extrabold text-navy">{fmtETB(cat.utilized, 4, true)}</td>
            <td className="px-4 py-1.5 text-right font-extrabold text-navy">{fmtETB(cat.unutilized, 4, true)}</td>
            <td className="px-4 py-1.5 text-right font-extrabold text-navy">{fmtPct(cat.pctUnutilized, 1)}</td>
          </>
        ) : catByPeriod.map(p => (
          <Fragment key={p.id}>
            <td className="px-2 py-1.5 text-right font-extrabold text-navy border-l border-border">{fmtETB(p.budget, 4, true)}</td>
            <td className="px-2 py-1.5 text-right font-extrabold text-navy">{fmtETB(p.utilized, 4, true)}</td>
            <td className="px-2 py-1.5 text-right font-extrabold text-navy">{fmtETB(p.unutilized, 4, true)}</td>
            <td className="px-2 py-1.5 text-right font-extrabold text-navy">{fmtPct(p.pctUnutilized, 1)}</td>
          </Fragment>
        ))}
      </tr>
      {expanded && cat.lines.map((line, i) => {
        // Drill key now carries which period (or 'annual') was clicked, so a Quarterly/
        // Monthly column's Utilized figure opens its OWN drilldown — scoped to just that
        // period's month(s), via the matching period's idxs — instead of only ever being
        // able to drill into the whole year like before.
        const openPeriodId = openDrill?.key === `${cat.code}|${line.code}` ? openDrill.periodId : null
        const rowBg = { background: i % 2 === 0 ? ROW_BG.even : ROW_BG.odd }
        const drillSelMonths = openPeriodId && openPeriodId !== 'annual'
          ? (periods.find(p => p.id === openPeriodId)?.idxs || [])
          : selMonths
        return (
          <Fragment key={line.code}>
            <tr style={rowBg}>
              <td className="px-4 py-1.5 pl-8 text-navy sticky left-0" style={rowBg}>{line.code}: {line.name}</td>
              {!grouped ? (
                <>
                  <td className="px-4 py-1.5 text-right text-navy">{fmtETB(line.budget, 4, true)}</td>
                  <td
                    className={`px-4 py-1.5 text-right text-navy ${canDrill ? 'underline decoration-dotted cursor-pointer hover:text-teal-400' : ''}`}
                    onClick={canDrill ? (e) => { e.stopPropagation(); onToggleDrill(`${cat.code}|${line.code}`, 'annual') } : undefined}
                    title={canDrill ? 'Click to see the Business Central entries behind this figure' : undefined}
                  >
                    {fmtETB(line.utilized, 4, true)}
                  </td>
                  <td className="px-4 py-1.5 text-right text-navy">{fmtETB(line.unutilized, 4, true)}</td>
                  <td className="px-4 py-1.5 text-right" style={{ color: (line.pctUnutilized || 0) > 50 ? RED : GREEN }}>{fmtPct(line.pctUnutilized, 1)}</td>
                </>
              ) : line[periodKey].map(p => (
                <Fragment key={p.id}>
                  <td className="px-2 py-1.5 text-right text-navy border-l border-border">{fmtETB(p.budget, 4, true)}</td>
                  <td
                    className={`px-2 py-1.5 text-right text-navy ${budgetName ? 'underline decoration-dotted cursor-pointer hover:text-teal-400' : ''}`}
                    onClick={budgetName ? (e) => { e.stopPropagation(); onToggleDrill(`${cat.code}|${line.code}`, p.id) } : undefined}
                    title={budgetName ? `Click to see the Business Central entries behind ${p.label}'s figure` : undefined}
                  >
                    {fmtETB(p.utilized, 4, true)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-navy">{fmtETB(p.unutilized, 4, true)}</td>
                  <td className="px-2 py-1.5 text-right text-navy">{fmtPct(p.pctUnutilized, 1)}</td>
                </Fragment>
              ))}
            </tr>
            {openPeriodId && (
              <CommitmentDrilldownPanel
                colSpan={colSpan}
                label={openPeriodId === 'annual' ? `${line.code}: ${line.name}` : `${line.code}: ${line.name} — ${periods.find(p => p.id === openPeriodId)?.label || ''}`}
                budgetName={budgetName} catCode={cat.code} lineCode={line.code}
                selMonths={drillSelMonths} team={team} intervention={intervention}
                onClose={() => onToggleDrill(`${cat.code}|${line.code}`, openPeriodId)}
              />
            )}
          </Fragment>
        )
      })}
    </>
  )
}

function InterventionTable({ interventions, budgetName, selMonths, team }) {
  const [openIntervention, setOpenIntervention] = useState(null)
  const total = interventions.reduce((s, i) => ({
    budget: s.budget + i.budget, utilized: s.utilized + i.utilized, unutilized: s.unutilized + i.unutilized
  }), { budget: 0, utilized: 0, unutilized: 0 })
  return (
    <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-bg">
            <th className="text-left px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Intervention Code</th>
            <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Budget</th>
            <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Utilized</th>
            <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Unutilized</th>
            <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">% Unutilized</th>
          </tr>
        </thead>
        <tbody>
          {interventions.map((i, idx) => {
            const open = openIntervention === i.code
            return (
              <Fragment key={i.code}>
                <tr style={{ background: idx % 2 === 0 ? ROW_BG.even : ROW_BG.odd }}>
                  <td className="px-4 py-2 font-semibold text-navy">
                    <span className="text-muted mr-1">{i.code}</span>{i.name}
                  </td>
                  <td className="px-4 py-2 text-right text-navy">{fmtETB(i.budget, 4, true)}</td>
                  <td
                    className={`px-4 py-2 text-right text-navy ${budgetName ? 'underline decoration-dotted cursor-pointer hover:text-teal-400' : ''}`}
                    onClick={budgetName ? () => setOpenIntervention(open ? null : i.code) : undefined}
                    title={budgetName ? 'Click to see the Business Central entries behind this figure' : undefined}
                  >
                    {fmtETB(i.utilized, 4, true)}
                  </td>
                  <td className="px-4 py-2 text-right text-navy">{fmtETB(i.unutilized, 4, true)}</td>
                  <td className="px-4 py-2 text-right" style={{ color: (i.pctUnutilized || 0) > 50 ? RED : GREEN }}>{fmtPct(i.pctUnutilized, 1)}</td>
                </tr>
                {open && (
                  <CommitmentDrilldownPanel
                    colSpan={5} label={`${i.code}: ${i.name}`}
                    budgetName={budgetName} catCode={null} lineCode={null}
                    selMonths={selMonths} team={team} intervention={i.code}
                    onClose={() => setOpenIntervention(null)}
                  />
                )}
              </Fragment>
            )
          })}
          <tr className="border-t-2 border-border font-extrabold bg-bg">
            <td className="px-4 py-2 text-navy">Total</td>
            <td className="px-4 py-2 text-right text-navy">{fmtETB(total.budget, 4, true)}</td>
            <td className="px-4 py-2 text-right text-navy">{fmtETB(total.utilized, 4, true)}</td>
            <td className="px-4 py-2 text-right text-navy">{fmtETB(total.unutilized, 4, true)}</td>
            <td className="px-4 py-2 text-right text-navy">{fmtPct(total.budget ? total.unutilized / total.budget * 100 : null, 1)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function SafeeBudget() {
  // Starts empty rather than a hardcoded year — picked once the dynamic years list
  // arrives (see the overview effect below), so a change to which years exist never
  // needs a matching change here.
  const [budgetName, setBudgetName] = useState('')
  const [tab, setTab] = useState('overview')
  const [team, setTeam] = useState('')
  const [intervention, setIntervention] = useState('')

  const [yearDetail, setYearDetail] = useState(null)
  const [overview, setOverview]     = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (!budgetName) return // waiting on the years list below to pick a default
    let cancelled = false
    setLoading(true); setError('')
    safeeBudgetApi.year(budgetName, [], team, intervention)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || 'Failed to load.'))))
      .then(j => { if (!cancelled) setYearDetail(j) })
      .catch(e => { if (!cancelled) setError(e.message || 'Failed to load SAFEE budget data.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [budgetName, team, intervention])

  // All-years payload — fetched regardless of which tab is active (not just Overview)
  // since the "Select Budget" picker's own option list comes from here too, and every
  // year's own date range is shown next to it.
  useEffect(() => {
    let cancelled = false
    safeeBudgetApi.overview([])
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load.')))
      .then(j => { if (!cancelled) setOverview(j) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const years = overview?.years || []

  // Default to the first available year once the dynamic list arrives — only while
  // nothing's been picked yet, so this never overrides an explicit user selection.
  useEffect(() => {
    if (!budgetName && years.length) setBudgetName(years[0].budgetName)
  }, [budgetName, years])
  const overviewChartData = years.map(y => ({
    label: y.label, Budget: y.budget, 'Total Budget': overview?.totalBudget || 0,
    Utilized: y.utilized, Unutilized: y.unutilized,
  }))

  const categories = yearDetail?.categories || []
  const interventions = yearDetail?.interventions || []
  const totals = yearDetail?.totals

  const yearLabel = years.find(y => y.budgetName === budgetName)?.label || budgetName

  // Budget Activity's own Monthly/Quarterly/Annually toggle (PeriodToggle, same control
  // Corporate Budget Analysis uses for its chart) — merges what used to be three separate
  // tabs (Budget Activity, Annual Summary, Monthly) into this one table, which just reads
  // a different period breakdown off each line depending on which granularity is picked.
  const [activityGranularity, setActivityGranularity] = useState('annually')
  // `idxs` — which month index/indices this period covers — travels with every period so
  // a clicked Utilized cell can scope its drilldown to exactly that month/quarter instead
  // of only ever being able to drill into the full year.
  const activityPeriods = activityGranularity === 'monthly'
    ? (yearDetail?.months || []).map((m, i) => ({ id: m.key, label: m.label, idxs: [i] }))
    : activityGranularity === 'quarterly'
      ? (yearDetail?.quarters || [])
      : []
  const activityPeriodKey = activityGranularity === 'monthly' ? 'byMonth' : 'byQuarter'

  return (
    <div className="space-y-5">
      {/* Header row: title + Select Budget */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">SAFEE Budget Analysis</h2>
          <p className="text-xs text-muted font-medium">Programme budget vs. utilization · source: Business Central</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BudgetYearPicker value={budgetName} onChange={setBudgetName} years={overview?.years} />
        {/* Monthly/Quarterly/Annually + Export only make sense for the Budget Activity
            table, but live on this same line (with Select Budget) rather than a separate
            row above the table itself. */}
        {tab === 'activity' && yearDetail && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <PeriodToggle value={activityGranularity} onChange={setActivityGranularity} />
            <ExportButton
              label="⬇ Export Excel"
              onExport={() => exportRowsToExcel(
                `SAFEE Budget Activity - ${yearLabel} - ${activityGranularity}.xlsx`,
                'Budget Activity',
                buildActivityExportRows(categories, activityGranularity, activityPeriods, activityPeriodKey)
              )}
            />
          </div>
        )}
      </div>

      {/* Tabs — Budget Activity's own Program/Intervention filters sit on this same row,
          pinned to the right (ml-auto), instead of a separate sidebar box next to the
          table below. Only relevant (and only rendered) on that one tab. flex-nowrap +
          overflow-x-auto (instead of flex-wrap) so this never drops to a second line at
          any screen width — it scrolls horizontally in that same single row instead. */}
      <div className="flex flex-nowrap items-center gap-3 overflow-x-auto pb-1">
        <div className="flex gap-0.5 bg-bg rounded-xl p-1 border border-border flex-shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap"
              style={tab === t.id ? { background: NAVY, color: '#fff' } : { color: '#6B7C93' }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'activity' && yearDetail && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <select value={team} onChange={e => setTeam(e.target.value)} title="Program Filter" className="text-xs font-bold border border-border rounded-lg px-2.5 py-1.5 bg-bg text-navy outline-none focus:border-navy flex-shrink-0">
              <option value="">Program: All</option>
              {Object.entries(
                yearDetail.filters.teams.reduce((groups, t) => {
                  (groups[t.group || 'Other'] || (groups[t.group || 'Other'] = [])).push(t)
                  return groups
                }, {})
              ).map(([group, opts]) => (
                <optgroup key={group} label={group}>
                  {opts.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
            <select value={intervention} onChange={e => setIntervention(e.target.value)} title="Intervention Filter" className="text-xs font-bold border border-border rounded-lg px-2.5 py-1.5 bg-bg text-navy outline-none focus:border-navy flex-shrink-0">
              <option value="">Intervention: All</option>
              {yearDetail.filters.interventions.map(i => <option key={i.code} value={i.code}>{i.name}</option>)}
            </select>
            {(team || intervention) && (
              <button onClick={() => { setTeam(''); setIntervention('') }} className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-navy hover:border-navy transition-colors flex-shrink-0 whitespace-nowrap">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {loading && tab !== 'overview' && (
        <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted text-sm">Loading…</div>
      )}
      {!loading && error && tab !== 'overview' && (
        <div className="bg-white rounded-2xl border border-border p-10 text-center text-sm" style={{ color: RED }}>{error}</div>
      )}

      {/* ── Overview ──────────────────────────────────────────────────────────── */}
      {tab === 'overview' && overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Total Budget" value={`ETB ${fmtETB(overview.totalBudget)}`} accent={TEAL} />
            <StatCard label="Total Utilized" value={`ETB ${fmtETB(overview.totalUtilized)}`} accent={ORANGE} />
            <StatCard label="Total Unutilized" value={`ETB ${fmtETB(overview.totalUnutilized)}`} accent={RED} />
            <StatCard label="% Utilized" value={overview.pctUtilized != null ? `${overview.pctUtilized.toFixed(2)}%` : '—'} accent={(overview.pctUtilized || 0) >= 50 ? GREEN : RED} />
            <StatCard label="% Unutilized" value={overview.pctUnutilized != null ? `${overview.pctUnutilized.toFixed(2)}%` : '—'} accent={(overview.pctUnutilized || 0) > 50 ? RED : GREEN} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {[
              { title: '5 Year Budget vs Yearly Budget', key: 'Budget', ref: 'Total Budget', color: TEAL },
              { title: '5 Year Budget vs Yearly Utilized', key: 'Utilized', ref: 'Budget', color: ORANGE },
              { title: '5 Year Budget vs Yearly Unutilized', key: 'Unutilized', ref: 'Budget', color: RED },
            ].map(chart => (
              <div key={chart.title} className="bg-white rounded-2xl border border-border p-5 shadow-card">
                <h3 className="text-sm font-bold text-navy mb-3">{chart.title}</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={overviewChartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtETB} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E3E9F2' }} labelStyle={{ color: '#02404F', fontWeight: 700 }} itemStyle={{ color: '#02404F' }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
                    <Bar dataKey={chart.ref} fill={`${TEAL}30`} radius={[3, 3, 0, 0]} />
                    <Bar dataKey={chart.key} fill={chart.color} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Program View ──────────────────────────────────────────────────────── */}
      {tab === 'program' && !loading && !error && totals && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label={`${yearLabel}: Budget`} value={`ETB ${fmtETB(totals.budget)}`} accent={TEAL} />
            <StatCard label={`${yearLabel}: Utilized`} value={`ETB ${fmtETB(totals.utilized)}`} accent={ORANGE} />
            <StatCard label={`${yearLabel}: Unutilized`} value={`ETB ${fmtETB(totals.unutilized)}`} accent={RED} />
            <StatCard label="% Utilized" value={fmtPct(totals.pctUtilized, 2)} accent={(totals.pctUtilized || 0) >= 50 ? GREEN : RED} />
            <StatCard label="% Unutilized" value={fmtPct(totals.pctUnutilized, 2)} accent={(totals.pctUnutilized || 0) > 50 ? RED : GREEN} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
              <h3 className="text-sm font-bold text-navy mb-3">Budget Categories Allocation</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={categories} dataKey="budget" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={1}>
                    {categories.map((c, i) => <Cell key={c.code} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 10 }} labelStyle={{ color: '#02404F', fontWeight: 700 }} itemStyle={{ color: '#02404F' }} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#6B7C93" }} layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
              <h3 className="text-sm font-bold text-navy mb-3">Budget Amount vs Unutilized</h3>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={categories} margin={{ top: 24, right: 8, left: 20, bottom: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} height={90} />
                  <YAxis tickFormatter={fmtETB} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 10 }} labelStyle={{ color: '#02404F', fontWeight: 700 }} itemStyle={{ color: '#02404F' }} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
                  <Bar dataKey="budget" name="Budget" fill={TEAL} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="unutilized" name="Unutilized" fill={RED} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <CategoryTable categories={categories} granularity="annually" periods={[]} budgetName={budgetName} selMonths={[]} team={team} intervention={intervention} />
        </>
      )}

      {/* ── Intervention View ─────────────────────────────────────────────────── */}
      {tab === 'intervention' && !loading && !error && totals && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-3">Budget by Category Description</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categories} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtETB} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={150} />
                <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 8 }} labelStyle={{ color: '#02404F', fontWeight: 700 }} itemStyle={{ color: '#02404F' }} />
                <Bar dataKey="budget" name="Budget" fill={TEAL} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-3">Budget and % Unutilized by Intervention</h3>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={interventions} margin={{ top: 24, right: 8, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="code" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} height={80} />
                <YAxis yAxisId="l" tickFormatter={fmtETB} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} labelStyle={{ color: '#02404F', fontWeight: 700 }} itemStyle={{ color: '#02404F' }} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
                <Bar yAxisId="l" dataKey="budget" name="Budget" fill={TEAL} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="r" dataKey="pctUnutilized" name="% Unutilized" fill={RED} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card xl:col-span-2">
            <h3 className="text-sm font-bold text-navy mb-3">Budget vs Unutilized by Intervention</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={interventions} margin={{ top: 24, right: 8, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="code" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} height={80} />
                <YAxis tickFormatter={fmtETB} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 8 }} labelStyle={{ color: '#02404F', fontWeight: 700 }} itemStyle={{ color: '#02404F' }} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
                <Bar dataKey="budget" name="Budget" fill={TEAL} radius={[3, 3, 0, 0]} />
                <Bar dataKey="unutilized" name="Unutilized" fill={RED} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Budget Activity — Annual Summary, vs Quarter and Monthly all merged into
          one table via the Monthly/Quarterly/Annually toggle (PeriodToggle, same
          control Corporate Budget Analysis's own chart uses) instead of three
          separate tabs. ─────────────────────────────────────────────────────────── */}
      {tab === 'activity' && !loading && !error && yearDetail && (
        <div className="space-y-3">
          <p className="text-xs font-extrabold text-muted uppercase tracking-wider">
            Budget vs Utilized — {activityGranularity === 'monthly' ? 'Monthly' : activityGranularity === 'quarterly' ? 'Quarterly' : 'Annual'}
          </p>
          <CategoryTable
            categories={categories} granularity={activityGranularity} periods={activityPeriods}
            budgetName={budgetName} selMonths={[]} team={team} intervention={intervention}
          />
        </div>
      )}

      {/* ── Program Activity vs Budget Intervention ──────────────────────────── */}
      {tab === 'int-budget' && !loading && !error && yearDetail && (
        <InterventionTable interventions={interventions} budgetName={budgetName} selMonths={[]} team={team} />
      )}
    </div>
  )
}
