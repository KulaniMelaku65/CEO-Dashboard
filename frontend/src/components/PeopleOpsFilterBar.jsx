import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'

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

  // Available months — newest first
  const allMonths = [...(ec.payrollMonths || [])].reverse().map(m => ({ value: m, label: m }))

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
        <Sel label="Period (Month)"  value={filterMonth}  onChange={setFilterMonth}  options={allMonths} />
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
