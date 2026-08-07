import { useState, useEffect } from 'react'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'

const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December']

function Sel({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 160 }}>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#6B7C93' }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
        style={{ color: '#02404F' }}
      >
        <option value="All">All</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

  // Available "Month Year" combos, e.g. "January 2025" — split into separate
  // month-name and year option lists for the two dropdowns below.
  const periods = ec.payrollMonths || []
  const monthNames = MONTH_ORDER.filter(m => periods.some(p => p.startsWith(m + ' ')))
    .map(m => ({ value: m, label: m }))
  const years = [...new Set(periods.map(p => p.split(' ')[1]).filter(Boolean))]
    .sort((a, b) => b - a)
    .map(y => ({ value: y, label: y }))

  // Local month/year selection, kept in sync with the combined filterMonth string
  const [selMonth, setSelMonth] = useState('All')
  const [selYear,  setSelYear]  = useState('All')

  useEffect(() => {
    if (filterMonth === 'All') { setSelMonth('All'); setSelYear('All'); return }
    const [m, y] = [filterMonth.split(' ').slice(0, -1).join(' '), filterMonth.split(' ').slice(-1)[0]]
    setSelMonth(m || 'All')
    setSelYear(y || 'All')
  }, [filterMonth])

  const applyPeriod = (month, year) => {
    setSelMonth(month)
    setSelYear(year)
    setFilterMonth(month !== 'All' && year !== 'All' ? `${month} ${year}` : 'All')
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-card">
      <div className="flex flex-wrap gap-4 items-end">
        <Sel label="Business Unit"   value={filterBU}     onChange={setFilterBU}     options={allBUs} />
        <Sel label="Employment Type" value={filterType}   onChange={setFilterType}   options={allEmployeeTypes} />
        <Sel label="Hub / Country"   value={filterVC}     onChange={setFilterVC}     options={allVCs} />
        <Sel label="Budget Source"   value={filterSource} onChange={setFilterSource} options={[
          { value: 'KIFIYA', label: 'Kifiya' },
          { value: 'SAFEE',  label: 'MSP / Programme' }
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
