import { Fragment, useEffect, useState } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'
import { fmtETB, fmtPct } from '../lib/fmt.js'
import { safeeBudget as safeeBudgetApi } from '../lib/api.js'
import { PeriodTree, usePeriodSelection } from '../components/PeriodFilterBar.jsx'

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

const BUDGET_YEARS = [
  { budgetName: '10',   label: 'Year 1' },
  { budgetName: '10.2', label: 'Year 2' },
  { budgetName: '10.3', label: 'Year 3' },
  { budgetName: '10.4', label: 'Year 4' },
  { budgetName: '10.5', label: 'Year 5' },
]

const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'program',      label: 'Program View' },
  { id: 'intervention', label: 'Intervention View' },
  { id: 'activity',     label: 'Budget Activity' },
  { id: 'annual',       label: 'Annual Summary' },
  { id: 'quarter',      label: 'vs Quarter' },
  { id: 'int-budget',   label: 'vs Intervention' },
]

const tooltipFmt = v => [`ETB ${fmtETB(v)}`, '']

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

// "Select Budget" Year 1-5 toggle — an explicit TEAL fill (not bg-navy) for the
// selected pill, rather than relying on index.css's dark-mode bg-white/bg-navy
// remapping for contrast: that remap turns bg-white into roughly the same dark navy
// the page background already is, which made an unselected "bg-white" pill and a
// selected "bg-navy" pill nearly indistinguishable from each other in dark mode.
// Each pill also shows its own budget period (start – end) once `years` loads, so
// it's clear what date range that year actually covers.
function BudgetYearPicker({ value, onChange, years }) {
  const byName = Object.fromEntries((years || []).map(y => [y.budgetName, y]))
  return (
    <div className="flex flex-wrap gap-2">
      {BUDGET_YEARS.map(y => {
        const info = byName[y.budgetName]
        const selected = y.budgetName === value
        return (
          <button
            key={y.budgetName}
            onClick={() => onChange(y.budgetName)}
            className="px-3 py-1.5 rounded-xl border text-left transition-colors"
            style={selected
              ? { background: TEAL, borderColor: TEAL, color: '#fff' }
              : { background: 'transparent', borderColor: '#6B7C9360', color: '#fff' }}
          >
            <span className="block text-xs font-extrabold">{y.label}</span>
            {info?.startLabel && (
              <span className="block text-[9px] opacity-80 whitespace-nowrap">{info.startLabel} – {info.endLabel}</span>
            )}
          </button>
        )
      })}
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
// % Unutilized) — the base table behind Budget Activity View / Annual Summary, and
// (with quarters=true) Program Activity vs Quarter Budgets Analysis. Categories start
// collapsed (just the group name + totals) and expand on click to reveal their lines —
// keeps the table scannable instead of dumping every line at once. In non-quarter mode,
// clicking a line's Utilized figure opens an inline panel with the real BC entries
// behind it (see CommitmentDrilldownPanel above).
function CategoryTable({ categories, quarters, showQuarters, budgetName, selMonths, team, intervention }) {
  const [expanded, setExpanded] = useState({})
  const [openDrill, setOpenDrill] = useState(null) // `${catCode}|${lineCode}` or null
  const toggleCategory = code => setExpanded(prev => ({ ...prev, [code]: !prev[code] }))
  const toggleDrill = key => setOpenDrill(prev => (prev === key ? null : key))

  const total = categories.reduce((s, c) => ({
    budget: s.budget + c.budget, utilized: s.utilized + c.utilized, unutilized: s.unutilized + c.unutilized
  }), { budget: 0, utilized: 0, unutilized: 0 })
  const totalPctUnutil = total.budget ? (total.unutilized / total.budget * 100) : null
  const colSpan = showQuarters ? 1 + quarters.length * 4 : 5

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={showQuarters ? { minWidth: 1100 } : undefined}>
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider sticky left-0 bg-bg">Category Description</th>
              {!showQuarters ? (
                <>
                  <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Budget</th>
                  <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Utilized</th>
                  <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">Unutilized</th>
                  <th className="text-right px-4 py-2.5 font-extrabold text-muted uppercase tracking-wider">% Unutilized</th>
                </>
              ) : (
                quarters.map(q => (
                  <th key={q.q} colSpan={4} className="text-center px-2 py-2.5 font-extrabold text-muted uppercase tracking-wider border-l border-border">{q.label}</th>
                ))
              )}
            </tr>
            {showQuarters && (
              <tr className="border-b border-border bg-bg">
                <th className="sticky left-0 bg-bg" />
                {quarters.map(q => (
                  <Fragment key={q.q}>
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
                key={cat.code} cat={cat} showQuarters={showQuarters} quarters={quarters}
                expanded={!!expanded[cat.code]} onToggleCategory={() => toggleCategory(cat.code)}
                openDrill={openDrill} onToggleDrill={toggleDrill} colSpan={colSpan}
                budgetName={budgetName} selMonths={selMonths} team={team} intervention={intervention}
              />
            ))}
            <tr className="border-t-2 border-border font-extrabold bg-bg">
              <td className="px-4 py-2 text-navy sticky left-0 bg-bg">Total</td>
              {!showQuarters ? (
                <>
                  <td className="px-4 py-2 text-right text-navy">{fmtETB(total.budget)}</td>
                  <td className="px-4 py-2 text-right text-navy">{fmtETB(total.utilized)}</td>
                  <td className="px-4 py-2 text-right text-navy">{fmtETB(total.unutilized)}</td>
                  <td className="px-4 py-2 text-right text-navy">{fmtPct(totalPctUnutil, 1)}</td>
                </>
              ) : quarters.map(q => {
                const agg = categories.reduce((s, c) => {
                  const cq = c.lines.reduce((ss, l) => {
                    const lq = l.byQuarter.find(x => x.q === q.q) || { budget: 0, utilized: 0, unutilized: 0 }
                    return { budget: ss.budget + lq.budget, utilized: ss.utilized + lq.utilized, unutilized: ss.unutilized + lq.unutilized }
                  }, { budget: 0, utilized: 0, unutilized: 0 })
                  return { budget: s.budget + cq.budget, utilized: s.utilized + cq.utilized, unutilized: s.unutilized + cq.unutilized }
                }, { budget: 0, utilized: 0, unutilized: 0 })
                const pct = agg.budget ? (agg.unutilized / agg.budget * 100) : null
                return (
                  <Fragment key={q.q}>
                    <td className="px-2 py-2 text-right text-navy border-l border-border">{fmtETB(agg.budget)}</td>
                    <td className="px-2 py-2 text-right text-navy">{fmtETB(agg.utilized)}</td>
                    <td className="px-2 py-2 text-right text-navy">{fmtETB(agg.unutilized)}</td>
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

function CategoryRows({ cat, showQuarters, quarters, expanded, onToggleCategory, openDrill, onToggleDrill, colSpan, budgetName, selMonths, team, intervention }) {
  // Same section/zebra-stripe palette as HR Analysis's own tables (SEC_BG/ROW_BG,
  // HRPageReview.jsx) — an explicit dark-navy background (not a translucent tint) so
  // the sticky first column reads identically to the rest of the row at any scroll
  // position, and the table matches HR Analysis's look rather than its own one-off tint.
  const secBg = { background: expanded ? SEC_BG.open : SEC_BG.closed }
  const canDrill = !showQuarters && budgetName
  // vs Quarter's category summary row used to render a single blank cell here — every
  // figure was only visible once a category was expanded down to its lines. Roll the
  // lines' own per-quarter figures up to the category level so the collapsed row shows
  // real numbers too, same as the non-quarter table already does.
  const catByQuarter = showQuarters && quarters
    ? quarters.map(q => {
        const agg = cat.lines.reduce((s, l) => {
          const lq = l.byQuarter.find(x => x.q === q.q) || { budget: 0, utilized: 0, unutilized: 0 }
          return { budget: s.budget + lq.budget, utilized: s.utilized + lq.utilized, unutilized: s.unutilized + lq.unutilized }
        }, { budget: 0, utilized: 0, unutilized: 0 })
        return { q: q.q, ...agg, pctUnutilized: agg.budget ? (agg.unutilized / agg.budget * 100) : null }
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
        {!showQuarters ? (
          <>
            <td className="px-4 py-1.5 text-right font-extrabold text-navy">{fmtETB(cat.budget)}</td>
            <td className="px-4 py-1.5 text-right font-extrabold text-navy">{fmtETB(cat.utilized)}</td>
            <td className="px-4 py-1.5 text-right font-extrabold text-navy">{fmtETB(cat.unutilized)}</td>
            <td className="px-4 py-1.5 text-right font-extrabold text-navy">{fmtPct(cat.pctUnutilized, 1)}</td>
          </>
        ) : catByQuarter.map(q => (
          <Fragment key={q.q}>
            <td className="px-2 py-1.5 text-right font-extrabold text-navy border-l border-border">{fmtETB(q.budget)}</td>
            <td className="px-2 py-1.5 text-right font-extrabold text-navy">{fmtETB(q.utilized)}</td>
            <td className="px-2 py-1.5 text-right font-extrabold text-navy">{fmtETB(q.unutilized)}</td>
            <td className="px-2 py-1.5 text-right font-extrabold text-navy">{fmtPct(q.pctUnutilized, 1)}</td>
          </Fragment>
        ))}
      </tr>
      {expanded && cat.lines.map((line, i) => {
        const drillKey = `${cat.code}|${line.code}`
        const drillOpen = openDrill === drillKey
        const rowBg = { background: i % 2 === 0 ? ROW_BG.even : ROW_BG.odd }
        return (
          <Fragment key={line.code}>
            <tr style={rowBg}>
              <td className="px-4 py-1.5 pl-8 text-navy sticky left-0" style={rowBg}>{line.code}: {line.name}</td>
              {!showQuarters ? (
                <>
                  <td className="px-4 py-1.5 text-right text-navy">{fmtETB(line.budget)}</td>
                  <td
                    className={`px-4 py-1.5 text-right text-navy ${canDrill ? 'underline decoration-dotted cursor-pointer hover:text-teal-400' : ''}`}
                    onClick={canDrill ? (e) => { e.stopPropagation(); onToggleDrill(drillKey) } : undefined}
                    title={canDrill ? 'Click to see the Business Central entries behind this figure' : undefined}
                  >
                    {fmtETB(line.utilized)}
                  </td>
                  <td className="px-4 py-1.5 text-right text-navy">{fmtETB(line.unutilized)}</td>
                  <td className="px-4 py-1.5 text-right" style={{ color: (line.pctUnutilized || 0) > 50 ? RED : GREEN }}>{fmtPct(line.pctUnutilized, 1)}</td>
                </>
              ) : line.byQuarter.map(q => (
                <Fragment key={q.q}>
                  <td className="px-2 py-1.5 text-right text-navy border-l border-border">{fmtETB(q.budget)}</td>
                  <td className="px-2 py-1.5 text-right text-navy">{fmtETB(q.utilized)}</td>
                  <td className="px-2 py-1.5 text-right text-navy">{fmtETB(q.unutilized)}</td>
                  <td className="px-2 py-1.5 text-right text-navy">{fmtPct(q.pctUnutilized, 1)}</td>
                </Fragment>
              ))}
            </tr>
            {drillOpen && (
              <CommitmentDrilldownPanel
                colSpan={colSpan} label={`${line.code}: ${line.name}`}
                budgetName={budgetName} catCode={cat.code} lineCode={line.code}
                selMonths={selMonths} team={team} intervention={intervention}
                onClose={() => onToggleDrill(drillKey)}
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
                  <td className="px-4 py-2 text-right text-navy">{fmtETB(i.budget)}</td>
                  <td
                    className={`px-4 py-2 text-right text-navy ${budgetName ? 'underline decoration-dotted cursor-pointer hover:text-teal-400' : ''}`}
                    onClick={budgetName ? () => setOpenIntervention(open ? null : i.code) : undefined}
                    title={budgetName ? 'Click to see the Business Central entries behind this figure' : undefined}
                  >
                    {fmtETB(i.utilized)}
                  </td>
                  <td className="px-4 py-2 text-right text-navy">{fmtETB(i.unutilized)}</td>
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
            <td className="px-4 py-2 text-right text-navy">{fmtETB(total.budget)}</td>
            <td className="px-4 py-2 text-right text-navy">{fmtETB(total.utilized)}</td>
            <td className="px-4 py-2 text-right text-navy">{fmtETB(total.unutilized)}</td>
            <td className="px-4 py-2 text-right text-navy">{fmtPct(total.budget ? total.unutilized / total.budget * 100 : null, 1)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function SafeeBudget() {
  const [budgetName, setBudgetName] = useState('10.3')
  const [tab, setTab] = useState('overview')
  const [team, setTeam] = useState('')
  const [intervention, setIntervention] = useState('')

  const [yearDetail, setYearDetail] = useState(null)
  const [overview, setOverview]     = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  // Filter by Period — same PeriodTree/usePeriodSelection Financial Performance uses.
  // mData reflects the currently selected budget year's own real calendar months; its
  // selMonths (plain 0-based indices) are re-applied relative to WHATEVER year(s) a
  // given tab is summing — each SAFEE budget year runs its own ~12-month cycle
  // starting on a different calendar month, so "the Nth month" is necessarily relative
  // rather than a shared calendar date. Reset whenever the selected year changes, since
  // last year's indices may not be meaningful for the new one.
  const mData = (yearDetail?.months || []).map(m => ({ label: m.label }))
  const sel = usePeriodSelection(mData)
  const selMonthsKey = sel.selMonths.join(',')

  useEffect(() => { sel.setSelMonths([]) }, [budgetName]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    safeeBudgetApi.year(budgetName, sel.selMonths, team, intervention)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || 'Failed to load.'))))
      .then(j => { if (!cancelled) setYearDetail(j) })
      .catch(e => { if (!cancelled) setError(e.message || 'Failed to load SAFEE budget data.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [budgetName, selMonthsKey, team, intervention]) // eslint-disable-line react-hooks/exhaustive-deps

  // All-5-years payload — fetched regardless of which tab is active (not just
  // Overview) since the "Select Budget" picker shows every year's own date range too.
  useEffect(() => {
    let cancelled = false
    safeeBudgetApi.overview(sel.selMonths)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load.')))
      .then(j => { if (!cancelled) setOverview(j) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selMonthsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const years = overview?.years || []
  const overviewChartData = years.map(y => ({
    label: y.label, Budget: y.budget, 'Total Budget': overview?.totalBudget || 0,
    Utilized: y.utilized, Unutilized: y.unutilized,
  }))

  const categories = yearDetail?.categories || []
  const interventions = yearDetail?.interventions || []
  const quarters = yearDetail?.quarters || []
  const totals = yearDetail?.totals

  const yearLabel = BUDGET_YEARS.find(y => y.budgetName === budgetName)?.label || budgetName

  return (
    <div className="space-y-5">
      {/* Header row: title + Select Budget (left/middle), Filter by Period (right) */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">SAFEE Budget Analysis</h2>
          <p className="text-xs text-muted font-medium">Programme budget vs. utilization · source: Business Central</p>
        </div>
        {mData.length > 0 && (
          <div className="ml-auto">
            <PeriodTree mData={mData} selected={sel.selMonths} onChange={sel.setSelMonths} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BudgetYearPicker value={budgetName} onChange={setBudgetName} years={overview?.years} />
        {sel.selMonths.length > 0 && (
          <button
            onClick={() => sel.setSelMonths([])}
            className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-navy hover:border-navy transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Tabs */}
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
            <StatCard label="Total Budget" value={`ETB ${fmtETB(overview.totalBudget)}`} accent={ORANGE} />
            <StatCard label="Total Utilized" value={`ETB ${fmtETB(overview.totalUtilized)}`} accent={TEAL} />
            <StatCard label="Total Unutilized" value={`ETB ${fmtETB(overview.totalUnutilized)}`} accent={NAVY} />
            <StatCard label="% Utilized" value={overview.pctUtilized != null ? `${overview.pctUtilized.toFixed(2)}%` : '—'} accent={(overview.pctUtilized || 0) >= 50 ? GREEN : RED} />
            <StatCard label="% Unutilized" value={overview.pctUnutilized != null ? `${overview.pctUnutilized.toFixed(2)}%` : '—'} accent={(overview.pctUnutilized || 0) > 50 ? RED : GREEN} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {[
              { title: '5 Year Budget vs Yearly Budget', key: 'Budget', ref: 'Total Budget', color: TEAL },
              { title: '5 Year Budget vs Yearly Utilized', key: 'Utilized', ref: 'Budget', color: TEAL },
              { title: '5 Year Budget vs Yearly Unutilized', key: 'Unutilized', ref: 'Budget', color: NAVY },
            ].map(chart => (
              <div key={chart.title} className="bg-white rounded-2xl border border-border p-5 shadow-card">
                <h3 className="text-sm font-bold text-navy mb-3">{chart.title}</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={overviewChartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtETB} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E3E9F2' }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
                    <Bar dataKey={chart.ref} fill={`${ORANGE}40`} radius={[3, 3, 0, 0]} />
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
            <StatCard label={`${yearLabel}: Budget`} value={`ETB ${fmtETB(totals.budget)}`} accent={ORANGE} />
            <StatCard label={`${yearLabel}: Utilized`} value={`ETB ${fmtETB(totals.utilized)}`} accent={TEAL} />
            <StatCard label={`${yearLabel}: Unutilized`} value={`ETB ${fmtETB(totals.unutilized)}`} accent={NAVY} />
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
                  <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#6B7C93" }} layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
              <h3 className="text-sm font-bold text-navy mb-3">Budget Amount vs Unutilized</h3>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={categories} margin={{ top: 24, right: 8, left: -10, bottom: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} height={90} />
                  <YAxis tickFormatter={fmtETB} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
                  <Bar dataKey="budget" name="Budget" fill={ORANGE} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="unutilized" name="Unutilized" fill={RED} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <CategoryTable categories={categories} budgetName={budgetName} selMonths={sel.selMonths} team={team} intervention={intervention} />
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
                <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="budget" name="Budget" fill={TEAL} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-3">Budget and % Unutilized by Intervention</h3>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={interventions} margin={{ top: 24, right: 8, left: -10, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="code" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} height={80} />
                <YAxis yAxisId="l" tickFormatter={fmtETB} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
                <Bar yAxisId="l" dataKey="budget" name="Budget" fill={ORANGE} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="r" dataKey="pctUnutilized" name="% Unutilized" fill={RED} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card xl:col-span-2">
            <h3 className="text-sm font-bold text-navy mb-3">Budget vs Unutilized by Intervention</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={interventions} margin={{ top: 24, right: 8, left: -10, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" vertical={false} />
                <XAxis dataKey="code" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} height={80} />
                <YAxis tickFormatter={fmtETB} tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, color: "#6B7C93" }} />
                <Bar dataKey="budget" name="Budget" fill={ORANGE} radius={[3, 3, 0, 0]} />
                <Bar dataKey="unutilized" name="Unutilized" fill={RED} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Budget Activity View ──────────────────────────────────────────────── */}
      {tab === 'activity' && !loading && !error && yearDetail && (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          <div className="bg-white rounded-2xl border border-border shadow-card p-4 flex flex-col gap-4 w-full lg:w-56 flex-shrink-0">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-2">Filters</p>
              <label className="flex flex-col gap-1 mb-3">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Program Filter</span>
                <select value={team} onChange={e => setTeam(e.target.value)} className="text-xs font-bold border border-border rounded-lg px-2.5 py-1.5 bg-bg text-navy outline-none focus:border-navy">
                  <option value="">All</option>
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
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Intervention Filter</span>
                <select value={intervention} onChange={e => setIntervention(e.target.value)} className="text-xs font-bold border border-border rounded-lg px-2.5 py-1.5 bg-bg text-navy outline-none focus:border-navy">
                  <option value="">All</option>
                  {yearDetail.filters.interventions.map(i => <option key={i.code} value={i.code}>{i.name}</option>)}
                </select>
              </label>
            </div>
            {(team || intervention) && (
              <button onClick={() => { setTeam(''); setIntervention('') }} className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-navy hover:border-navy transition-colors">
                Clear filters
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <CategoryTable categories={categories} budgetName={budgetName} selMonths={sel.selMonths} team={team} intervention={intervention} />
          </div>
        </div>
      )}

      {/* ── Program Activity Annual Budget Summary ───────────────────────────── */}
      {tab === 'annual' && !loading && !error && yearDetail && (
        <CategoryTable categories={categories} budgetName={budgetName} selMonths={sel.selMonths} team={team} intervention={intervention} />
      )}

      {/* ── Program Activity vs Quarter Budgets Analysis ─────────────────────── */}
      {tab === 'quarter' && !loading && !error && yearDetail && (
        <CategoryTable categories={categories} quarters={quarters} showQuarters budgetName={budgetName} selMonths={sel.selMonths} team={team} intervention={intervention} />
      )}

      {/* ── Program Activity vs Budget Intervention ──────────────────────────── */}
      {tab === 'int-budget' && !loading && !error && yearDetail && (
        <InterventionTable interventions={interventions} budgetName={budgetName} selMonths={sel.selMonths} team={team} />
      )}
    </div>
  )
}
