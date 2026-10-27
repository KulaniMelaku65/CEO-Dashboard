import { useEffect, useRef, useState } from 'react'

// "Qtr N" only means something for a calendar-aligned year (N=1 is always Jan-Mar).
// A rolling multi-year window (e.g. Balance Sheet's 24 trailing months) has no such
// fixed alignment, so every quarter bucket is labeled by the real months it spans
// instead — e.g. "May – Jul 2026", or just "Jul 2026" for a single-month bucket at
// the array's edge. Falls back to a bare month label when the quarter is a single month.
function quarterLabel(mData, monthIdxs) {
  if (!monthIdxs?.length) return ''
  const first = mData[monthIdxs[0]]?.label
  const last  = mData[monthIdxs[monthIdxs.length - 1]]?.label
  if (!first) return ''
  if (!last || first === last) return first
  const firstMonthOnly = first.split(' ')[0]?.slice(0, 3)
  return `${firstMonthOnly} – ${last}`
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
export function PeriodTree({ mData, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())
  const ref = useRef(null)

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Quarter count follows mData's own length rather than a hardcoded 4 — Financial
  // Performance's mData is exactly one calendar year (4 quarters, unchanged behavior
  // here), but a page like Balance Sheet carries a 24-month rolling window (for
  // year-over-year comparisons via ComparePicker below), and every quarter in it needs
  // to stay reachable here too, not just the most recent 4.
  const quarterCount = Math.max(4, Math.ceil(mData.length / 3))
  const quarters = Array.from({ length: quarterCount }, (_, q) => q).map(q => {
    const months = [q * 3, q * 3 + 1, q * 3 + 2].filter(i => i < mData.length)
    const checkedCount = months.filter(i => selected.includes(i)).length
    return { q, months, state: months.length === 0 ? 'empty' : checkedCount === 0 ? 'none' : checkedCount === months.length ? 'all' : 'partial' }
  }).filter(qt => qt.months.length > 0)

  const toggleMonth = (i) => onChange(selected.includes(i) ? selected.filter(v => v !== i) : [...selected, i])
  const toggleQuarter = (qt) => onChange(qt.state === 'all'
    ? selected.filter(v => !qt.months.includes(v))
    : [...new Set([...selected, ...qt.months])])
  const toggleExpanded = (q) => setExpanded(cur => {
    const next = new Set(cur)
    next.has(q) ? next.delete(q) : next.add(q)
    return next
  })

  const fullQuarterMatch = quarters.find(qt => qt.state === 'all' && qt.months.length === 3 && selected.length === 3)
  const summary = selected.length === 0 ? 'YTD'
    : fullQuarterMatch ? quarterLabel(mData, fullQuarterMatch.months)
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
            <div key={qt.q}>
              <div className="flex items-center gap-1 px-1.5 py-1 hover:bg-[#F0F7F6]">
                <button
                  onClick={() => toggleExpanded(qt.q)}
                  className="w-5 h-5 flex items-center justify-center text-muted flex-shrink-0"
                >
                  {expanded.has(qt.q) ? '−' : '+'}
                </button>
                <label className="flex items-center gap-2 flex-1 px-1.5 py-0.5 text-xs font-bold text-navy cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qt.state === 'all'}
                    ref={el => { if (el) el.indeterminate = qt.state === 'partial' }}
                    onChange={() => toggleQuarter(qt)}
                    className="w-3.5 h-3.5 flex-shrink-0"
                  />
                  {quarterLabel(mData, qt.months)}
                </label>
              </div>
              {expanded.has(qt.q) && (
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

  const quarterCount = Math.max(4, Math.ceil(mData.length / 3))
  const quarterMonths = (q) => [q * 3, q * 3 + 1, q * 3 + 2].filter(i => i < mData.length)
  const options = mode === 'month'
    ? mData.map((m, i) => ({ value: i, label: m.label })).filter(o => o.value !== current)
    : Array.from({ length: quarterCount }, (_, q) => q)
        .map(q => ({ value: q, label: quarterLabel(mData, quarterMonths(q)), months: quarterMonths(q) }))
        .filter(o => o.months.length === 3 && o.value !== current)

  const autoLabel = mode === 'month'
    ? (current > 0 ? mData[current - 1]?.label : null)
    : (current > 0 ? quarterLabel(mData, quarterMonths(current - 1)) : null)

  const summary = value != null
    ? (mode === 'month' ? mData[value]?.label : quarterLabel(mData, quarterMonths(value)))
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
  const singleQuarterIdx = (() => {
    if (selMonths.length !== 3) return null
    const q = Math.floor(selMonths[0] / 3)
    const expected = [q * 3, q * 3 + 1, q * 3 + 2]
    return (expected.length === 3 && expected.every(i => selMonths.includes(i))) ? q : null
  })()
  const quarterMonthIdxs = (q) => [q * 3, q * 3 + 1, q * 3 + 2].filter(i => i < mData.length)
  const fullQuarterLabel = singleQuarterIdx != null ? quarterLabel(mData, quarterMonthIdxs(singleQuarterIdx)) : null

  const compareMode = singleMonth != null ? 'month' : singleQuarterIdx != null ? 'quarter' : null
  useEffect(() => { setCompareIdx(null) }, [compareMode])

  const effectiveCompareIdx =
    compareMode === 'month'   && compareIdx !== singleMonth      ? compareIdx
    : compareMode === 'quarter' && compareIdx !== singleQuarterIdx ? compareIdx
    : null

  const priorMonths =
    compareMode === 'month'   && effectiveCompareIdx != null ? [effectiveCompareIdx]
    : compareMode === 'quarter' && effectiveCompareIdx != null ? [effectiveCompareIdx * 3, effectiveCompareIdx * 3 + 1, effectiveCompareIdx * 3 + 2].filter(i => i < mData.length)
    : singleMonth != null ? (singleMonth > 0 ? [singleMonth - 1] : null)
    : singleQuarterIdx != null ? (singleQuarterIdx > 0 ? [singleQuarterIdx * 3 - 3, singleQuarterIdx * 3 - 2, singleQuarterIdx * 3 - 1] : null)
    : null

  const priorLabel =
    compareMode === 'month'   && effectiveCompareIdx != null ? mData[effectiveCompareIdx]?.label
    : compareMode === 'quarter' && effectiveCompareIdx != null ? quarterLabel(mData, quarterMonthIdxs(effectiveCompareIdx))
    : singleMonth != null ? (priorMonths ? mData[priorMonths[0]]?.label : null)
    : singleQuarterIdx != null ? (priorMonths ? quarterLabel(mData, priorMonths) : null)
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
