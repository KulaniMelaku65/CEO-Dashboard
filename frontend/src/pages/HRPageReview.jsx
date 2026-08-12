import { useState, useMemo, Fragment } from 'react'
import PeopleOpsFilterBar from '../components/PeopleOpsFilterBar.jsx'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'

const NAVY   = '#02404F'
const TEAL   = '#1FB6A6'
const ORANGE = '#EB7D23'
// Zebra-stripe / hover-state row backgrounds for the dark theme — swapped in place of
// the near-white pastels this table used to use (those relied on white being the page
// background; on the dark shell they'd leave white text on a near-white row = invisible).
const ROW_BG        = { even: '#0A3A46', odd: '#0E434D' }
const SEC_BG         = { open: '#123C46', closed: '#0C3841' }
const JT_BG           = { open: '#123C46', closed: '#0A3540' }
const EMP_ROW_BG    = '#0F3D46'

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
  // recent payroll month within that year so point-in-time COST KPIs land on the
  // latest data we actually have for the chosen year.
  const yearOnly = filterMonth === 'All' && filterYear !== 'All'
  const latestMonthInYear = yearOnly
    ? [...stdPayrollMonths].reverse().find(m => m.endsWith(' ' + filterYear))
      || [...payrollMonths].reverse().find(m => m.endsWith(' ' + filterYear))
    : null

  // Use global filterMonth when explicitly set — respected exactly, even if that month
  // has no payroll data yet (e.g. the current in-progress month), so cost figures
  // correctly compute to zero/"—" instead of silently substituting a different month's
  // numbers under a label the user didn't pick. Only when nothing is explicitly chosen
  // do we fall back to the most recent standard payroll month. stdPayrollMonths excludes
  // consultant-only months, preventing a scenario where IC payroll has a newer period
  // than staff payroll and staff all show zero cost by default.
  const effectiveMonth = filterMonth !== 'All'
    ? filterMonth
    : latestMonthInYear
    || stdPayrollMonths[stdPayrollMonths.length - 1] || payrollMonths[payrollMonths.length - 1] || ''

  // Whether effectiveMonth actually has payroll data — drives "—" display for cost
  // KPIs/columns instead of a misleading 0 when the selected month hasn't been paid yet.
  const hasCostData = payrollMonths.includes(effectiveMonth)

  // Headcount is live/current, unlike cost — it isn't gated by payroll having run yet,
  // so it's resolved straight against hr.headcountEvolution's own labels (which include
  // a live "current month" bucket even with zero payroll data), the same way the
  // People & HR page does it. Using effectiveMonth here would wrongly pin headcount to
  // the latest payroll month instead of showing today's real headcount.
  const hcEvoLabels = hr.headcountEvolution || []
  const headcountMonthLabel = filterMonth !== 'All'
    ? filterMonth
    : (yearOnly ? [...hcEvoLabels].reverse().find(m => m.label.endsWith(' ' + filterYear))?.label || null : null)

  const [expandedSections,  setExpandedSections]  = useState({})
  const [expandedJobTitles, setExpandedJobTitles] = useState({})

  const toggleRow     = (key) => setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }))
  const toggleSection = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  const toggleJobTitle = (key) => setExpandedJobTitles(prev => ({ ...prev, [key]: !prev[key] }))

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
  // Two variants: cost KPIs use ALL employees who were actually paid that month —
  // the company genuinely incurred that cost regardless of their status today —
  // while the BU/Section/Job Title/Employee table stays active-only, since job
  // title/description is only reliably known for active people (sourced from the
  // live headcount table), so inactive rows there fall back to "Unknown".
  const filteredPayAll = useMemo(() => employeePayroll.filter(r => {
    const parentBU = resolveParent(r.buCode)
    return (filterBU     === 'All' || r.buCode === filterBU || parentBU === filterBU) &&
           (filterType   === 'All' || r.employeeType   === filterType) &&
           (filterVC     === 'All' || r.virtualCompany === filterVC) &&
           (filterSource === 'All' || r.payrollSource  === filterSource)
  }), [employeePayroll, filterBU, filterType, filterVC, filterSource, sectionToDept])

  const filteredPay = useMemo(() =>
    filteredPayAll.filter(r => r.employeeStatus === 'Active'),
    [filteredPayAll])

  // ── Filter active roster (live, from KFT_Employee_Headcount) ───────────────
  // Backstops the payroll-derived employee drill-down: some currently-active employees
  // have no payroll history at all yet (new hires) and would otherwise be missing.
  const activeRoster = hr.activeRoster || []
  const filteredRoster = useMemo(() => activeRoster.filter(r => {
    const parentBU = resolveParent(r.buCode)
    return (filterBU   === 'All' || r.buCode === filterBU || parentBU === filterBU) &&
           (filterType === 'All' || r.type   === filterType) &&
           (filterVC   === 'All' || r.vc     === filterVC)
  }), [activeRoster, filterBU, filterType, filterVC, sectionToDept])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  // Headcount is a point-in-time figure — headcountMatrix only reflects "now", so a
  // month/year selection needs hr.headcountEvolution's separate reconstruction instead,
  // which also carries a byBU breakdown (used below for the per-row table headcount) —
  // same source and same behaviour as the People & HR page. Looked up by
  // headcountMonthLabel (live), not effectiveMonth (payroll-gated) — see above.
  const monthEvo = headcountMonthLabel
    ? hcEvoLabels.find(m => m.label === headcountMonthLabel)
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
    // are not in the employee headcount table), fall back to unique employees from payroll —
    // restricted to employeeStatus === 'Active' so people who merely had a payroll transaction
    // at some point (but have since left) aren't counted as current headcount.
    if (hcCount === 0 && filteredPay.length > 0)
      return new Set(filteredPay.filter(r => r.employeeStatus === 'Active').map(r => r.employeeNo)).size
    return hcCount
  }, [validHC, filteredHC, filteredPay, filterBU, filterType, filterVC, monthHeadcount])

  const { totalMonthly, kifiyaMonthly, safeeMonthly } = useMemo(() => {
    let total = 0, kifiya = 0, safee = 0
    filteredPayAll.forEach(r => {
      const v = (r.monthTotals[effectiveMonth] || 0) + (r.pensionMonthTotals?.[effectiveMonth] || 0)
      total += v
      if (r.payrollSource === 'KIFIYA') kifiya += v
      else                              safee  += v
    })
    return { totalMonthly: total, kifiyaMonthly: kifiya, safeeMonthly: safee }
  }, [filteredPayAll, effectiveMonth])

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

    const sum = filteredPayAll.reduce((s, r) =>
      s + ytdMonths.reduce((ss, m) => ss + (r.monthTotals[m] || 0) + (r.pensionMonthTotals?.[m] || 0), 0), 0)

    const label = ytdMonths.length === 0 ? '—'
      : ytdMonths.length === 1 ? ytdMonths[0]
      : `${ytdMonths[0].split(' ')[0]} – ${ytdMonths[ytdMonths.length - 1]}`

    return { annualisedYTD: sum, ytdLabel: label }
  }, [filteredPayAll, payrollMonths, effectiveMonth])

  // ── Table rows: BU → Section → Job Title → Employee ─────────────────────
  const { tableRows } = useMemo(() => {
    const buMap = {}   // buCode → { ...totals, vcs, activeEmpSet, sections: { sectionCode → {...} } }
    // Build name lookup from hierarchy; only used for display — not as a whitelist
    const buNameFromHierarchy = {}
    allBUs.forEach(b => { buNameFromHierarchy[b.value] = b.label })
    const resolveBUName = (parent, fallbackName) =>
      buNameFromHierarchy[parent] || fallbackName || parent

    const getBU = (buCode, fallbackName) => {
      if (!buMap[buCode]) buMap[buCode] = {
        buCode, buName: resolveBUName(buCode, fallbackName),
        monthly: 0, kifiya: 0, safee: 0, vcs: new Set(), activeEmpSet: new Set(), sections: {}
      }
      return buMap[buCode]
    }
    const getSection = (bu, sectionCode, sectionName) => {
      const code = sectionCode || bu.buCode
      if (!bu.sections[code]) bu.sections[code] = {
        sectionCode: code, sectionName: sectionName || code,
        monthly: 0, kifiya: 0, safee: 0, activeEmpSet: new Set(), jobTitles: {}
      }
      return bu.sections[code]
    }
    const getJobTitle = (sec, jobTitle) => {
      const jt = jobTitle && jobTitle !== 'Unknown' ? jobTitle : 'Unspecified'
      if (!sec.jobTitles[jt]) sec.jobTitles[jt] = {
        jobTitle: jt, monthly: 0, kifiya: 0, safee: 0, activeEmpSet: new Set(), employees: new Map()
      }
      return sec.jobTitles[jt]
    }

    // Cost + employees from filteredPayAll (active + inactive who were paid that
    // month) — grouped BU → Section → Job Title → Employee. A row only lands in the
    // drill-down when it actually has cost for effectiveMonth — this keeps the list
    // dynamic per month: someone who left three months ago simply stops appearing
    // once their last paid month is behind effectiveMonth, instead of lingering
    // forever with a phantom $0 row. Head Count itself only ever counts Active
    // employees (activeEmpSet) — matching headcount semantics everywhere else in the
    // app — so an inactive person who got a final paycheck this month still shows up
    // as a cost row (tagged "Inactive" for clarity) without inflating Head Count.
    filteredPayAll.forEach(r => {
      const vp = (r.monthTotals[effectiveMonth] || 0) + (r.pensionMonthTotals?.[effectiveMonth] || 0)
      if (vp === 0) return

      const parent = resolveParent(r.buCode)
      const bu  = getBU(parent, r.buName)
      const sec = getSection(bu, r.sectionCode, r.sectionName)
      const jt  = getJobTitle(sec, r.jobTitle)

      bu.monthly += vp; sec.monthly += vp; jt.monthly += vp
      if (r.payrollSource === 'KIFIYA') { bu.kifiya += vp; sec.kifiya += vp; jt.kifiya += vp }
      else                              { bu.safee  += vp; sec.safee  += vp; jt.safee  += vp }
      bu.vcs.add(r.virtualCompany)
      if (r.employeeStatus === 'Active') {
        bu.activeEmpSet.add(r.employeeNo); sec.activeEmpSet.add(r.employeeNo); jt.activeEmpSet.add(r.employeeNo)
      }

      if (!jt.employees.has(r.employeeNo)) {
        jt.employees.set(r.employeeNo, {
          employeeNo: r.employeeNo, name: r.name, virtualCompany: r.virtualCompany, payrollSource: r.payrollSource,
          employeeStatus: r.employeeStatus,
          kifiya: r.payrollSource === 'KIFIYA' ? vp : 0, safee: r.payrollSource === 'SAFEE' ? vp : 0
        })
      } else {
        const ex = jt.employees.get(r.employeeNo)
        if (r.payrollSource === 'KIFIYA') ex.kifiya += vp
        else                              ex.safee  += vp
        if (ex.payrollSource !== r.payrollSource) ex.payrollSource = 'Both'
      }
    })

    // Backstop with the live active roster — covers active employees with no payroll
    // history at all (e.g. very recent hires, or a month before any payroll has run
    // for them yet) who would otherwise be entirely missing from the drill-down.
    // Cost stays 0 for these (→ "—"), since there's nothing to show for effectiveMonth.
    filteredRoster.forEach(r => {
      const parent = resolveParent(r.buCode)
      const bu  = getBU(parent, r.buCode)
      const sec = getSection(bu, r.sectionCode, r.sectionName)
      const jt  = getJobTitle(sec, r.jobTitle)
      bu.vcs.add(r.vc)
      bu.activeEmpSet.add(r.employeeNo); sec.activeEmpSet.add(r.employeeNo); jt.activeEmpSet.add(r.employeeNo)

      if (!jt.employees.has(r.employeeNo)) {
        jt.employees.set(r.employeeNo, {
          employeeNo: r.employeeNo, name: r.name, virtualCompany: r.vc, payrollSource: null,
          employeeStatus: 'Active', kifiya: 0, safee: 0
        })
      }
    })

    const rows = Object.values(buMap)
      .map(bu => {
        // Month/year selected: use the point-in-time reconstruction for that BU instead
        // of "now" — same headcount source as the People & HR page for that month.
        const buMonthEvo = (filterType === 'All' && filterVC === 'All') ? monthEvo?.byBU?.[bu.buCode] : null
        const headcount = buMonthEvo ? buMonthEvo.count : bu.activeEmpSet.size

        const sections = Object.values(bu.sections)
          .map(sec => {
            const jobTitles = Object.values(sec.jobTitles)
              .map(jt => ({
                jobTitle:  jt.jobTitle,
                headcount: jt.activeEmpSet.size,
                monthly:   Math.round(jt.monthly),
                kifiya:    Math.round(jt.kifiya),
                safee:     Math.round(jt.safee),
                employees: [...jt.employees.values()].sort((a, b) => (a.employeeNo || '').localeCompare(b.employeeNo || ''))
              }))
              .sort((a, b) => b.monthly - a.monthly || a.jobTitle.localeCompare(b.jobTitle))
            return {
              sectionCode: sec.sectionCode,
              sectionName: sec.sectionName,
              headcount:   sec.activeEmpSet.size,
              monthly:     Math.round(sec.monthly),
              kifiya:      Math.round(sec.kifiya),
              safee:       Math.round(sec.safee),
              jobTitles
            }
          })
          .sort((a, b) => b.monthly - a.monthly || a.sectionName.localeCompare(b.sectionName))

        return {
          buCode: bu.buCode, buName: bu.buName, headcount,
          monthly: Math.round(bu.monthly),
          kifiya:  Math.round(bu.kifiya),
          safee:   Math.round(bu.safee),
          vcLabel: [...bu.vcs].filter(v => v && v !== 'Unknown').sort().join(' + ') || '—',
          sections
        }
      })
      .sort((a, b) => b.monthly - a.monthly || a.buName.localeCompare(b.buName))

    return { tableRows: rows }
  }, [filteredPayAll, filteredRoster, effectiveMonth, allBUs, filterType, filterVC, monthEvo])

  const grandMonthly   = tableRows.reduce((s, r) => s + r.monthly, 0)
  const grandHeadcount = tableRows.reduce((s, r) => s + r.headcount, 0)
  const grandKifiya    = tableRows.reduce((s, r) => s + r.kifiya, 0)
  const grandSafee     = tableRows.reduce((s, r) => s + r.safee, 0)


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">HR Analysis</h2>
        <p className="text-xs text-muted font-medium">
          Active employees · headcount and payroll cost · all filters update instantly
        </p>
      </div>

      {/* ── Filter bar (shared across all People & Operations pages) ── */}
      <PeopleOpsFilterBar data={data} />

      {/* ── KPI row 1 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBlock label="Headcount"              value={fmtN(totalHeadcount)}            sub={filterType !== 'All' ? `${filterType} employees` : 'Active employees'} accent={NAVY} />
        <KpiBlock label="Monthly Cost to Company" value={hasCostData ? fmtN(Math.round(totalMonthly)) : '—'} sub={effectiveMonth + (hasCostData ? '' : ' · no payroll yet')} accent={NAVY} />
        <KpiBlock label="Annualised Cost YTD"     value={fmtN(Math.round(annualisedYTD))} sub={ytdLabel}      accent={NAVY} />
      </div>

      {/* ── KPI row 2 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBlock label="Kifiya (Monthly)"        value={hasCostData ? fmtN(Math.round(kifiyaMonthly)) : '—'} sub={effectiveMonth} accent={TEAL} />
        <KpiBlock label="MSP/Program (Monthly)" value={hasCostData ? fmtN(Math.round(safeeMonthly)) : '—'} sub={effectiveMonth} accent="#1A7A72" small />
        <KpiBlock label="Kifiya Share of Payroll"         value={hasCostData ? fmtPct(kifiyaSharePct) : '—'}
          sub={hasCostData ? `${fmtN(Math.round(kifiyaMonthly))} of ${fmtN(Math.round(totalMonthly))}` : 'No payroll data yet'} accent={ORANGE} />
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-bold text-navy">Monthly Cost by Business Unit &amp; Virtual Company</h3>
          <p className="text-[10px] text-muted mt-0.5">
            {effectiveMonth} · {tableRows.length} business units · click to drill into section → job title → employee
          </p>
        </div>
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 620 }}>
          <table className="text-[11px] border-collapse w-full" style={{ minWidth: 820 }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: NAVY }}>
                <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20 min-w-[240px]" style={{ background: NAVY }}>Business Unit / Section / Job Title / Employee</th>
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
              ) : tableRows.map((row, bi) => {
                const buKey  = row.buCode
                const buOpen = !!expandedRows[buKey]
                const buPct  = grandMonthly > 0 ? (row.monthly / grandMonthly) * 100 : 0
                const buBg   = bi % 2 === 0 ? ROW_BG.even : ROW_BG.odd
                return (
                  <Fragment key={buKey}>
                    {/* Level 1: Business Unit */}
                    <tr
                      className="border-t border-border cursor-pointer hover:bg-white/5 transition-colors"
                      style={{ background: buBg }}
                      onClick={() => toggleRow(buKey)}
                    >
                      <td className="px-4 py-2.5 font-semibold text-navy sticky left-0 z-10" style={{ background: buBg }}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[10px] text-muted w-3">{buOpen ? '▾' : '▸'}</span>
                          {row.buName || row.buCode}
                          <span className="text-[9px] font-normal text-muted">({row.sections.length} section{row.sections.length !== 1 ? 's' : ''})</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5"><span className="text-[10px] font-semibold text-muted">{row.vcLabel}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-navy">{row.headcount || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-navy">{fmtC(row.monthly || null)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">{fmtPct(buPct)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: TEAL }}>{fmtC(row.kifiya || null)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: ORANGE }}>{fmtC(row.safee || null)}</td>
                    </tr>

                    {/* Level 2: Sections */}
                    {buOpen && row.sections.map(sec => {
                      const secKey  = `${buKey}|${sec.sectionCode}`
                      const secOpen = !!expandedSections[secKey]
                      const secBg   = secOpen ? SEC_BG.open : SEC_BG.closed
                      const secPct  = row.monthly > 0 ? (sec.monthly / row.monthly) * 100 : 0
                      return (
                        <Fragment key={secKey}>
                          <tr
                            className="cursor-pointer border-t border-border/40 transition-colors"
                            style={{ background: secBg }}
                            onClick={() => toggleSection(secKey)}
                            onMouseEnter={e => { if (!secOpen) e.currentTarget.style.background = '#164752' }}
                            onMouseLeave={e => { e.currentTarget.style.background = secBg }}
                          >
                            <td className="pl-8 pr-4 py-2 sticky left-0 z-10" style={{ background: secBg }}>
                              <span className="inline-block w-4 text-[8px] font-extrabold" style={{ color: '#1FB6A6' }}>{secOpen ? '▾' : '▸'}</span>
                              <span className="font-semibold text-navy">{sec.sectionName}</span>
                              <span className="ml-1.5 text-[9px] text-muted">({sec.jobTitles.length} title{sec.jobTitles.length !== 1 ? 's' : ''})</span>
                            </td>
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2 text-right tabular-nums text-navy">{sec.headcount || '—'}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-navy">{fmtC(sec.monthly || null)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-muted">{fmtPct(secPct)}</td>
                            <td className="px-4 py-2 text-right tabular-nums" style={{ color: TEAL }}>{fmtC(sec.kifiya || null)}</td>
                            <td className="px-4 py-2 text-right tabular-nums" style={{ color: ORANGE }}>{fmtC(sec.safee || null)}</td>
                          </tr>

                          {/* Level 3: Job Titles */}
                          {secOpen && sec.jobTitles.map(jt => {
                            const jtKey  = `${secKey}|${jt.jobTitle}`
                            const jtOpen = !!expandedJobTitles[jtKey]
                            const jtBg   = jtOpen ? JT_BG.open : JT_BG.closed
                            const jtPct  = sec.monthly > 0 ? (jt.monthly / sec.monthly) * 100 : 0
                            return (
                              <Fragment key={jtKey}>
                                <tr
                                  className="cursor-pointer border-t border-border/30 transition-colors"
                                  style={{ background: jtBg }}
                                  onClick={() => toggleJobTitle(jtKey)}
                                >
                                  <td className="pl-14 pr-4 py-1.5 sticky left-0 z-10" style={{ background: jtBg }}>
                                    <span className="inline-block w-4 text-[8px] font-extrabold text-muted">{jtOpen ? '▾' : '▸'}</span>
                                    <span className="font-medium text-navy text-[10.5px]">{jt.jobTitle}</span>
                                    <span className="ml-1.5 text-[9px] text-muted">({jt.employees.length})</span>
                                  </td>
                                  <td className="px-4 py-1.5" />
                                  <td className="px-4 py-1.5 text-right tabular-nums text-[10.5px] text-navy">{jt.headcount || '—'}</td>
                                  <td className="px-4 py-1.5 text-right tabular-nums text-[10.5px] text-navy">{fmtC(jt.monthly || null)}</td>
                                  <td className="px-4 py-1.5 text-right tabular-nums text-[10.5px] text-muted">{fmtPct(jtPct)}</td>
                                  <td className="px-4 py-1.5 text-right tabular-nums text-[10.5px]" style={{ color: TEAL }}>{fmtC(jt.kifiya || null)}</td>
                                  <td className="px-4 py-1.5 text-right tabular-nums text-[10.5px]" style={{ color: ORANGE }}>{fmtC(jt.safee || null)}</td>
                                </tr>

                                {/* Level 4: Employees */}
                                {jtOpen && jt.employees.map(emp => {
                                  const vc    = emp.virtualCompany && emp.virtualCompany !== 'Unknown' ? emp.virtualCompany : ''
                                  const total = emp.kifiya + emp.safee
                                  const pctEmp = jt.monthly > 0 ? (total / jt.monthly) * 100 : 0
                                  return (
                                    <tr key={`${jtKey}-${emp.employeeNo}`} className="border-t border-border/20" style={{ background: EMP_ROW_BG }}>
                                      <td className="pl-20 pr-4 py-1.5 font-medium text-navy sticky left-0 z-10 text-[11px]" style={{ background: EMP_ROW_BG }}>
                                        {[emp.employeeNo, emp.name].filter(Boolean).join(' · ')}
                                        {emp.employeeStatus && emp.employeeStatus !== 'Active' && (
                                          <span className="ml-1.5 text-[8px] font-bold px-1 py-0.5 rounded-full bg-amber-100 text-amber-700 align-middle">
                                            {emp.employeeStatus}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-1.5 text-[10px] text-muted">{vc}</td>
                                      <td className="px-4 py-1.5" />
                                      <td className="px-4 py-1.5 text-right tabular-nums text-muted text-[10px]">{fmtC(total || null)}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums text-[10px] text-muted">{fmtPct(pctEmp)}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums text-[10px]" style={{ color: TEAL }}>
                                        {emp.kifiya ? fmtC(emp.kifiya) : '—'}
                                      </td>
                                      <td className="px-4 py-1.5 text-right tabular-nums text-[10px]" style={{ color: ORANGE }}>
                                        {emp.safee ? fmtC(emp.safee) : '—'}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </Fragment>
                            )
                          })}
                        </Fragment>
                      )
                    })}
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
