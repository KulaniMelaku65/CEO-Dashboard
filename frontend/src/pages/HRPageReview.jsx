import { useState, useMemo, Fragment } from 'react'
import PeopleOpsFilterBar from '../components/PeopleOpsFilterBar.jsx'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'

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
  const payrollMonths       = rev.payrollMonths    || ec.payrollMonths || []
  // Standard-payroll-only months (excludes consultant-only months) — used as the
  // default effective month so IC payroll in a newer period doesn't make all
  // standard employees appear with zero cost by default.
  const stdPayrollMonths    = rev.stdPayrollMonths || payrollMonths

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

  // ── Filter state — shared across all People & Operations pages via context ──
  const { filterBU, filterType, filterVC, filterSource, filterMonth, filterYear } = usePeopleOpsFilters()
  const [expandedRows, setExpandedRows] = useState({})

  // Year selected without a specific month ("show me 2026") — resolve to the most
  // recent payroll month within that year so point-in-time KPIs (headcount, monthly
  // cost) land on the latest data we actually have for the chosen year.
  const yearOnly = filterMonth === 'All' && filterYear !== 'All'
  const latestMonthInYear = yearOnly
    ? [...stdPayrollMonths].reverse().find(m => m.endsWith(' ' + filterYear))
      || [...payrollMonths].reverse().find(m => m.endsWith(' ' + filterYear))
    : null

  // Use global filterMonth when set; otherwise resolve from filterYear if set; otherwise
  // default to most recent standard payroll month. stdPayrollMonths excludes
  // consultant-only months, preventing a scenario where IC payroll has a newer period
  // than staff payroll and staff all show zero cost by default.
  const effectiveMonth = (filterMonth !== 'All' && payrollMonths.includes(filterMonth))
    ? filterMonth
    : latestMonthInYear
    || stdPayrollMonths[stdPayrollMonths.length - 1] || payrollMonths[payrollMonths.length - 1] || ''

  const toggleRow = (key) => setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }))

  // ── Filter headcountMatrix ────────────────────────────────────────────────
  // Exclude rows where BOTH employeeType AND virtualCompany are unknown — these
  // employees have no attributes set and skew the total headcount.
  const validHC = useMemo(() => headcountMatrix.filter(r => {
    const hasType = r.employeeType && r.employeeType !== 'Unknown'
    const hasVC   = r.virtualCompany && r.virtualCompany !== 'Unknown'
    return hasType || hasVC
  }), [headcountMatrix])

  const filteredHC = useMemo(() => validHC.filter(r => {
    const parentBU = resolveParent(r.buCode)
    return (filterBU   === 'All' || r.buCode === filterBU || parentBU === filterBU) &&
           (filterType === 'All' || r.employeeType   === filterType) &&
           (filterVC   === 'All' || r.virtualCompany === filterVC)
  }), [validHC, filterBU, filterType, filterVC, sectionToDept])

  // ── Filter employeePayroll ────────────────────────────────────────────────
  const filteredPay = useMemo(() => employeePayroll.filter(r => {
    const parentBU = resolveParent(r.buCode)
    return (filterBU     === 'All' || r.buCode === filterBU || parentBU === filterBU) &&
           (filterType   === 'All' || r.employeeType   === filterType) &&
           (filterVC     === 'All' || r.virtualCompany === filterVC) &&
           (filterSource === 'All' || r.payrollSource  === filterSource)
  }), [employeePayroll, filterBU, filterType, filterVC, filterSource, sectionToDept])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  // Headcount is a point-in-time figure — headcountMatrix only reflects "now", so a
  // month/year selection needs hr.headcountEvolution's separate reconstruction instead,
  // which also carries a byBU breakdown (used below for the per-row table headcount) —
  // same source and same behaviour as the People & HR page.
  const monthEvo = (filterMonth !== 'All' || yearOnly)
    ? (hr.headcountEvolution || []).find(m => m.label === effectiveMonth)
    : null
  // byBU has no further type/VC split, so only trust it for the overall KPI when those
  // filters aren't also narrowing things (BU filter alone is fine — byBU is per-BU already).
  const monthHeadcount = (monthEvo && filterType === 'All' && filterVC === 'All')
    ? (filterBU === 'All' ? monthEvo.count : monthEvo.byBU?.[filterBU]?.count ?? 0)
    : null

  const totalHeadcount = useMemo(() => {
    if (monthHeadcount != null) return monthHeadcount
    const hcCount = (filterBU === 'All' && filterType === 'All' && filterVC === 'All')
      ? validHC.reduce((s, r) => s + r.count, 0)
      : filteredHC.reduce((s, r) => s + r.count, 0)
    // When the BC headcount query has no records for this filter (e.g. Individual Consultants
    // are not in the employee headcount table), fall back to unique employees from payroll.
    if (hcCount === 0 && filteredPay.length > 0)
      return new Set(filteredPay.map(r => r.employeeNo)).size
    return hcCount
  }, [validHC, filteredHC, filteredPay, filterBU, filterType, filterVC, monthHeadcount])

  const { totalMonthly, kifiyaMonthly, safeeMonthly } = useMemo(() => {
    let total = 0, kifiya = 0, safee = 0
    filteredPay.forEach(r => {
      const v = (r.monthTotals[effectiveMonth] || 0) + (r.pensionMonthTotals?.[effectiveMonth] || 0)
      total += v
      if (r.payrollSource === 'KIFIYA') kifiya += v
      else                              safee  += v
    })
    return { totalMonthly: total, kifiyaMonthly: kifiya, safeeMonthly: safee }
  }, [filteredPay, effectiveMonth])

  const kifiyaSharePct = totalMonthly > 0 ? (kifiyaMonthly / totalMonthly) * 100 : 0

  // ── Annualised Cost → actual YTD sum, not a Monthly × 12 projection ──
  // Uses the same year as effectiveMonth and sums every payroll month on record
  // for that year up to (and including) effectiveMonth — e.g. if data only goes
  // through July, this sums January through July, not a full-year estimate.
  const { annualisedYTD, ytdLabel } = useMemo(() => {
    const [effMonthName, effYearStr] = effectiveMonth.split(' ')
    const effYear = Number(effYearStr)
    const effDate = effMonthName ? new Date(`${effMonthName} 1, ${effYear}`) : null

    const ytdMonths = (effDate && !isNaN(effDate.getTime()))
      ? payrollMonths.filter(m => {
          const d = new Date(m)
          return !isNaN(d.getTime()) && d.getFullYear() === effYear && d <= effDate
        })
      : []

    const sum = filteredPay.reduce((s, r) =>
      s + ytdMonths.reduce((ss, m) => ss + (r.monthTotals[m] || 0) + (r.pensionMonthTotals?.[m] || 0), 0), 0)

    const label = ytdMonths.length === 0 ? '—'
      : ytdMonths.length === 1 ? ytdMonths[0]
      : `${ytdMonths[0].split(' ')[0]} – ${ytdMonths[ytdMonths.length - 1]}`

    return { annualisedYTD: sum, ytdLabel: label }
  }, [filteredPay, payrollMonths, effectiveMonth])

  // ── Table rows: one row per BU ───────────────────────────────────────────
  const { tableRows, empsByKey } = useMemo(() => {
    const map    = {}   // buCode → row
    const empMap = {}   // buCode → Map<employeeNo, emp>
    // Build name lookup from hierarchy; only used for display — not as a whitelist
    const buNameFromHierarchy = {}
    allBUs.forEach(b => { buNameFromHierarchy[b.value] = b.label })

    const resolveBUName = (parent, fallbackName) =>
      buNameFromHierarchy[parent] || fallbackName || parent

    // Headcount from headcountMatrix — sum all VCs per BU
    filteredHC.forEach(r => {
      const parent = resolveParent(r.buCode)
      const buName = resolveBUName(parent, r.buName)
      if (!map[parent]) map[parent] = { buCode: parent, buName, headcount: 0, monthly: 0, kifiya: 0, safee: 0, vcs: new Set() }
      map[parent].headcount += r.count
      map[parent].vcs.add(r.virtualCompany)
    })

    // Headcount is already accumulated from filteredHC above — no hr.byDept override
    // so ghost employees (unknown type + unknown VC) are correctly excluded.

    // Cost + employees from filteredPay — grouped by BU only
    filteredPay.forEach(r => {
      const parent = resolveParent(r.buCode)
      const buName = resolveBUName(parent, r.buName)
      if (!map[parent]) map[parent] = { buCode: parent, buName, headcount: 0, monthly: 0, kifiya: 0, safee: 0, vcs: new Set() }
      const vp = (r.monthTotals[effectiveMonth] || 0) + (r.pensionMonthTotals?.[effectiveMonth] || 0)
      map[parent].monthly += vp
      if (r.payrollSource === 'KIFIYA') map[parent].kifiya += vp
      else                              map[parent].safee  += vp
      map[parent].vcs.add(r.virtualCompany)

      // Employee drill-down — track Kifiya, MSP, and pension separately
      if (!empMap[parent]) empMap[parent] = new Map()
      const v2p = (r.monthTotals[effectiveMonth] || 0) + (r.pensionMonthTotals?.[effectiveMonth] || 0)
      if (!empMap[parent].has(r.employeeNo)) {
        empMap[parent].set(r.employeeNo, {
          employeeNo:     r.employeeNo,
          name:           r.name,
          virtualCompany: r.virtualCompany,
          payrollSource:  r.payrollSource,
          kifiya:         r.payrollSource === 'KIFIYA' ? v2p : 0,
          safee:          r.payrollSource === 'SAFEE'  ? v2p : 0,
        })
      } else {
        const ex = empMap[parent].get(r.employeeNo)
        if (r.payrollSource === 'KIFIYA') ex.kifiya += v2p
        else                              ex.safee  += v2p
        if (ex.payrollSource !== r.payrollSource) ex.payrollSource = 'Both'
      }
    })

    const rows = Object.values(map)
      .sort((a, b) => b.monthly - a.monthly || a.buName.localeCompare(b.buName))
      .map(r => {
        // Month/year selected: use the point-in-time reconstruction for that BU instead
        // of "now" — same headcount source as the People & HR page for that month.
        const buMonthEvo = (filterType === 'All' && filterVC === 'All') ? monthEvo?.byBU?.[r.buCode] : null
        return {
          ...r,
          // Use payroll-derived unique count when headcountMatrix has no data for this BU
          // (e.g. Individual Consultants absent from the BC employee headcount query)
          headcount: buMonthEvo ? buMonthEvo.count : (r.headcount || (empMap[r.buCode] ? empMap[r.buCode].size : 0)),
          monthly:  Math.round(r.monthly),
          kifiya:   Math.round(r.kifiya),
          safee:    Math.round(r.safee),
          vcLabel:  [...r.vcs].filter(v => v && v !== 'Unknown').sort().join(' + ') || '—'
        }
      })

    const empsByKey = {}
    Object.entries(empMap).forEach(([k, empSet]) => {
      empsByKey[k] = [...empSet.values()].sort((a, b) => (a.employeeNo || '').localeCompare(b.employeeNo || ''))
    })

    return { tableRows: rows, empsByKey }
  }, [filteredHC, filteredPay, effectiveMonth, hcByBU, allBUs, filterType, filterVC, filterBU, validHC, monthEvo])

  const grandMonthly   = tableRows.reduce((s, r) => s + r.monthly, 0)
  const grandHeadcount = tableRows.reduce((s, r) => s + r.headcount, 0)
  const grandKifiya    = tableRows.reduce((s, r) => s + r.kifiya, 0)
  const grandSafee     = tableRows.reduce((s, r) => s + r.safee, 0)


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">HR Page Review</h2>
        <p className="text-xs text-muted font-medium">
          Active employees · headcount and payroll cost · all filters update instantly
        </p>
      </div>

      {/* ── Filter bar (shared across all People & Operations pages) ── */}
      <PeopleOpsFilterBar data={data} />

      {/* ── KPI row 1 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBlock label="Headcount"              value={fmtN(totalHeadcount)}            sub={filterType !== 'All' ? `${filterType} employees` : 'Active employees'} accent={NAVY} />
        <KpiBlock label="Monthly Cost to Company" value={fmtN(Math.round(totalMonthly))} sub={effectiveMonth} accent={NAVY} />
        <KpiBlock label="Annualised Cost YTD"     value={fmtN(Math.round(annualisedYTD))} sub={ytdLabel}      accent={NAVY} />
      </div>

      {/* ── KPI row 2 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBlock label="Kifiya (Monthly)"        value={fmtN(Math.round(kifiyaMonthly))} sub={effectiveMonth} accent={TEAL} />
        <KpiBlock label="MSP/Program (Monthly)" value={fmtN(Math.round(safeeMonthly))} sub={effectiveMonth} accent="#1A7A72" small />
        <KpiBlock label="Kifiya Share of Payroll"         value={fmtPct(kifiyaSharePct)}
          sub={`${fmtN(Math.round(kifiyaMonthly))} of ${fmtN(Math.round(totalMonthly))}`} accent={ORANGE} />
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-bold text-navy">Monthly Cost by Business Unit &amp; Virtual Company</h3>
          <p className="text-[10px] text-muted mt-0.5">
            {effectiveMonth} · {tableRows.length} rows · click a row to expand employees
          </p>
        </div>
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 620 }}>
          <table className="text-[11px] border-collapse w-full" style={{ minWidth: 760 }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: NAVY }}>
                <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20 min-w-[200px]" style={{ background: NAVY }}>Business Unit</th>
                <th className="px-4 py-3 font-bold text-white text-left whitespace-nowrap min-w-[80px]">Virtual Company</th>
                <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[80px]">Head Count</th>
                <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[140px]">Monthly Cost (ETB)</th>
                <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[70px]">% of Cost</th>
                <th className="px-4 py-3 font-bold text-right whitespace-nowrap min-w-[120px]" style={{ color: '#90D4CE' }}>Kifiya</th>
                <th className="px-4 py-3 font-bold text-right whitespace-nowrap min-w-[120px]" style={{ color: '#EB7D23' }}>MSP/Program</th>
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
