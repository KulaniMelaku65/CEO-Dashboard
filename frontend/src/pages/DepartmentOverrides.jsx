import { useState, useEffect, useMemo, Fragment } from 'react'
import PeopleOpsFilterBar from '../components/PeopleOpsFilterBar.jsx'
import ExportButton from '../components/ExportButton.jsx'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'
import { departmentOverrides } from '../lib/api.js'
import { buildEmployeeExportRows, buildExportMeta, EMPLOYEE_EXPORT_COLUMNS } from '../lib/csvExport.js'

const NAVY   = '#02404F'
const TEAL   = '#1FB6A6'
const ORANGE = '#EB7D23'
const RED    = '#E5544B'
// Same dark-theme row backgrounds as HR Analysis — this page is a structural replica
// of it (same hierarchy table, same KPI cards, same cost columns) with department
// reassignment added at the employee row via the Action column.
const ROW_BG = { even: '#0A3A46', odd: '#0E434D' }
const SEC_BG = { open: '#123C46', closed: '#0C3841' }
const JT_BG  = { open: '#123C46', closed: '#0A3540' }
const EMP_ROW_BG = '#0F3D46'

const fmtN   = (n) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US')
const fmtC   = (n) => (!n && n !== 0) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

export default function DepartmentOverrides({ data, onDataRefresh }) {
  const hr  = data?.hr           || {}
  const rev = data?.hrReview     || {}
  const ec  = data?.employeeCost || {}

  const sectionToDept    = hr.sectionToDept    || {}
  const deptDisplayNames = hr.deptDisplayNames || {}
  const dimensionNames   = data?.dimensionNames || {}
  const resolveParent = (code) => sectionToDept[code] || code

  const { filterBU, filterType, filterVC, filterSource, filterMonth, filterYear } = usePeopleOpsFilters()

  const [overrides, setOverrides]         = useState([])
  const [loadingOv, setLoadingOv]         = useState(true)
  const [expandedRows, setExpandedRows]   = useState({})
  const [expandedSections, setExpandedSections] = useState({})
  const [expandedJobTitles, setExpandedJobTitles] = useState({})
  const [editingNo, setEditingNo]         = useState(null)
  const [targetSection, setTarget]        = useState('')
  const [busy, setBusy]                   = useState(false)
  const [error, setError]                 = useState('')

  const loadOverrides = () => {
    setLoadingOv(true)
    departmentOverrides.list()
      .then(r => r.ok ? r.json() : [])
      .then(setOverrides)
      .catch(() => {})
      .finally(() => setLoadingOv(false))
  }
  useEffect(() => { loadOverrides() }, [])

  const overrideByNo = useMemo(() => {
    const m = {}
    overrides.forEach(o => { m[o.employee_no] = o })
    return m
  }, [overrides])

  // Every assignable section, grouped by parent BU display name.
  const sectionOptions = useMemo(() => {
    const codes = new Set([...Object.keys(sectionToDept), ...Object.keys(deptDisplayNames)])
    return [...codes].map(code => {
      const buCode = sectionToDept[code] || code
      const buName = deptDisplayNames[buCode] || dimensionNames[buCode] || buCode
      const label  = dimensionNames[code] || code
      return { code, label, buName }
    }).sort((a, b) => a.buName.localeCompare(b.buName) || a.label.localeCompare(b.label))
  }, [sectionToDept, deptDisplayNames, dimensionNames])

  const groupedSections = useMemo(() => {
    const g = {}
    sectionOptions.forEach(s => { (g[s.buName] ||= []).push(s) })
    return g
  }, [sectionOptions])

  const toggleRow      = (key) => setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }))
  const toggleSection  = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  const toggleJobTitle = (key) => setExpandedJobTitles(prev => ({ ...prev, [key]: !prev[key] }))

  const employeePayroll  = rev.employeePayroll || []
  const payrollMonths    = rev.payrollMonths   || ec.payrollMonths || []
  const stdPayrollMonths = rev.stdPayrollMonths || payrollMonths

  // Same effective-month resolution as HR Analysis: respect an explicit Month filter
  // even if unpaid yet, else fall back to the latest standard payroll month (or the
  // latest month in a selected year).
  const yearOnly = filterMonth === 'All' && filterYear !== 'All'
  const latestMonthInYear = yearOnly
    ? [...stdPayrollMonths].reverse().find(m => m.endsWith(' ' + filterYear))
      || [...payrollMonths].reverse().find(m => m.endsWith(' ' + filterYear))
    : null
  const effectiveMonth = filterMonth !== 'All'
    ? filterMonth
    : latestMonthInYear
    || stdPayrollMonths[stdPayrollMonths.length - 1] || payrollMonths[payrollMonths.length - 1] || ''
  const hasCostData = payrollMonths.includes(effectiveMonth)

  const activeRoster = hr.activeRoster || []
  const filteredRoster = useMemo(() => activeRoster.filter(r => {
    const parentBU = resolveParent(r.buCode)
    return (filterBU   === 'All' || r.buCode === filterBU || parentBU === filterBU) &&
           (filterType === 'All' || r.type   === filterType) &&
           (filterVC   === 'All' || r.vc     === filterVC)
  }), [activeRoster, filterBU, filterType, filterVC, sectionToDept])

  const filteredPayAll = useMemo(() => employeePayroll.filter(r => {
    const parentBU = resolveParent(r.buCode)
    return (filterBU     === 'All' || r.buCode === filterBU || parentBU === filterBU) &&
           (filterType   === 'All' || r.employeeType   === filterType) &&
           (filterVC     === 'All' || r.virtualCompany === filterVC) &&
           (filterSource === 'All' || r.payrollSource  === filterSource)
  }), [employeePayroll, filterBU, filterType, filterVC, filterSource, sectionToDept])

  const filteredPay = useMemo(() => filteredPayAll.filter(r => r.isCountable), [filteredPayAll])

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

  // ── BU → Section → Job Title → Employee, with cost + headcount ──
  const { tableRows } = useMemo(() => {
    const buMap = {}
    const getBU = (buCode, fallbackName) => {
      if (!buMap[buCode]) buMap[buCode] = {
        buCode, buName: deptDisplayNames[buCode] || dimensionNames[buCode] || fallbackName || buCode,
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
      if (r.isCountable) { bu.activeEmpSet.add(r.employeeNo); sec.activeEmpSet.add(r.employeeNo); jt.activeEmpSet.add(r.employeeNo) }

      if (!jt.employees.has(r.employeeNo)) {
        jt.employees.set(r.employeeNo, {
          employeeNo: r.employeeNo, name: r.name, virtualCompany: r.virtualCompany, payrollSource: r.payrollSource,
          employeeStatus: r.employeeStatus, isCountable: r.isCountable, sectionCode: r.sectionCode,
          kifiya: r.payrollSource === 'KIFIYA' ? vp : 0, safee: r.payrollSource === 'SAFEE' ? vp : 0
        })
      } else {
        const exi = jt.employees.get(r.employeeNo)
        if (r.payrollSource === 'KIFIYA') exi.kifiya += vp
        else                              exi.safee  += vp
        if (exi.payrollSource !== r.payrollSource) exi.payrollSource = 'Both'
      }
    })

    // Backstop with the live active roster — active employees with no payroll yet.
    filteredRoster.forEach(r => {
      const parent = resolveParent(r.buCode)
      const bu  = getBU(parent, r.buCode)
      const sec = getSection(bu, r.sectionCode, r.sectionName)
      const jt  = getJobTitle(sec, r.jobTitle)
      bu.vcs.add(r.vc)
      bu.activeEmpSet.add(r.employeeNo); sec.activeEmpSet.add(r.employeeNo); jt.activeEmpSet.add(r.employeeNo)
      if (!jt.employees.has(r.employeeNo)) {
        jt.employees.set(r.employeeNo, {
          employeeNo: r.employeeNo, name: r.name, virtualCompany: r.vc, payrollSource: null, sectionCode: r.sectionCode,
          employeeStatus: r.status || 'Active', isCountable: true, kifiya: 0, safee: 0
        })
      }
    })

    const rows = Object.values(buMap).map(bu => {
      const sections = Object.values(bu.sections).map(sec => {
        const jobTitles = Object.values(sec.jobTitles).map(jt => ({
          jobTitle: jt.jobTitle,
          headcount: jt.activeEmpSet.size,
          monthly: Math.round(jt.monthly), kifiya: Math.round(jt.kifiya), safee: Math.round(jt.safee),
          employees: [...jt.employees.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        })).sort((a, b) => b.monthly - a.monthly || a.jobTitle.localeCompare(b.jobTitle))
        return {
          sectionCode: sec.sectionCode, sectionName: sec.sectionName, headcount: sec.activeEmpSet.size,
          monthly: Math.round(sec.monthly), kifiya: Math.round(sec.kifiya), safee: Math.round(sec.safee), jobTitles
        }
      }).sort((a, b) => b.monthly - a.monthly || a.sectionName.localeCompare(b.sectionName))

      return {
        buCode: bu.buCode, buName: bu.buName, headcount: bu.activeEmpSet.size,
        monthly: Math.round(bu.monthly), kifiya: Math.round(bu.kifiya), safee: Math.round(bu.safee),
        vcLabel: [...bu.vcs].filter(v => v && v !== 'Unknown').sort().join(' + ') || '—',
        sections
      }
    }).sort((a, b) => b.monthly - a.monthly || a.buName.localeCompare(b.buName))

    return { tableRows: rows }
  }, [filteredPayAll, filteredRoster, effectiveMonth, deptDisplayNames, dimensionNames])

  const grandMonthly   = tableRows.reduce((s, r) => s + r.monthly, 0)
  const grandHeadcount = tableRows.reduce((s, r) => s + r.headcount, 0)
  const grandKifiya    = tableRows.reduce((s, r) => s + r.kifiya, 0)
  const grandSafee     = tableRows.reduce((s, r) => s + r.safee, 0)

  const exportRows = buildEmployeeExportRows(filteredPay, effectiveMonth, filteredRoster, deptDisplayNames)
  const exportMeta = buildExportMeta({ filterBU, filterType, filterVC, filterSource, effectiveMonth, deptDisplayNames })

  const startEdit = (emp) => { setEditingNo(emp.employeeNo); setTarget(emp.sectionCode || ''); setError('') }
  const cancelEdit = () => { setEditingNo(null); setTarget(''); setError('') }

  const applyChange = async (emp) => {
    if (!targetSection || targetSection === emp.sectionCode) { cancelEdit(); return }
    setBusy(true); setError('')
    try {
      const r = await departmentOverrides.set(emp.employeeNo, emp.name, emp.sectionCode, targetSection)
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Failed to save override.') }
      cancelEdit()
      loadOverrides()
      onDataRefresh?.()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const revert = async (employeeNo) => {
    setBusy(true); setError('')
    try {
      const r = await departmentOverrides.remove(employeeNo)
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Failed to revert override.') }
      loadOverrides()
      onDataRefresh?.()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">Organization Mapping</h2>
          <p className="text-xs text-muted font-medium">
            Review and manage employee organization mappings by business unit, section,
            job title, and employee. Department changes are dashboard-only and preserved
            across data syncs without modifying Business Central.
          </p>
        </div>
        <ExportButton
          rows={exportRows}
          columns={EMPLOYEE_EXPORT_COLUMNS}
          meta={exportMeta}
          filename={`department-overrides-${effectiveMonth || 'export'}.csv`.replace(/\s+/g, '-')}
          variant="dark"
        />
      </div>

      {busy && (
        <div className="px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 text-navy" style={{ background: 'rgba(31,182,166,0.12)' }}>
          <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0" style={{ borderColor: `${TEAL}44`, borderTopColor: TEAL }} />
          Applying change and resyncing dashboard data — this can take up to a minute…
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-xl text-xs font-bold" style={{ background: 'rgba(229,84,75,0.14)', color: RED }}>
          {error}
        </div>
      )}

      {/* ── Filter bar (shared across all People & Operations pages) ── */}
      <PeopleOpsFilterBar data={data} />

      {/* ── KPI row 1 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBlock label="Headcount" value={fmtN(grandHeadcount)} sub={filterType !== 'All' ? `${filterType} employees` : 'Active employees'} accent={NAVY} />
        <KpiBlock label="Monthly Cost to Company" value={hasCostData ? fmtN(Math.round(totalMonthly)) : '—'} sub={effectiveMonth + (hasCostData ? '' : ' · no payroll yet')} accent={NAVY} />
        <KpiBlock label="Annualised Cost YTD" value={fmtN(Math.round(annualisedYTD))} sub={ytdLabel} accent={NAVY} />
      </div>

      {/* ── KPI row 2 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBlock label="Corporate (Monthly)" value={hasCostData ? fmtN(Math.round(kifiyaMonthly)) : '—'} sub={effectiveMonth} accent={TEAL} />
        <KpiBlock label="Programme (Monthly)" value={hasCostData ? fmtN(Math.round(safeeMonthly)) : '—'} sub={effectiveMonth} accent="#1A7A72" small />
        <KpiBlock label="Corporate Share of Payroll" value={hasCostData ? fmtPct(kifiyaSharePct) : '—'}
          sub={hasCostData ? `${fmtN(Math.round(kifiyaMonthly))} of ${fmtN(Math.round(totalMonthly))}` : 'No payroll data yet'} accent={ORANGE} />
        <KpiBlock label="Active Overrides" value={loadingOv ? '—' : fmtN(overrides.length)} sub="Dashboard-only, not in BC" accent="#5B4B8A" small />
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
          <table className="text-[11px] border-collapse w-full" style={{ minWidth: 980 }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: NAVY }}>
                <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20 min-w-[240px]" style={{ background: NAVY }}>Business Unit / Section / Job Title / Employee</th>
                <th className="px-4 py-3 font-bold text-white text-left whitespace-nowrap min-w-[80px]">Virtual Company</th>
                <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[80px]">Head Count</th>
                <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[140px]">Monthly Cost (ETB)</th>
                <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[70px]">% of Cost</th>
                <th className="px-4 py-3 font-bold text-right whitespace-nowrap min-w-[120px]" style={{ color: '#90D4CE' }}>Corporate</th>
                <th className="px-4 py-3 font-bold text-right whitespace-nowrap min-w-[120px]" style={{ color: ORANGE }}>Programme</th>
                <th className="px-4 py-3 font-bold text-white text-left whitespace-nowrap min-w-[220px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">No data for the selected filters.</td></tr>
              ) : tableRows.map((row, bi) => {
                const buKey  = row.buCode
                const buOpen = !!expandedRows[buKey]
                const buPct  = grandMonthly > 0 ? (row.monthly / grandMonthly) * 100 : 0
                const buBg   = bi % 2 === 0 ? ROW_BG.even : ROW_BG.odd
                return (
                  <Fragment key={buKey}>
                    {/* Level 1: Business Unit */}
                    <tr className="border-t border-border cursor-pointer hover:bg-white/5 transition-colors" style={{ background: buBg }} onClick={() => toggleRow(buKey)}>
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
                      <td className="px-4 py-2.5" />
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
                              <span className="inline-block w-4 text-[8px] font-extrabold" style={{ color: TEAL }}>{secOpen ? '▾' : '▸'}</span>
                              <span className="font-semibold text-navy">{sec.sectionName}</span>
                              <span className="ml-1.5 text-[9px] text-muted">({sec.jobTitles.length} title{sec.jobTitles.length !== 1 ? 's' : ''})</span>
                            </td>
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2 text-right tabular-nums text-navy">{sec.headcount || '—'}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-navy">{fmtC(sec.monthly || null)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-muted">{fmtPct(secPct)}</td>
                            <td className="px-4 py-2 text-right tabular-nums" style={{ color: TEAL }}>{fmtC(sec.kifiya || null)}</td>
                            <td className="px-4 py-2 text-right tabular-nums" style={{ color: ORANGE }}>{fmtC(sec.safee || null)}</td>
                            <td className="px-4 py-2" />
                          </tr>

                          {/* Level 3: Job Titles */}
                          {secOpen && sec.jobTitles.map(jt => {
                            const jtKey  = `${secKey}|${jt.jobTitle}`
                            const jtOpen = !!expandedJobTitles[jtKey]
                            const jtBg   = jtOpen ? JT_BG.open : JT_BG.closed
                            const jtPct  = sec.monthly > 0 ? (jt.monthly / sec.monthly) * 100 : 0
                            return (
                              <Fragment key={jtKey}>
                                <tr className="cursor-pointer border-t border-border/30 transition-colors" style={{ background: jtBg }} onClick={() => toggleJobTitle(jtKey)}>
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
                                  <td className="px-4 py-1.5" />
                                </tr>

                                {/* Level 4: Employees — where Change Department lives */}
                                {jtOpen && jt.employees.map(emp => {
                                  const isEditing = editingNo === emp.employeeNo
                                  const hasOverride = !!overrideByNo[emp.employeeNo]
                                  const vc = emp.virtualCompany && emp.virtualCompany !== 'Unknown' ? emp.virtualCompany : ''
                                  const total = emp.kifiya + emp.safee
                                  const pctEmp = jt.monthly > 0 ? (total / jt.monthly) * 100 : 0
                                  return (
                                    <tr key={emp.employeeNo} className="border-t border-border/20" style={{ background: EMP_ROW_BG }}>
                                      <td className="pl-20 pr-4 py-1.5 font-medium text-navy sticky left-0 z-10 text-[11px]" style={{ background: EMP_ROW_BG }}>
                                        {[emp.employeeNo, emp.name].filter(Boolean).join(' · ')}
                                        {emp.employeeStatus && !emp.isCountable && (
                                          <span className="ml-1.5 text-[8px] font-bold px-1 py-0.5 rounded-full bg-amber-100 text-amber-700 align-middle">{emp.employeeStatus}</span>
                                        )}
                                        {hasOverride && (
                                          <span className="ml-1.5 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full" style={{ background: `${TEAL}33`, color: TEAL }}>OVERRIDDEN</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-1.5 text-[10px] text-muted">{vc}</td>
                                      <td className="px-4 py-1.5" />
                                      <td className="px-4 py-1.5 text-right tabular-nums text-muted text-[10px]">{fmtC(total || null)}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums text-[10px] text-muted">{fmtPct(pctEmp)}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums text-[10px]" style={{ color: TEAL }}>{emp.kifiya ? fmtC(emp.kifiya) : '—'}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums text-[10px]" style={{ color: ORANGE }}>{emp.safee ? fmtC(emp.safee) : '—'}</td>
                                      <td className="px-4 py-1.5">
                                        {!isEditing ? (
                                          <button
                                            onClick={() => startEdit(emp)}
                                            disabled={busy}
                                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-border text-navy hover:border-navy transition-colors disabled:opacity-40"
                                          >
                                            Change Department
                                          </button>
                                        ) : (
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <select
                                              value={targetSection}
                                              onChange={e => setTarget(e.target.value)}
                                              className="text-[10px] rounded-lg px-2 py-1 bg-white text-navy border border-border"
                                              style={{ minWidth: 180 }}
                                            >
                                              {Object.entries(groupedSections).map(([buName, opts]) => (
                                                <optgroup key={buName} label={buName}>
                                                  {opts.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                                                </optgroup>
                                              ))}
                                            </select>
                                            <button onClick={() => applyChange(emp)} disabled={busy} className="text-[10px] font-bold px-2.5 py-1 rounded-lg text-white disabled:opacity-40" style={{ background: ORANGE }}>Confirm</button>
                                            <button onClick={cancelEdit} disabled={busy} className="text-[10px] font-bold px-2 py-1 text-muted">Cancel</button>
                                          </div>
                                        )}
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
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Active overrides — audit trail + revert ── */}
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h3 className="text-sm font-bold text-navy">Active Overrides {overrides.length > 0 && `(${overrides.length})`}</h3>
          <p className="text-[10px] text-muted mt-0.5">Reverting removes the override — the employee goes back to whatever Business Central reports on the next sync.</p>
        </div>
        {loadingOv ? (
          <p className="text-xs px-5 py-4 text-muted">Loading…</p>
        ) : overrides.length === 0 ? (
          <p className="text-xs px-5 py-4 text-muted">No overrides set — every employee is showing their Business Central department.</p>
        ) : (
          <div className="divide-y divide-border">
            {overrides.map(o => (
              <div key={o.employee_no} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-navy">{o.employee_name || o.employee_no}</p>
                  <p className="text-[10px] mt-0.5 text-muted">
                    {dimensionNames[o.from_section] || o.from_section || 'Unknown'} → <span style={{ color: TEAL, fontWeight: 700 }}>{dimensionNames[o.section_code] || o.section_code}</span>
                  </p>
                  <p className="text-[10px] mt-0.5 text-muted">by {o.updated_by || 'unknown'} · {new Date(o.updated_at + 'Z').toLocaleString()}</p>
                </div>
                <button
                  onClick={() => revert(o.employee_no)}
                  disabled={busy}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border transition-colors disabled:opacity-40"
                  style={{ color: RED }}
                >
                  Revert
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
