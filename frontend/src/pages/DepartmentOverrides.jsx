import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import PeopleOpsFilterBar from '../components/PeopleOpsFilterBar.jsx'
import ExportButton from '../components/ExportButton.jsx'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'
import { departmentOverrides, budgetSourceOverrides as bsOverrideApi, payrollCurrencyCorrections as currencyApi } from '../lib/api.js'
import { buildEmployeeExportRows, buildExportMeta, EMPLOYEE_EXPORT_COLUMNS } from '../lib/csvExport.js'
import { compareByTitleRank } from '../lib/titleRank.js'

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

function KpiBlock({ label, value, sub, accent, small, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`flex flex-col justify-between p-4 rounded-xl text-left w-full ${onClick ? 'cursor-pointer hover:brightness-110 transition-[filter]' : ''}`}
      style={{ background: accent || NAVY }}
    >
      <p className="text-[9px] uppercase tracking-widest font-bold text-white/60 leading-tight">{label}</p>
      <p className={`font-extrabold text-white leading-none mt-2 tabular-nums ${small ? 'text-[18px]' : 'text-[22px]'}`}>{value}</p>
      {sub && <p className="text-[10px] text-white/50 mt-1 truncate">{sub}</p>}
    </Tag>
  )
}

export default function DepartmentOverrides({ data, onDataRefresh, currentUser }) {
  // Payroll Currency Corrections is gated separately from the rest of this page — see
  // routes/payroll-currency-corrections.js's requireFeatureAccess and AdminUsers.jsx's
  // "Sensitive features" toggle. Not everyone who can reach Organization Mapping (for
  // Department/Budget Source overrides) should also be able to relabel payroll currency.
  const canManageCurrency = !!currentUser?.isAdmin || !!currentUser?.pageIds?.includes('payroll-currency-corrections')
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
  const [historyOpenNo, setHistoryOpenNo] = useState(null)
  const [historyByEmp, setHistoryByEmp]   = useState({})
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Budget Source override — a second, independent override type on the same employee
  // rows (own table, own audit trail, own "Active Overrides" list below), mirroring the
  // department override above exactly. See backend/db.js's budget_source_overrides for
  // why this is a different KIND of override: it relabels payroll rows, not a grouping tag.
  const [bsOverrides, setBsOverrides]         = useState([])
  const [loadingBsOv, setLoadingBsOv]         = useState(true)
  const [editingSourceNo, setEditingSourceNo] = useState(null)
  const [targetBudgetSource, setTargetBudgetSource] = useState('')
  const [bsHistoryOpenNo, setBsHistoryOpenNo] = useState(null)
  const [bsHistoryByEmp, setBsHistoryByEmp]   = useState({})
  const [loadingBsHistory, setLoadingBsHistory] = useState(false)

  // Payroll Currency Corrections — a third, independent correction type, but unlike
  // department/budget source it isn't a standing employee attribute editable from a table
  // row: it corrects one specific voucher's wrong currency tag for one specific month (see
  // backend/db.js's payroll_currency_corrections). So instead of an Action-column button,
  // this is its own small form + list panel, keyed by voucher number rather than employee.
  const [ccCorrections, setCcCorrections]   = useState([])
  const [loadingCc, setLoadingCc]           = useState(true)
  const [ccForm, setCcForm] = useState({ voucherNo: '', employeeNo: '', employeeName: '', correctCurrency: 'ETB', note: '' })
  const [ccBusy, setCcBusy]   = useState(false)
  const [ccError, setCcError] = useState('')

  // Scroll target for the "Active Overrides" KPI card — clicking it jumps straight to the
  // audit-trail panels below instead of making the admin hunt for them by scrolling.
  const overridesPanelRef = useRef(null)
  const scrollToOverrides = () => overridesPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const loadOverrides = () => {
    setLoadingOv(true)
    departmentOverrides.list()
      .then(r => r.ok ? r.json() : [])
      .then(setOverrides)
      .catch(() => {})
      .finally(() => setLoadingOv(false))
  }
  const loadBsOverrides = () => {
    setLoadingBsOv(true)
    bsOverrideApi.list()
      .then(r => r.ok ? r.json() : [])
      .then(setBsOverrides)
      .catch(() => {})
      .finally(() => setLoadingBsOv(false))
  }
  const loadCcCorrections = () => {
    setLoadingCc(true)
    currencyApi.list()
      .then(r => r.ok ? r.json() : [])
      .then(setCcCorrections)
      .catch(() => {})
      .finally(() => setLoadingCc(false))
  }
  useEffect(() => {
    loadOverrides(); loadBsOverrides()
    if (canManageCurrency) loadCcCorrections(); else setLoadingCc(false)
  }, [canManageCurrency])

  const submitCcCorrection = async (e) => {
    e.preventDefault()
    const { voucherNo, employeeNo, employeeName, correctCurrency, note } = ccForm
    if (!voucherNo.trim() || !employeeNo.trim()) { setCcError('Voucher number and employee number are required.'); return }
    setCcBusy(true); setCcError('')
    try {
      const r = await currencyApi.set(voucherNo.trim(), employeeNo.trim(), employeeName.trim(), correctCurrency, note.trim())
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Failed to save correction.') }
      setCcForm({ voucherNo: '', employeeNo: '', employeeName: '', correctCurrency: 'ETB', note: '' })
      loadCcCorrections(); onDataRefresh?.()
    } catch (err) { setCcError(err.message) } finally { setCcBusy(false) }
  }

  const removeCcCorrection = async (voucherNo) => {
    setCcBusy(true); setCcError('')
    try {
      const r = await currencyApi.remove(voucherNo)
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Failed to remove correction.') }
      loadCcCorrections(); onDataRefresh?.()
    } catch (err) { setCcError(err.message) } finally { setCcBusy(false) }
  }

  const overrideByNo = useMemo(() => {
    const m = {}
    overrides.forEach(o => { m[o.employee_no] = o })
    return m
  }, [overrides])

  const bsOverrideByNo = useMemo(() => {
    const m = {}
    bsOverrides.forEach(o => { m[o.employee_no] = o })
    return m
  }, [bsOverrides])

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

  // Point-in-time headcount for the selected month/year — same source and caveat as HR
  // Analysis: hr.headcountEvolution's byBU has no further type/VC split, so it's only
  // trusted for the headcount number when those filters aren't also narrowing things.
  // Without this, headcount always fell back to today's live roster count regardless of
  // which month was selected.
  const hcEvoLabels = hr.headcountEvolution || []
  const headcountMonthLabel = filterMonth !== 'All'
    ? filterMonth
    : (yearOnly ? [...hcEvoLabels].reverse().find(m => m.label.endsWith(' ' + filterYear))?.label || null : null)
  const monthEvo = headcountMonthLabel
    ? hcEvoLabels.find(m => m.label === headcountMonthLabel)
    : null

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
      const parent = resolveParent(r.buCode)
      const bu  = getBU(parent, r.buName)
      const sec = getSection(bu, r.sectionCode, r.sectionName)
      const jt  = getJobTitle(sec, r.jobTitle)

      // Head Count lands here regardless of vp ONLY in "now"/latest mode — see
      // HRPageReview.jsx's identical fix. r.isCountable reflects CURRENT status, not status
      // as of a selected HISTORICAL month, so once an explicit Month/Year is picked, vp
      // presence is the only signal for "did this person exist that month" and Head Count
      // stays gated on it (same as the cost/drilldown entry below always has been) —
      // otherwise someone hired this month would also show up in every earlier month.
      if (r.isCountable && (filterMonth === 'All' || vp !== 0)) { bu.activeEmpSet.add(r.employeeNo); sec.activeEmpSet.add(r.employeeNo); jt.activeEmpSet.add(r.employeeNo) }
      if (vp === 0) return

      bu.monthly += vp; sec.monthly += vp; jt.monthly += vp
      if (r.payrollSource === 'KIFIYA') { bu.kifiya += vp; sec.kifiya += vp; jt.kifiya += vp }
      else                              { bu.safee  += vp; sec.safee  += vp; jt.safee  += vp }
      bu.vcs.add(r.virtualCompany)

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
    // Skipped when Budget Source is filtered: the roster has no source field at all, so
    // someone with no payroll row can't be attributed to Corporate/Programme — including
    // them here would silently un-filter the headcount back to the company-wide total.
    // Also skipped whenever an explicit Month/Year is selected: the roster is who's active
    // RIGHT NOW, not who existed as of that historical month — without this, someone hired
    // this month would wrongly show up (by name, with Head Count) in every earlier month too.
    ;(filterSource === 'All' && filterMonth === 'All' ? filteredRoster : []).forEach(r => {
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
        })).sort(compareByTitleRank(jt => jt.jobTitle, (a, b) => b.monthly - a.monthly || a.jobTitle.localeCompare(b.jobTitle)))
        return {
          sectionCode: sec.sectionCode, sectionName: sec.sectionName, headcount: sec.activeEmpSet.size,
          monthly: Math.round(sec.monthly), kifiya: Math.round(sec.kifiya), safee: Math.round(sec.safee), jobTitles
        }
      }).sort((a, b) => b.monthly - a.monthly || a.sectionName.localeCompare(b.sectionName))

      // Bypassed when Budget Source is filtered too: monthEvo has no source dimension, so
      // byBU[...].count is always the unfiltered company-wide figure for that BU.
      const buMonthEvo = (filterType === 'All' && filterVC === 'All' && filterSource === 'All') ? monthEvo?.byBU?.[bu.buCode] : null
      const headcount = buMonthEvo ? buMonthEvo.count : bu.activeEmpSet.size

      return {
        buCode: bu.buCode, buName: bu.buName, headcount,
        monthly: Math.round(bu.monthly), kifiya: Math.round(bu.kifiya), safee: Math.round(bu.safee),
        vcLabel: [...bu.vcs].filter(v => v && v !== 'Unknown').sort().join(' + ') || '—',
        sections
      }
    }).sort((a, b) => b.monthly - a.monthly || a.buName.localeCompare(b.buName))

    return { tableRows: rows }
  }, [filteredPayAll, filteredRoster, effectiveMonth, deptDisplayNames, dimensionNames, monthEvo, filterType, filterVC, filterSource])

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

  // Full change history for one employee — every set/revert ever recorded, not just the
  // current override shown above. Fetched once per employee and cached, since the
  // department_override_audit table is append-only (never changes once loaded here).
  const toggleHistory = async (employeeNo) => {
    if (historyOpenNo === employeeNo) { setHistoryOpenNo(null); return }
    setHistoryOpenNo(employeeNo)
    if (historyByEmp[employeeNo]) return
    setLoadingHistory(true)
    try {
      const r = await departmentOverrides.history(employeeNo)
      const rows = r.ok ? await r.json() : []
      setHistoryByEmp(cur => ({ ...cur, [employeeNo]: rows }))
    } catch { setHistoryByEmp(cur => ({ ...cur, [employeeNo]: [] })) }
    finally { setLoadingHistory(false) }
  }

  // A row's current budget source reads "Both" when the employee has cost under both
  // books this period (dual-hatted) — there's no single current value to default a
  // "Change Budget Source" dropdown to in that case, so it starts blank instead.
  const currentBudgetSource = (emp) =>
    emp.kifiya > 0 && emp.safee > 0 ? 'Both' : emp.safee > 0 ? 'SAFEE' : 'KIFIYA'

  const startEditSource = (emp) => {
    const cur = currentBudgetSource(emp)
    setEditingSourceNo(emp.employeeNo); setTargetBudgetSource(cur === 'Both' ? '' : cur); setError('')
  }
  const cancelEditSource = () => { setEditingSourceNo(null); setTargetBudgetSource(''); setError('') }

  const applyChangeSource = async (emp) => {
    if (!targetBudgetSource) { cancelEditSource(); return }
    const from = currentBudgetSource(emp)
    if (targetBudgetSource === from) { cancelEditSource(); return }
    setBusy(true); setError('')
    try {
      const r = await bsOverrideApi.set(emp.employeeNo, emp.name, from, targetBudgetSource)
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Failed to save budget source override.') }
      cancelEditSource()
      loadBsOverrides()
      onDataRefresh?.()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const revertSource = async (employeeNo) => {
    setBusy(true); setError('')
    try {
      const r = await bsOverrideApi.remove(employeeNo)
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Failed to revert budget source override.') }
      loadBsOverrides()
      onDataRefresh?.()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const toggleBsHistory = async (employeeNo) => {
    if (bsHistoryOpenNo === employeeNo) { setBsHistoryOpenNo(null); return }
    setBsHistoryOpenNo(employeeNo)
    if (bsHistoryByEmp[employeeNo]) return
    setLoadingBsHistory(true)
    try {
      const r = await bsOverrideApi.history(employeeNo)
      const rows = r.ok ? await r.json() : []
      setBsHistoryByEmp(cur => ({ ...cur, [employeeNo]: rows }))
    } catch { setBsHistoryByEmp(cur => ({ ...cur, [employeeNo]: [] })) }
    finally { setLoadingBsHistory(false) }
  }

  const BUDGET_SOURCE_LABEL = { KIFIYA: 'Corporate', SAFEE: 'Programme', Both: 'Both' }

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
          Applying change and resyncing dashboard data — usually 10–20 seconds…
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
        <KpiBlock
          label="Active Overrides"
          value={(loadingOv || loadingBsOv) ? '—' : fmtN(overrides.length + bsOverrides.length)}
          sub={(loadingOv || loadingBsOv) ? 'Dashboard-only, not in BC' : `Dashboard-only, not in BC · click to view`}
          accent="#5B4B8A" small
          onClick={scrollToOverrides}
        />
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
                                  const isEditingSource = editingSourceNo === emp.employeeNo
                                  const hasOverride = !!overrideByNo[emp.employeeNo]
                                  const hasSourceOverride = !!bsOverrideByNo[emp.employeeNo]
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
                                        {hasSourceOverride && (
                                          <span className="ml-1.5 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full" style={{ background: `${ORANGE}33`, color: ORANGE }}>SOURCE OVERRIDDEN</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-1.5 text-[10px] text-muted">{vc}</td>
                                      <td className="px-4 py-1.5" />
                                      <td className="px-4 py-1.5 text-right tabular-nums text-muted text-[10px]">{fmtC(total || null)}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums text-[10px] text-muted">{fmtPct(pctEmp)}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums text-[10px]" style={{ color: TEAL }}>{emp.kifiya ? fmtC(emp.kifiya) : '—'}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums text-[10px]" style={{ color: ORANGE }}>{emp.safee ? fmtC(emp.safee) : '—'}</td>
                                      <td className="px-4 py-1.5">
                                        <div className="flex flex-col gap-1.5 items-start">
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
                                        {!isEditingSource ? (
                                          <button
                                            onClick={() => startEditSource(emp)}
                                            disabled={busy}
                                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-border text-navy hover:border-navy transition-colors disabled:opacity-40"
                                          >
                                            Change Budget Source
                                          </button>
                                        ) : (
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <select
                                              value={targetBudgetSource}
                                              onChange={e => setTargetBudgetSource(e.target.value)}
                                              className="text-[10px] rounded-lg px-2 py-1 bg-white text-navy border border-border"
                                              style={{ minWidth: 140 }}
                                            >
                                              <option value="" disabled>Choose…</option>
                                              <option value="KIFIYA">Corporate</option>
                                              <option value="SAFEE">Programme</option>
                                            </select>
                                            <button onClick={() => applyChangeSource(emp)} disabled={busy} className="text-[10px] font-bold px-2.5 py-1 rounded-lg text-white disabled:opacity-40" style={{ background: ORANGE }}>Confirm</button>
                                            <button onClick={cancelEditSource} disabled={busy} className="text-[10px] font-bold px-2 py-1 text-muted">Cancel</button>
                                          </div>
                                        )}
                                        </div>
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
      <div ref={overridesPanelRef} className="bg-white rounded-2xl border border-border shadow-card overflow-hidden scroll-mt-4">
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
            {overrides.map(o => {
              const isOpen = historyOpenNo === o.employee_no
              const history = historyByEmp[o.employee_no]
              return (
                <Fragment key={o.employee_no}>
                  <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate text-navy">{o.employee_name || o.employee_no}</p>
                      <p className="text-[10px] mt-0.5 text-muted">
                        {dimensionNames[o.from_section] || o.from_section || 'Unknown'} → <span style={{ color: TEAL, fontWeight: 700 }}>{dimensionNames[o.section_code] || o.section_code}</span>
                      </p>
                      <p className="text-[10px] mt-0.5 text-muted">by {o.updated_by || 'unknown'} · {new Date(o.updated_at + 'Z').toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => toggleHistory(o.employee_no)}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border text-muted hover:text-navy transition-colors"
                    >
                      {isOpen ? 'Hide history' : 'History'}
                    </button>
                    <button
                      onClick={() => revert(o.employee_no)}
                      disabled={busy}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border transition-colors disabled:opacity-40"
                      style={{ color: RED }}
                    >
                      Revert
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-5 pb-3 pt-1" style={{ background: '#F7FAFA' }}>
                      {loadingHistory && !history ? (
                        <p className="text-[11px] text-muted py-2">Loading history…</p>
                      ) : !history || history.length === 0 ? (
                        <p className="text-[11px] text-muted py-2">No change history recorded for this employee.</p>
                      ) : (
                        <ul className="space-y-1.5 py-2">
                          {history.map((h, i) => (
                            <li key={i} className="text-[11px] text-navy flex flex-wrap items-center gap-1">
                              <span className="font-bold" style={{ color: h.action === 'revert' ? RED : TEAL }}>
                                {h.action === 'revert' ? 'Reverted' : 'Set'}
                              </span>
                              <span className="text-muted">
                                {dimensionNames[h.from_section] || h.from_section || 'Unknown'} → {dimensionNames[h.to_section] || h.to_section}
                              </span>
                              <span className="text-muted">· by {h.actor || 'unknown'} · {new Date(h.created_at + 'Z').toLocaleString()}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Active budget source overrides — audit trail + revert ── */}
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h3 className="text-sm font-bold text-navy">Active Budget Source Overrides {bsOverrides.length > 0 && `(${bsOverrides.length})`}</h3>
          <p className="text-[10px] text-muted mt-0.5">
            Relabels which book (Corporate/KIFIYA or Programme/SAFEE) this employee's payroll and pension count under on the dashboard — doesn't change Business Central's own payroll records.
            Reverting removes the override — the employee goes back to whichever book BC's payroll rows actually belong to on the next sync.
          </p>
        </div>
        {loadingBsOv ? (
          <p className="text-xs px-5 py-4 text-muted">Loading…</p>
        ) : bsOverrides.length === 0 ? (
          <p className="text-xs px-5 py-4 text-muted">No budget source overrides set — every employee is showing whichever payroll book Business Central reports.</p>
        ) : (
          <div className="divide-y divide-border">
            {bsOverrides.map(o => {
              const isOpen = bsHistoryOpenNo === o.employee_no
              const history = bsHistoryByEmp[o.employee_no]
              return (
                <Fragment key={o.employee_no}>
                  <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate text-navy">{o.employee_name || o.employee_no}</p>
                      <p className="text-[10px] mt-0.5 text-muted">
                        {BUDGET_SOURCE_LABEL[o.from_source] || o.from_source || 'Unknown'} → <span style={{ color: ORANGE, fontWeight: 700 }}>{BUDGET_SOURCE_LABEL[o.budget_source] || o.budget_source}</span>
                      </p>
                      <p className="text-[10px] mt-0.5 text-muted">by {o.updated_by || 'unknown'} · {new Date(o.updated_at + 'Z').toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => toggleBsHistory(o.employee_no)}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border text-muted hover:text-navy transition-colors"
                    >
                      {isOpen ? 'Hide history' : 'History'}
                    </button>
                    <button
                      onClick={() => revertSource(o.employee_no)}
                      disabled={busy}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border transition-colors disabled:opacity-40"
                      style={{ color: RED }}
                    >
                      Revert
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-5 pb-3 pt-1" style={{ background: '#F7FAFA' }}>
                      {loadingBsHistory && !history ? (
                        <p className="text-[11px] text-muted py-2">Loading history…</p>
                      ) : !history || history.length === 0 ? (
                        <p className="text-[11px] text-muted py-2">No change history recorded for this employee.</p>
                      ) : (
                        <ul className="space-y-1.5 py-2">
                          {history.map((h, i) => (
                            <li key={i} className="text-[11px] text-navy flex flex-wrap items-center gap-1">
                              <span className="font-bold" style={{ color: h.action === 'revert' ? RED : ORANGE }}>
                                {h.action === 'revert' ? 'Reverted' : 'Set'}
                              </span>
                              <span className="text-muted">
                                {BUDGET_SOURCE_LABEL[h.from_source] || h.from_source || 'Unknown'} → {BUDGET_SOURCE_LABEL[h.to_source] || h.to_source}
                              </span>
                              <span className="text-muted">· by {h.actor || 'unknown'} · {new Date(h.created_at + 'Z').toLocaleString()}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Payroll Currency Corrections — fixes a specific voucher's wrong currency tag ──
           Gated behind canManageCurrency (see its definition above) — not part of the
           regular Department/Budget Source override set everyone on this page gets. */}
      {canManageCurrency && (
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h3 className="text-sm font-bold text-navy">Payroll Currency Corrections {ccCorrections.length > 0 && `(${ccCorrections.length})`}</h3>
          <p className="text-[10px] text-muted mt-0.5">
            For when Business Central posts a payroll voucher with the wrong currency tag (e.g. an ETB payment mistakenly marked USD) and the
            amount then gets multiplied by an exchange rate it shouldn't. Corrects how the dashboard reads that one voucher — doesn't change
            Business Central's own record. Removing a correction reverts to whatever currency BC's voucher shows on the next sync.
          </p>
        </div>

        {/* bg-bg, not a hardcoded light color — the labels below use text-muted, which
            .dark-app (index.css) flips to white; a flat light background wouldn't follow it
            there and they'd go near-invisible, same bug fixed on BusinessLinePL.jsx's Gross
            profit row. bg-bg is remapped to dark navy by .dark-app, so it darkens with it. */}
        <form onSubmit={submitCcCorrection} className="px-5 py-4 border-b border-border flex flex-wrap items-end gap-2.5 bg-bg">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase tracking-wide text-muted">Voucher No</label>
            <input value={ccForm.voucherNo} onChange={e => setCcForm(f => ({ ...f, voucherNo: e.target.value }))}
              placeholder="PPV03541" className="text-[11px] rounded-lg px-2.5 py-1.5 bg-white text-navy border border-border" style={{ width: 120 }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase tracking-wide text-muted">Employee No</label>
            <input value={ccForm.employeeNo} onChange={e => setCcForm(f => ({ ...f, employeeNo: e.target.value }))}
              placeholder="KFT1551" className="text-[11px] rounded-lg px-2.5 py-1.5 bg-white text-navy border border-border" style={{ width: 110 }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase tracking-wide text-muted">Employee Name</label>
            <input value={ccForm.employeeName} onChange={e => setCcForm(f => ({ ...f, employeeName: e.target.value }))}
              placeholder="Optional" className="text-[11px] rounded-lg px-2.5 py-1.5 bg-white text-navy border border-border" style={{ width: 160 }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase tracking-wide text-muted">Correct Currency</label>
            <select value={ccForm.correctCurrency} onChange={e => setCcForm(f => ({ ...f, correctCurrency: e.target.value }))}
              className="text-[11px] rounded-lg px-2.5 py-1.5 bg-white text-navy border border-border" style={{ width: 90 }}>
              <option value="ETB">ETB</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1" style={{ minWidth: 180 }}>
            <label className="text-[9px] font-bold uppercase tracking-wide text-muted">Note (optional)</label>
            <input value={ccForm.note} onChange={e => setCcForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Why this voucher's tag is wrong" className="text-[11px] rounded-lg px-2.5 py-1.5 bg-white text-navy border border-border w-full" />
          </div>
          <button type="submit" disabled={ccBusy} className="text-[11px] font-bold px-3.5 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: ORANGE }}>
            Add Correction
          </button>
          {ccError && <p className="text-[11px] font-bold w-full" style={{ color: RED }}>{ccError}</p>}
        </form>

        {loadingCc ? (
          <p className="text-xs px-5 py-4 text-muted">Loading…</p>
        ) : ccCorrections.length === 0 ? (
          <p className="text-xs px-5 py-4 text-muted">No currency corrections set — every voucher is showing whichever currency Business Central reports.</p>
        ) : (
          <div className="divide-y divide-border">
            {ccCorrections.map(c => (
              <div key={c.voucher_no} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-navy">
                    {c.voucher_no} <span className="font-normal text-muted">· {c.employee_name || c.employee_no} ({c.employee_no})</span>
                  </p>
                  <p className="text-[10px] mt-0.5 text-muted">
                    Forced to <span style={{ color: ORANGE, fontWeight: 700 }}>{c.correct_currency}</span>
                    {c.note && <> — {c.note}</>}
                  </p>
                  <p className="text-[10px] mt-0.5 text-muted">by {c.created_by || 'unknown'} · {new Date(c.created_at + 'Z').toLocaleString()}</p>
                </div>
                <button
                  onClick={() => removeCcCorrection(c.voucher_no)}
                  disabled={ccBusy}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border transition-colors disabled:opacity-40"
                  style={{ color: RED }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  )
}
