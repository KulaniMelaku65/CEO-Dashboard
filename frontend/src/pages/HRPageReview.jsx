import { useState, useMemo, useEffect, Fragment } from 'react'

const NAVY   = '#02404F'
const TEAL   = '#1FB6A6'
const ORANGE = '#EB7D23'

const fmtN = (n) => {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US')
}
const fmtC = (n) => {
  if (!n && n !== 0) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtPct = (n) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(1) + '%'

function FilterSelect({ label, value, onChange, options, wide }) {
  return (
    <div className={`flex flex-col gap-1 ${wide ? 'min-w-[200px]' : 'min-w-[150px]'}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#6B7C93' }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
        style={{ color: NAVY }}
      >
        <option value="All">All</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function KpiBlock({ label, value, sub, accent, small }) {
  return (
    <div className="flex flex-col justify-between p-4 rounded-xl" style={{ background: accent || NAVY }}>
      <p className="text-[9px] uppercase tracking-widest font-bold text-white/60 leading-tight">{label}</p>
      <p className={`font-extrabold text-white leading-none mt-2 tabular-nums ${small ? 'text-[18px]' : 'text-[22px]'}`}>{value}</p>
      {sub && <p className="text-[10px] text-white/50 mt-1 truncate">{sub}</p>}
    </div>
  )
}

export default function HRPageReview({ data }) {
  const hr  = data.hr           || {}
  const rev = data.hrReview     || {}
  const ec  = data.employeeCost || {}

  const employeePayroll     = rev.employeePayroll     || []
  const headcountMatrix     = rev.headcountMatrix     || []
  const allEmployeeTypes    = rev.allEmployeeTypes    || []
  const allVirtualCompanies = rev.allVirtualCompanies || []
  const payrollMonths       = rev.payrollMonths || ec.payrollMonths || []

  // sectionToDept from HR data — same map used by "Employees Per BU" chart
  const sectionToDept = hr.sectionToDept || {}

  // Resolve the effective parent BU code for any code (section or parent)
  const resolveParent = (code) => sectionToDept[code] || code

  // ── BU list from hr.byDeptHierarchy — same source as "Employees Per BU" chart ──
  const allBUs = useMemo(() => {
    const deptH = hr.byDeptHierarchy || []
    // byDeptHierarchy has the definitive parent BU list that matches the chart
    return deptH
      .filter(d => d.deptCode && d.deptCode !== 'Unknown')
      .map(d => ({ value: d.deptCode, label: d.deptName || d.deptCode }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [hr.byDeptHierarchy])

  // Headcount per parent BU directly from hr.byDept (same source as chart)
  const hcByBU = useMemo(() => {
    const m = {}
    ;(hr.byDept || []).forEach(d => {
      m[d.dept] = (d.male || 0) + (d.female || 0)
    })
    return m
  }, [hr.byDept])

  // ── Filter state ─────────────────────────────────────────────────────────
  const [filterBU,      setFilterBU]      = useState('All')
  const [filterType,    setFilterType]    = useState('All')
  const [filterVC,      setFilterVC]      = useState('All')
  const [filterSource,  setFilterSource]  = useState('All')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [expandedRows,  setExpandedRows]  = useState({})

  useEffect(() => {
    if (payrollMonths.length > 0) {
      setSelectedMonth(prev =>
        payrollMonths.includes(prev) ? prev : payrollMonths[payrollMonths.length - 1]
      )
    }
  }, [payrollMonths])

  const effectiveMonth = selectedMonth || payrollMonths[payrollMonths.length - 1] || ''

  const toggleRow = (key) => setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }))

  // ── Filter headcountMatrix ────────────────────────────────────────────────
  // Use sectionToDept so Finance sections missing from sectionToDept still resolve
  const filteredHC = useMemo(() => headcountMatrix.filter(r => {
    const parentBU = resolveParent(r.buCode)
    return (filterBU   === 'All' || r.buCode === filterBU || parentBU === filterBU) &&
           (filterType === 'All' || r.employeeType   === filterType) &&
           (filterVC   === 'All' || r.virtualCompany === filterVC)
  }), [headcountMatrix, filterBU, filterType, filterVC, sectionToDept])

  // ── Filter employeePayroll ────────────────────────────────────────────────
  const filteredPay = useMemo(() => employeePayroll.filter(r => {
    const parentBU = resolveParent(r.buCode)
    return (filterBU     === 'All' || r.buCode === filterBU || parentBU === filterBU) &&
           (filterType   === 'All' || r.employeeType   === filterType) &&
           (filterVC     === 'All' || r.virtualCompany === filterVC) &&
           (filterSource === 'All' || r.payrollSource  === filterSource)
  }), [employeePayroll, filterBU, filterType, filterVC, filterSource, sectionToDept])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  // Headcount: from hr.byDept (same as chart) when no BU filter, else sum filteredHC
  const totalHeadcount = useMemo(() => {
    if (filterBU === 'All' && filterType === 'All' && filterVC === 'All') {
      return (hr.byDept || []).reduce((s, d) => s + (d.male || 0) + (d.female || 0), 0)
    }
    return filteredHC.reduce((s, r) => s + r.count, 0)
  }, [filteredHC, filterBU, filterType, filterVC, hr.byDept])

  const { totalMonthly, kifiyaMonthly, safeeMonthly } = useMemo(() => {
    let total = 0, kifiya = 0, safee = 0
    filteredPay.forEach(r => {
      const v = r.monthTotals[effectiveMonth] || 0
      total += v
      if (r.payrollSource === 'KIFIYA') kifiya += v
      else                              safee  += v
    })
    return { totalMonthly: total, kifiyaMonthly: kifiya, safeeMonthly: safee }
  }, [filteredPay, effectiveMonth])

  const annualised     = totalMonthly * 12
  const kifiyaSharePct = totalMonthly > 0 ? (kifiyaMonthly / totalMonthly) * 100 : 0

  // ── Table rows: one row per BU ───────────────────────────────────────────
  const { tableRows, empsByKey } = useMemo(() => {
    const map    = {}   // buCode → row
    const empMap = {}   // buCode → Map<employeeNo, emp>
    const validBUCodes = new Set(allBUs.map(b => b.value))

    // Headcount from headcountMatrix — sum all VCs per BU
    filteredHC.forEach(r => {
      const parent = resolveParent(r.buCode)
      if (!validBUCodes.has(parent)) return
      const buName = allBUs.find(b => b.value === parent)?.label || r.buName || parent
      if (!map[parent]) map[parent] = { buCode: parent, buName, headcount: 0, monthly: 0, kifiya: 0, safee: 0, vcs: new Set() }
      map[parent].headcount += r.count
      map[parent].vcs.add(r.virtualCompany)
    })

    // When no type/vc filter, override headcount with authoritative hr.byDept totals
    if (filterType === 'All' && filterVC === 'All' && filterBU === 'All') {
      ;(hr.byDept || []).forEach(d => {
        if (!validBUCodes.has(d.dept)) return
        if (!map[d.dept]) {
          const buName = allBUs.find(b => b.value === d.dept)?.label || d.dept
          map[d.dept] = { buCode: d.dept, buName, headcount: 0, monthly: 0, kifiya: 0, safee: 0, vcs: new Set() }
        }
        map[d.dept].headcount = (d.male || 0) + (d.female || 0)
      })
    } else if (filterType === 'All' && filterVC === 'All' && filterBU !== 'All') {
      const d = (hr.byDept || []).find(d => d.dept === filterBU)
      if (d && map[filterBU]) map[filterBU].headcount = (d.male || 0) + (d.female || 0)
    }

    // Cost + employees from filteredPay — grouped by BU only
    filteredPay.forEach(r => {
      const parent = resolveParent(r.buCode)
      if (!validBUCodes.has(parent)) return
      const buName = allBUs.find(b => b.value === parent)?.label || r.buName || parent
      if (!map[parent]) map[parent] = { buCode: parent, buName, headcount: 0, monthly: 0, kifiya: 0, safee: 0, vcs: new Set() }
      const v = r.monthTotals[effectiveMonth] || 0
      map[parent].monthly += v
      if (r.payrollSource === 'KIFIYA') map[parent].kifiya += v
      else                              map[parent].safee  += v
      map[parent].vcs.add(r.virtualCompany)

      // Employee drill-down — track Kifiya and MSP separately
      if (!empMap[parent]) empMap[parent] = new Map()
      const v2 = r.monthTotals[effectiveMonth] || 0
      if (!empMap[parent].has(r.employeeNo)) {
        empMap[parent].set(r.employeeNo, {
          employeeNo:     r.employeeNo,
          name:           r.name,
          virtualCompany: r.virtualCompany,
          payrollSource:  r.payrollSource,
          kifiya:         r.payrollSource === 'KIFIYA' ? v2 : 0,
          safee:          r.payrollSource === 'SAFEE'  ? v2 : 0,
        })
      } else {
        const ex = empMap[parent].get(r.employeeNo)
        if (r.payrollSource === 'KIFIYA') ex.kifiya += v2
        else                              ex.safee  += v2
        if (ex.payrollSource !== r.payrollSource) ex.payrollSource = 'Both'
      }
    })

    const rows = Object.values(map)
      .sort((a, b) => b.monthly - a.monthly || a.buName.localeCompare(b.buName))
      .map(r => ({
        ...r,
        monthly:  Math.round(r.monthly),
        kifiya:   Math.round(r.kifiya),
        safee:    Math.round(r.safee),
        vcLabel:  [...r.vcs].filter(v => v && v !== 'Unknown').sort().join(' + ') || '—'
      }))

    const empsByKey = {}
    Object.entries(empMap).forEach(([k, empSet]) => {
      empsByKey[k] = [...empSet.values()].sort((a, b) => a.name.localeCompare(b.name))
    })

    return { tableRows: rows, empsByKey }
  }, [filteredHC, filteredPay, effectiveMonth, hcByBU, allBUs, filterType, filterVC, filterBU, headcountMatrix, hr.byDept])

  const grandMonthly   = tableRows.reduce((s, r) => s + r.monthly, 0)
  const grandHeadcount = tableRows.reduce((s, r) => s + r.headcount, 0)
  const grandKifiya    = tableRows.reduce((s, r) => s + r.kifiya, 0)
  const grandSafee     = tableRows.reduce((s, r) => s + r.safee, 0)

  const anyFilter = filterBU !== 'All' || filterType !== 'All' || filterVC !== 'All' || filterSource !== 'All'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">HR Page Review</h2>
        <p className="text-xs text-muted font-medium">
          Active employees · headcount and payroll cost · all filters update instantly
        </p>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-border p-4 shadow-card">
        <div className="flex flex-wrap gap-4 items-end">
          <FilterSelect label="Business Unit"   value={filterBU}     onChange={v => { setFilterBU(v); setExpandedRows({}) }}     options={allBUs} wide />
          <FilterSelect label="Employment Type" value={filterType}   onChange={setFilterType}   options={allEmployeeTypes.map(t => ({ value: t, label: t }))} />
          <FilterSelect label="Hub / Country"   value={filterVC}     onChange={setFilterVC}     options={allVirtualCompanies.filter(v => v !== 'Unknown').map(v => ({ value: v, label: v }))} />
          <FilterSelect label="Budget Source"   value={filterSource} onChange={setFilterSource} options={[{ value: 'KIFIYA', label: 'Kifiya' }, { value: 'SAFEE', label: 'MSP / Programme' }]} />

          <div className="flex flex-col gap-1 min-w-[170px]">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#6B7C93' }}>Period</span>
            <select
              value={effectiveMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
              style={{ color: NAVY }}
            >
              {payrollMonths.slice().reverse().map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {anyFilter && (
            <button
              onClick={() => { setFilterBU('All'); setFilterType('All'); setFilterVC('All'); setFilterSource('All'); setExpandedRows({}) }}
              className="self-end px-3 py-2 rounded-lg text-[11px] font-bold border border-border text-muted hover:text-navy hover:border-navy transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── KPI row 1 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBlock label="Headcount"              value={fmtN(totalHeadcount)}            sub={filterType !== 'All' ? `${filterType} employees` : 'Active employees'} accent={NAVY} />
        <KpiBlock label="Monthly Cost to Company" value={fmtN(Math.round(totalMonthly))} sub={effectiveMonth} accent={NAVY} />
        <KpiBlock label="Annualised Cost"         value={fmtN(Math.round(annualised))}   sub="Monthly × 12"  accent={NAVY} />
      </div>

      {/* ── KPI row 2 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBlock label="Kifiya-Funded (Monthly)"        value={fmtN(Math.round(kifiyaMonthly))} sub={effectiveMonth} accent={TEAL} />
        <KpiBlock label="MSP / Programme-Funded (Monthly)" value={fmtN(Math.round(safeeMonthly))} sub={effectiveMonth} accent="#1A7A72" small />
        <KpiBlock label="Kifiya Share of Payroll"         value={fmtPct(kifiyaSharePct)}
          sub={`${fmtN(Math.round(kifiyaMonthly))} of ${fmtN(Math.round(totalMonthly))}`} accent={ORANGE} />
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-bold text-navy">Monthly Cost by Business Unit &amp; Hub / Country</h3>
          <p className="text-[10px] text-muted mt-0.5">
            {effectiveMonth} · {tableRows.length} rows · click a row to expand employees
          </p>
        </div>
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 620 }}>
          <table className="text-[11px] border-collapse w-full" style={{ minWidth: 760 }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: NAVY }}>
                <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20 min-w-[200px]" style={{ background: NAVY }}>Business Unit</th>
                <th className="px-4 py-3 font-bold text-white text-left whitespace-nowrap min-w-[80px]">Hub / Country</th>
                <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[80px]">Head Count</th>
                <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[140px]">Monthly Cost (ETB)</th>
                <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[70px]">% of Cost</th>
                <th className="px-4 py-3 font-bold text-right whitespace-nowrap min-w-[120px]" style={{ color: '#90D4CE' }}>Kifiya Funded</th>
                <th className="px-4 py-3 font-bold text-right whitespace-nowrap min-w-[120px]" style={{ color: '#EB7D23' }}>MSP / Programme</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">No data for the selected filters.</td>
                </tr>
              ) : tableRows.map((row, i) => {
                const rowKey  = row.buCode
                const isOpen  = !!expandedRows[rowKey]
                const empList = empsByKey[rowKey] || []
                const pct     = grandMonthly > 0 ? (row.monthly / grandMonthly) * 100 : 0
                const rowBg   = i % 2 === 0 ? '#fff' : '#F9FBFD'
                return (
                  <Fragment key={rowKey}>
                    <tr
                      className="border-t border-border cursor-pointer hover:bg-[#F0F7F6] transition-colors"
                      style={{ background: rowBg }}
                      onClick={() => toggleRow(rowKey)}
                    >
                      <td className="px-4 py-2.5 font-semibold text-navy sticky left-0 z-10" style={{ background: rowBg }}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[10px] text-muted w-3">{isOpen ? '▾' : '▸'}</span>
                          {row.buName || row.buCode}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-semibold text-muted">{row.vcLabel}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-navy">{row.headcount || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-navy">{fmtC(row.monthly || null)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">{fmtPct(pct)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: TEAL }}>{fmtC(row.kifiya || null)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: ORANGE }}>{fmtC(row.safee || null)}</td>
                    </tr>

                    {/* ── Employee drill-down rows ── */}
                    {isOpen && empList.length === 0 && (
                      <tr key={`${rowKey}-empty`} className="border-t border-border/30" style={{ background: '#F8FFFE' }}>
                        <td colSpan={7} className="pl-10 pr-4 py-2 text-muted italic text-[10px]">
                          No payroll records for this group in {effectiveMonth}
                        </td>
                      </tr>
                    )}
                    {isOpen && empList.map(emp => {
                      const vc    = emp.virtualCompany && emp.virtualCompany !== 'Unknown' ? emp.virtualCompany : ''
                      const total = emp.kifiya + emp.safee
                      const pctEmp = row.monthly > 0 ? (total / row.monthly) * 100 : 0
                      return (
                        <tr key={`${rowKey}-${emp.employeeNo}`} className="border-t border-border/20" style={{ background: '#F0FAF9' }}>
                          <td className="pl-10 pr-4 py-1.5 font-medium text-navy sticky left-0 z-10 text-[11px]" style={{ background: '#F0FAF9' }}>
                            {[emp.employeeNo, emp.name].filter(Boolean).join(' · ')}
                          </td>
                          <td className="px-4 py-1.5 text-[10px] text-muted">{vc}</td>
                          <td className="px-4 py-1.5" />
                          <td className="px-4 py-1.5 text-right tabular-nums text-muted text-[10px]">
                            {fmtC(total || null)}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-[10px] text-muted">
                            {fmtPct(pctEmp)}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-[10px]" style={{ color: TEAL }}>
                            {emp.kifiya ? fmtC(emp.kifiya) : '—'}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-[10px]" style={{ color: ORANGE }}>
                            {emp.safee ? fmtC(emp.safee) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                    {isOpen && empList.length > 0 && (() => {
                      const subKifiya = empList.reduce((s, e) => s + e.kifiya, 0)
                      const subSafee  = empList.reduce((s, e) => s + e.safee,  0)
                      const subTotal  = subKifiya + subSafee
                      return (
                        <tr key={`${rowKey}-subtotal`} className="border-t border-border/40" style={{ background: '#D9F2EF' }}>
                          <td className="pl-10 pr-4 py-2 font-bold text-navy sticky left-0 z-10 text-[11px]" style={{ background: '#D9F2EF' }}>
                            {row.buName} — Total ({empList.length} employees)
                          </td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right tabular-nums font-bold text-navy text-[11px]">
                            {fmtC(subTotal || null)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold text-muted text-[11px]">100%</td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold text-[11px]" style={{ color: TEAL }}>
                            {subKifiya ? fmtC(subKifiya) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold text-[11px]" style={{ color: ORANGE }}>
                            {subSafee ? fmtC(subSafee) : '—'}
                          </td>
                        </tr>
                      )
                    })()}
                  </Fragment>
                )
              })}
            </tbody>
            {tableRows.length > 0 && (
              <tfoot className="sticky bottom-0 z-10">
                <tr style={{ background: NAVY }}>
                  <td className="px-4 py-3 font-extrabold text-white sticky left-0 z-20" style={{ background: NAVY }}>Total</td>
                  <td className="px-4 py-3 text-white/50 text-[10px]">{tableRows.length} rows</td>
                  <td className="px-4 py-3 text-right font-bold text-white tabular-nums">{fmtN(grandHeadcount)}</td>
                  <td className="px-4 py-3 text-right font-bold text-white tabular-nums">{fmtC(grandMonthly || null)}</td>
                  <td className="px-4 py-3 text-right font-bold text-white">100%</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: '#90D4CE' }}>{fmtC(grandKifiya || null)}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: ORANGE }}>{fmtC(grandSafee || null)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
