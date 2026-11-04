import { useEffect, useRef, useState } from 'react'

const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']

// Parses a month label ("January 2025", or a bare "Jan" with no year — Corporate
// Budget's labels carry no year since its 12 months are always one budget cycle) into
// its calendar month index (0-11) and year (string, or null when absent).
function parseMonthLabel(label) {
  const parts = String(label || '').trim().split(/\s+/)
  const mi = MONTH_NAMES.indexOf((parts[0] || '').slice(0, 3).toLowerCase())
  const year = parts[1] && /^\d{4}$/.test(parts[1]) ? parts[1] : null
  return mi < 0 ? null : { mi, year }
}

// Groups mData's month indices into real calendar quarters (Jan-Mar/Apr-Jun/Jul-Sep/
// Oct-Dec of a given year), not sequential chunks of 3 — a rolling multi-year window
// (e.g. Balance Sheet's 24 trailing months) doesn't start on a quarter boundary, so
// chunking by position would mislabel e.g. "Nov/Dec/Jan" as a single quarter. Grouping
// by each month's own real quarter+year instead means a quarter at either edge of the
// window can hold 1-3 months (a true partial quarter), same as real financial
// reporting. Labels without a year (Corporate Budget's bare "Jan".."Dec") are assumed
// to already be one calendar year in order, so they still land one group per quarter.
// Returned groups are in chronological order; each carries an `anchor` (its first month
// index) used as its stable identifier wherever a plain "quarter index" was used before.
function quarterGroups(mData) {
  const groups = new Map()
  mData.forEach((m, i) => {
    const parsed = parseMonthLabel(m.label)
    if (!parsed) return
    const q = Math.floor(parsed.mi / 3)
    const key = `${parsed.year ?? '_'}-${q}`
    if (!groups.has(key)) groups.set(key, { q, year: parsed.year, months: [] })
    groups.get(key).months.push(i)
  })
  return [...groups.values()]
    .sort((a, b) => a.months[0] - b.months[0])
    .map(g => ({ ...g, anchor: g.months[0], label: `Q${g.q + 1}${g.year ? ` ${g.year}` : ''}` }))
}

function quarterGroupByAnchor(mData, anchor) {
  return quarterGroups(mData).find(g => g.anchor === anchor) || null
}

// Splits a plain "Month Year" label (e.g. "January 2025") into its two parts so a
// single-month selection can be displayed as separate Month / Year fields — the same
// visual format as the People & Culture / HR Analysis filter bar — while the control
// underneath stays this same tree dropdown (YTD/quarter/multi-month selection and
// Compare To still work; only a true single-month label has a clean split, so a
// quarter/YTD/multi-month summary just falls back to showing its own text).
function splitMonthYear(label) {
  const m = /^(\D+?)\s+(\d{4})$/.exec(label || '')
  return m ? [m[1], m[2]] : null
}

// Renders a dropdown trigger's label as two visually separated fields (Month | Year)
// when it cleanly splits, otherwise falls back to the plain summary text.
function SplitLabel({ label }) {
  const parts = splitMonthYear(label)
  if (!parts) return <span className="truncate">{label}</span>
  return (
    <span className="flex items-center gap-2 min-w-0 flex-1">
      <span className="truncate">{parts[0]}</span>
      <span className="w-px self-stretch bg-border flex-shrink-0" />
      <span className="flex-shrink-0">{parts[1]}</span>
    </span>
  )
}

// Hierarchical Quarter → Month checkbox tree, matching the ERP's own "Filter By
// Period" slicer: each quarter has its own checkbox (checked/unchecked/indeterminate
// depending on how many of its months are selected) plus an expand/collapse arrow to
// reveal its 3 months individually. Checking a quarter selects/clears all of its
// months at once; checking one month just toggles that month. Operates purely on month
// indices (`selected`/`onChange` are the same selMonths state everything else reads),
// so a quarter is a selection shortcut, not a separate filter dimension. Originally
// built for Financial Performance — shared here (with usePeriodSelection below) so any
// page can opt into the exact same YTD/Quarter/Month + Compare To UI via the Admin
// page's "Period Filter — Pages" toggle, without re-implementing this logic each time.
// `yearFilter`, when given, only shows quarters belonging to that year — a purely visual
// narrowing (quarterGroups already tags each group with its real calendar year) that lets
// a page add a Year dropdown in front of this tree, Procurement-style, for a page whose
// mData spans multiple years (e.g. Balance Sheet's 24-month rolling window), WITHOUT
// renumbering month indices: `selected`/`onChange` still refer to positions in the full
// mData array exactly as before, so cross-year Compare To lookups (a January comparing
// against the prior December) keep working unchanged. The "YTD (all)" option is left
// alone too — what emptying the selection means for a year-scoped page is the calling
// page's own choice to interpret, not this component's.
export function PeriodTree({ mData, selected, onChange, yearFilter }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())
  const ref = useRef(null)

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Real calendar-quarter buckets (Q1/Q2/Q3/Q4, labeled with a year when mData's labels
  // carry one) rather than sequential chunks of 3 — see quarterGroups' own comment for
  // why that distinction matters once mData spans more than one calendar year (Balance
  // Sheet's 24-month rolling window).
  const allQuartersInTree = quarterGroups(mData).map(g => {
    const checkedCount = g.months.filter(i => selected.includes(i)).length
    return { ...g, state: checkedCount === 0 ? 'none' : checkedCount === g.months.length ? 'all' : 'partial' }
  })
  const quarters = yearFilter ? allQuartersInTree.filter(qt => qt.year === String(yearFilter)) : allQuartersInTree

  const toggleMonth = (i) => onChange(selected.includes(i) ? selected.filter(v => v !== i) : [...selected, i])
  const toggleQuarter = (qt) => onChange(qt.state === 'all'
    ? selected.filter(v => !qt.months.includes(v))
    : [...new Set([...selected, ...qt.months])])
  const toggleExpanded = (anchor) => setExpanded(cur => {
    const next = new Set(cur)
    next.has(anchor) ? next.delete(anchor) : next.add(anchor)
    return next
  })

  // months.length > 1 guards against a quarter that happens to span just one month at
  // the edge of a rolling window (e.g. "Q4 2026" holding only October so far) — picking
  // that one month should read as "October 2026", not as a misleadingly quarter-labeled
  // single month.
  const fullQuarterMatch = quarters.find(qt => qt.state === 'all' && qt.months.length === selected.length && qt.months.length > 1)
  const summary = selected.length === 0 ? 'YTD'
    : fullQuarterMatch ? fullQuarterMatch.label
    : selected.length === 1 ? mData[selected[0]]?.label
    : `${selected.length} months`

  return (
    <div ref={ref} className="relative flex flex-col gap-1" style={{ minWidth: 170 }}>
      <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Filter by Period</span>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between gap-2 bg-white border border-border rounded-xl px-3 py-2 text-xs font-bold text-navy"
      >
        <SplitLabel label={summary} />
        <span className="text-muted text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-border rounded-xl shadow-card z-20 py-1.5 max-h-80 overflow-y-auto">
          <button
            onClick={() => onChange([])}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold text-navy hover:bg-[#F0F7F6]"
          >
            YTD (all) {selected.length === 0 && <span>✓</span>}
          </button>
          <div className="border-t border-border my-1" />
          {quarters.map(qt => (
            <div key={qt.anchor}>
              <div className="flex items-center gap-1 px-1.5 py-1 hover:bg-[#F0F7F6]">
                <button
                  onClick={() => toggleExpanded(qt.anchor)}
                  className="w-5 h-5 flex items-center justify-center text-muted flex-shrink-0"
                >
                  {expanded.has(qt.anchor) ? '−' : '+'}
                </button>
                <label className="flex items-center gap-2 flex-1 px-1.5 py-0.5 text-xs font-bold text-navy cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qt.state === 'all'}
                    ref={el => { if (el) el.indeterminate = qt.state === 'partial' }}
                    onChange={() => toggleQuarter(qt)}
                    className="w-3.5 h-3.5 flex-shrink-0"
                  />
                  {qt.label}
                </label>
              </div>
              {expanded.has(qt.anchor) && (
                <div className="pl-9">
                  {qt.months.map(i => (
                    <label key={i} className="flex items-center gap-2 px-1.5 py-1 text-xs text-navy hover:bg-[#F0F7F6] cursor-pointer">
                      <input type="checkbox" checked={selected.includes(i)} onChange={() => toggleMonth(i)} className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{mData[i]?.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Explicit MoM/QoQ baseline picker — only rendered once the period filter has
// narrowed to a single month or a single full quarter (see usePeriodSelection's
// `compareMode` below), since that's the only case where "compare to" has one
// consistent granularity of options to offer. Picking nothing keeps the default
// of comparing against the immediately preceding month/quarter.
export function ComparePicker({ mode, mData, current, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Quarter options/values are identified by their anchor (first month index) rather
  // than a sequential quarter number — see quarterGroups' own comment.
  const allQuarters = quarterGroups(mData)
  const currentQIdx = mode === 'quarter' ? allQuarters.findIndex(g => g.anchor === current) : -1
  const options = mode === 'month'
    ? mData.map((m, i) => ({ value: i, label: m.label })).filter(o => o.value !== current)
    : allQuarters
        .map(g => ({ value: g.anchor, label: g.label, months: g.months }))
        .filter(o => o.value !== current)

  const autoLabel = mode === 'month'
    ? (current > 0 ? mData[current - 1]?.label : null)
    : (currentQIdx > 0 ? allQuarters[currentQIdx - 1]?.label : null)

  const summary = value != null
    ? (mode === 'month' ? mData[value]?.label : allQuarters.find(g => g.anchor === value)?.label)
    : autoLabel ? `Auto (${autoLabel})` : 'Auto (none)'

  return (
    <div ref={ref} className="relative flex flex-col gap-1" style={{ minWidth: 150 }}>
      <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Compare To</span>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between gap-2 bg-white border border-border rounded-xl px-3 py-2 text-xs font-bold text-navy"
      >
        <SplitLabel label={summary} />
        <span className="text-muted text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-border rounded-xl shadow-card z-20 py-1.5 max-h-72 overflow-y-auto">
          <button
            onClick={() => { onChange(null); setOpen(false) }}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold text-navy hover:bg-[#F0F7F6]"
          >
            <span className="truncate">{autoLabel ? `Auto (${autoLabel})` : 'Auto (none)'}</span>
            {value == null && <span>✓</span>}
          </button>
          <div className="border-t border-border my-1" />
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-navy hover:bg-[#F0F7F6]"
            >
              <span className="truncate">{o.label}</span>
              {value === o.value && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// All the period-selection derived state Financial Performance already worked out —
// factored out so any page can get YTD/Quarter/Month + Compare To behavior for free by
// calling this against its own `mData` (an array of { label, ...whatever that page
// needs }, one entry per month, oldest first) instead of re-deriving singleMonth/
// singleQuarterIdx/compareMode/priorMonths itself.
export function usePeriodSelection(mData) {
  const [selMonths, setSelMonths] = useState([]) // [] = YTD/all
  const [compareIdx, setCompareIdx] = useState(null) // explicit baseline the user picked

  const singleMonth = selMonths.length === 1 ? selMonths[0] : null
  // Identified by its anchor (first month index), not a sequential quarter number —
  // see quarterGroups' own comment for why (a rolling multi-year window's quarters
  // don't start at the same position every year).
  const allQuarters = quarterGroups(mData)
  // months.length > 1 guards against a quarter edge-case that holds just one month so
  // far (e.g. "Q4 2026" = October only) — that should behave as a single-month pick
  // (MoM Compare To, "October 2026" labeling), not a quarter one.
  const matchedQuarter = allQuarters.find(g =>
    g.months.length > 1 && g.months.length === selMonths.length && g.months.every(i => selMonths.includes(i)))
  const singleQuarterIdx = matchedQuarter ? matchedQuarter.anchor : null
  const quarterMonthIdxs = (anchor) => quarterGroupByAnchor(mData, anchor)?.months || []
  const fullQuarterLabel = matchedQuarter ? matchedQuarter.label : null

  const compareMode = singleMonth != null ? 'month' : singleQuarterIdx != null ? 'quarter' : null
  useEffect(() => { setCompareIdx(null) }, [compareMode])

  const effectiveCompareIdx =
    compareMode === 'month'   && compareIdx !== singleMonth      ? compareIdx
    : compareMode === 'quarter' && compareIdx !== singleQuarterIdx ? compareIdx
    : null

  // The quarter immediately before the selected one, chronologically — not "anchor - 3"
  // (anchors aren't sequential across a rolling multi-year window).
  const prevQuarterGroup = (() => {
    if (singleQuarterIdx == null) return null
    const idx = allQuarters.findIndex(g => g.anchor === singleQuarterIdx)
    return idx > 0 ? allQuarters[idx - 1] : null
  })()

  const priorMonths =
    compareMode === 'month'   && effectiveCompareIdx != null ? [effectiveCompareIdx]
    : compareMode === 'quarter' && effectiveCompareIdx != null ? quarterMonthIdxs(effectiveCompareIdx)
    : singleMonth != null ? (singleMonth > 0 ? [singleMonth - 1] : null)
    : singleQuarterIdx != null ? (prevQuarterGroup ? prevQuarterGroup.months : null)
    : null

  const priorLabel =
    compareMode === 'month'   && effectiveCompareIdx != null ? mData[effectiveCompareIdx]?.label
    : compareMode === 'quarter' && effectiveCompareIdx != null ? quarterGroupByAnchor(mData, effectiveCompareIdx)?.label
    : singleMonth != null ? (priorMonths ? mData[priorMonths[0]]?.label : null)
    : singleQuarterIdx != null ? (prevQuarterGroup ? prevQuarterGroup.label : null)
    : null

  const periodLabel = selMonths.length === 0
    ? 'YTD'
    : fullQuarterLabel || selMonths.map(i => mData[i]?.label).filter(Boolean).join(', ')

  const clearPeriod = () => { setSelMonths([]); setCompareIdx(null) }

  return {
    selMonths, setSelMonths, compareIdx, setCompareIdx,
    singleMonth, singleQuarterIdx, fullQuarterLabel, compareMode,
    effectiveCompareIdx, priorMonths, priorLabel, periodLabel, clearPeriod
  }
}

// The two pickers side by side, wired to a usePeriodSelection() result — the common case
// for a page that just wants the standard bar with no extra filters alongside it.
export default function PeriodFilterBar({ sel, mData }) {
  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <PeriodTree mData={mData} selected={sel.selMonths} onChange={sel.setSelMonths} />
      {sel.compareMode && (
        <ComparePicker
          mode={sel.compareMode}
          mData={mData}
          current={sel.compareMode === 'month' ? sel.singleMonth : sel.singleQuarterIdx}
          value={sel.effectiveCompareIdx}
          onChange={sel.setCompareIdx}
        />
      )}
    </div>
  )
}

// Which calendar years mData's labels actually cover, newest first — used to populate a
// Year dropdown for a page whose mData is a rolling multi-year window (Balance Sheet) with
// no fixed, caller-known year range of its own (unlike Procurement's procYearOptions,
// which can offer any year back to 2024 since its raw rows aren't bounded to a window).
export function yearsFromMonthData(mData) {
  const years = new Set()
  mData.forEach(m => { const p = parseMonthLabel(m.label); if (p?.year) years.add(p.year) })
  return [...years].sort((a, b) => b - a)
}

// Procurement-style "Year, then Filter by Period within it" layout for a page whose mData
// spans multiple years — same two controls as PeriodFilterBar above, just with a Year
// dropdown in front that narrows which quarters PeriodTree shows (see PeriodTree's
// `yearFilter`). Index semantics are untouched (see PeriodTree's comment), so the calling
// page decides what an empty selection means for a non-live year — see YearPeriodFilterBar
// callers for how Balance Sheet resolves that ("YTD" for the live year, latest month of
// that year otherwise).
export function YearPeriodFilterBar({ sel, mData, year, years, onYearChange, onClear }) {
  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <div className="flex flex-col gap-1" style={{ minWidth: 100 }}>
        <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Year</span>
        <select
          value={year}
          onChange={e => onYearChange(e.target.value)}
          className="bg-white border border-border rounded-xl px-3 py-2 text-xs font-bold text-navy outline-none"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <PeriodTree mData={mData} selected={sel.selMonths} onChange={sel.setSelMonths} yearFilter={year} />
      {sel.compareMode && (
        <ComparePicker
          mode={sel.compareMode}
          mData={mData}
          current={sel.compareMode === 'month' ? sel.singleMonth : sel.singleQuarterIdx}
          value={sel.effectiveCompareIdx}
          onChange={sel.setCompareIdx}
        />
      )}
      {onClear && (
        <button
          onClick={onClear}
          className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-navy hover:border-navy transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
