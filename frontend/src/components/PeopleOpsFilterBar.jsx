import { useState, useEffect } from 'react'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'

const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December']

function Sel({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 160 }}>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-lg px-3 py-2 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
        style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderStyle: 'solid' }}
      >
        <option value="All" style={{ color: '#fff', background: '#0A3A46' }}>All</option>
        {options.map(o => <option key={o.value} value={o.value} disabled={o.disabled} style={{ color: '#fff', background: '#0A3A46' }}>{o.label}</option>)}
      </select>
    </div>
  )
}

export default function PeopleOpsFilterBar({ data }) {
  const {
    filterBU, setFilterBU,
    filterType, setFilterType,
    filterVC, setFilterVC,
    filterSource, setFilterSource,
    filterMonth, setFilterMonth,
    filterYear, setFilterYear,
    clearFilters, anyActive
  } = usePeopleOpsFilters()

  const hr  = data.hr           || {}
  const rev = data.hrReview     || {}
  const ec  = data.employeeCost || {}

  const allBUs = (hr.byDeptHierarchy || [])
    .filter(d => d.deptCode && d.deptCode !== 'Unknown')
    .map(d => ({ value: d.deptCode, label: d.deptName || d.deptCode }))
    .sort((a, b) => a.label.localeCompare(b.label))

  // Employment types — prefer hrReview, fall back to buDrillDown
  const allEmployeeTypes = (() => {
    const fromRev = rev.allEmployeeTypes || []
    if (fromRev.length > 0) return fromRev.map(t => ({ value: t, label: t }))
    const set = new Set()
    ;(ec.buDrillDown || []).forEach(bu =>
      (bu.sections || []).forEach(sec =>
        (sec.employees || []).forEach(emp => {
          if (emp.employeeType && emp.employeeType !== 'Unknown') set.add(emp.employeeType)
        })
      )
    )
    return [...set].sort().map(t => ({ value: t, label: t }))
  })()

  // Virtual companies — prefer hrReview, fall back to buDrillDown
  const allVCs = (() => {
    const fromRev = (rev.allVirtualCompanies || []).filter(v => v && v !== 'Unknown')
    if (fromRev.length > 0) return fromRev.map(v => ({ value: v, label: v }))
    const set = new Set()
    ;(ec.buDrillDown || []).forEach(bu =>
      (bu.sections || []).forEach(sec =>
        (sec.employees || []).forEach(emp => {
          if (emp.vc && emp.vc !== 'Unknown') set.add(emp.vc)
        })
      )
    )
    return [...set].sort().map(v => ({ value: v, label: v }))
  })()

  // Available "Month Year" combos — union of payroll data (cost) and headcount
  // evolution (live headcount, including the current in-progress month) — a month is
  // real if EITHER has data for it. Used to disable Month options that don't exist for
  // the selected year (e.g. December 2026, or any month beyond the current live one)
  // instead of letting the two dropdowns freely combine into a period with no data at all.
  const periods    = ec.payrollMonths || []
  const evoLabels  = (hr.headcountEvolution || []).map(m => m.label)
  const validCombos = new Set([...periods, ...evoLabels])

  const years = [...new Set([...periods, ...evoLabels].map(p => p.split(' ')[1]).filter(Boolean))]
    .sort((a, b) => b - a)
    .map(y => ({ value: y, label: y }))

  // Local month/year selection, kept in sync with the shared filterMonth/filterYear values.
  // Needs to be local (not derived on every render) so that selecting Month alone — before
  // Year is also picked — visibly sticks instead of reverting (filterMonth itself can't
  // represent "month picked, year not yet", it's only ever a full "Month Year" string or
  // 'All'; filterYear can stand alone, which is exactly what lets a year-only selection —
  // "show me all of 2025" — work without also requiring a specific month).
  const [selMonth, setSelMonth] = useState('All')
  const [selYear,  setSelYear]  = useState('All')

  // Month options for the currently-selected year, disabled (not hidden) when that
  // "Month Year" combo has no data at all — e.g. a future month within the current
  // year. With no year picked yet, nothing is disabled since validity can't be judged.
  const monthNames = MONTH_ORDER.map(m => ({
    value: m,
    label: m,
    disabled: selYear !== 'All' && !validCombos.has(`${m} ${selYear}`)
  }))

  useEffect(() => {
    if (filterMonth === 'All') { setSelMonth('All'); return }
    const m = filterMonth.split(' ').slice(0, -1).join(' ')
    setSelMonth(m || 'All')
  }, [filterMonth])

  useEffect(() => { setSelYear(filterYear) }, [filterYear])

  const applyPeriod = (month, year) => {
    // Don't let a year change strand an already-picked month on an invalid combo
    // (e.g. Month=December selected, then Year changed to one where December hasn't
    // happened yet) — drop the month back to 'All' rather than committing a period
    // with no data.
    const resolvedMonth = (month !== 'All' && year !== 'All' && !validCombos.has(`${month} ${year}`))
      ? 'All'
      : month
    setSelMonth(resolvedMonth)
    setSelYear(year)
    setFilterYear(year)
    setFilterMonth(resolvedMonth !== 'All' && year !== 'All' ? `${resolvedMonth} ${year}` : 'All')
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-card">
      <div className="flex flex-wrap gap-4 items-end">
        <Sel label="Business Unit"   value={filterBU}     onChange={setFilterBU}     options={allBUs} />
        <Sel label="Employment Type" value={filterType}   onChange={setFilterType}   options={allEmployeeTypes} />
        <Sel label="Virtual Company" value={filterVC}     onChange={setFilterVC}     options={allVCs} />
        <Sel label="Budget Source"   value={filterSource} onChange={setFilterSource} options={[
          { value: 'KIFIYA', label: 'Corporate' },
          { value: 'SAFEE',  label: 'Programme' }
        ]} />
        <Sel label="Month" value={selMonth} onChange={m => applyPeriod(m, selYear)} options={monthNames} />
        <Sel label="Year"  value={selYear}  onChange={y => applyPeriod(selMonth, y)} options={years} />
        {anyActive && (
          <button
            onClick={clearFilters}
            className="self-end px-3 py-2 rounded-lg text-[11px] font-bold border border-border text-muted hover:text-navy hover:border-navy transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
