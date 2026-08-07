import { useState, Fragment } from 'react'
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  AreaChart, Area, LineChart, Line, ComposedChart, Legend
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtNum, fmtPct } from '../lib/fmt.js'
import PeopleOpsFilterBar from '../components/PeopleOpsFilterBar.jsx'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'

const PIE_COLORS   = ['#02404F', '#1FB6A6', '#EB7D23', '#2EBD85', '#3A4656', '#E5544B']
const MALE_COLOR   = '#02404F'
const FEMALE_COLOR = '#1FB6A6'

const fmtM = (n) => {
  if (n == null || isNaN(n)) return '—'
  const v = Math.abs(Number(n))
  if (v >= 1_000_000) return (Number(n) / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return (Number(n) / 1_000).toFixed(1) + 'K'
  return Number(n).toLocaleString()
}

function GenderTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const male   = payload.find(p => p.dataKey === 'male')?.value   || 0
  const female = payload.find(p => p.dataKey === 'female')?.value || 0
  return (
    <div style={{ background: '#fff', border: '1px solid #E3E9F2', borderRadius: 8, padding: '8px 12px', fontSize: 11, minWidth: 140 }}>
      <p style={{ fontWeight: 700, color: '#02404F', marginBottom: 6 }}>{label}</p>
      <p style={{ color: MALE_COLOR,   marginBottom: 2 }}>Male: <strong>{male}</strong></p>
      <p style={{ color: FEMALE_COLOR, marginBottom: 2 }}>Female: <strong>{female}</strong></p>
      <p style={{ color: '#6B7C93', borderTop: '1px solid #E3E9F2', marginTop: 6, paddingTop: 6 }}>
        Total: <strong>{male + female}</strong>
      </p>
    </div>
  )
}

function GenderLegend() {
  return (
    <div className="flex gap-4 mb-3">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted">
        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: MALE_COLOR }} /> Male
      </span>
      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted">
        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: FEMALE_COLOR }} /> Female
      </span>
    </div>
  )
}

function GenderBadge({ male, female }) {
  return (
    <span className="flex gap-1.5 text-[9px] font-bold">
      <span className="px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(2,64,79,.1)', color: MALE_COLOR }}>♂ {male}</span>
      <span className="px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(31,182,166,.12)', color: '#0e8a7e' }}>♀ {female}</span>
    </span>
  )
}

function MiniDonut({ data, size = 140 }) {
  return (
    <div className="flex items-center gap-4">
      <PieChart width={size} height={size}>
        <Pie data={data} cx="50%" cy="50%" innerRadius={size * 0.3} outerRadius={size * 0.46}
             dataKey="value" paddingAngle={3}>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
      </PieChart>
      <div className="space-y-2 min-w-0">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="text-[10px] font-semibold text-navy truncate">{d.name}</span>
            <span className="text-[10px] text-muted font-medium ml-auto pl-2">{fmtNum(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function yearsOfService(hired) {
  if (!hired) return '—'
  const ms = Date.now() - new Date(hired).getTime()
  const yrs = ms / (1000 * 60 * 60 * 24 * 365.25)
  if (yrs < 1) return `${Math.floor(yrs * 12)}m`
  return `${yrs.toFixed(1)}y`
}

export default function HR({ data }) {
  const hr  = data.hr || {}
  const ec  = data.employeeCost || {}
  const dims = data.dimensionNames || {}
  const empNoToType    = hr.empNoToType    || {}
  const empNoToJobTitle = hr.empNoToJobTitle || {}

  const { filterBU, filterType, filterVC, filterSource, filterMonth } = usePeopleOpsFilters()

  const [activeDept,        setActiveDept]       = useState(null)
  const [activeSection,     setActiveSection]    = useState(null)
  const [expandedJobs,      setExpandedJobs]     = useState({})
  const [expandedStatusBU,  setExpandedStatusBU] = useState({})
  const [expandedGenderJob, setExpandedGenderJob] = useState({})

  const genderData          = hr.byGender          || []
  const typeData            = (hr.byType           || []).map(d => ({ ...d, male: d.male || 0, female: d.female || 0 }))
  const jobTitleData        = (hr.byJobTitle       || []).map(d => ({ ...d, male: d.male || 0, female: d.female || 0 }))

  // Build name → employeeNo lookup: payroll drilldown first, then HR hierarchy as fallback
  const nameToEmpNo = {}
  ;(ec.buDrillDown || []).forEach(bu => {
    ;(bu.sections || []).forEach(sec => {
      ;(sec.employees || []).forEach(emp => {
        if (emp.name && emp.employeeNo) nameToEmpNo[emp.name] = emp.employeeNo
      })
    })
  })
  ;(hr.byDeptHierarchy || []).forEach(d => {
    ;(d.sections || []).forEach(sec => {
      ;(sec.employees || []).forEach(emp => {
        if (emp.name && emp.employeeNo && !nameToEmpNo[emp.name])
          nameToEmpNo[emp.name] = emp.employeeNo
      })
    })
  })

  // name → { vc, employeeType, hired } — enriches byDeptHierarchy employees with attributes for filtering
  // Store null (not 'Unknown') so the fallback chain in filteredHCEmployees can kick in
  const nameInfo = {}
  ;(hr.seniorityList || []).forEach(s => {
    if (s.name) nameInfo[s.name] = { vc: s.vc || 'Unknown', employeeType: s.type || null, hired: s.hired }
  })

  // employeeNo → employeeType enrichment (headcount fallback, already computed by backend)
  const empNoToTypeMap = hr.empNoToType || {}

  // name → employeeType from payroll drilldown — more reliable than seniorityList.type
  const nameToEmployeeType = {}
  ;(ec.buDrillDown || []).forEach(bu => {
    ;(bu.sections || []).forEach(sec => {
      ;(sec.employees || []).forEach(emp => {
        if (emp.name && emp.employeeType && emp.employeeType !== 'Unknown' && !nameToEmployeeType[emp.name])
          nameToEmployeeType[emp.name] = emp.employeeType
      })
    })
  })

  const vcData              = (hr.byVirtualCompany || []).filter(d => d.virtualCompany && d.virtualCompany !== 'Unknown').map(d => ({ name: d.virtualCompany, value: d.count }))
  const seniorityList       = hr.seniorityList     || []
  const deptHierarchy       = hr.byDeptHierarchy   || []

  // Use backend's full sectionToDept map (covers payroll-only & Inactive employee sections)
  const sectionToDept    = hr.sectionToDept    || {}
  const deptDisplayNames = hr.deptDisplayNames || {}
  const parentBUNames    = { ...deptDisplayNames }
  ;(hr.byDeptHierarchy || []).forEach(d => { parentBUNames[d.deptCode] = d.deptName })
  const parentBUCodes = new Set(Object.keys(parentBUNames))

  // empInfoMap: employeeNo → { buName, vc, gender, type } — used to enrich job-cost employee rows
  const empInfoMap = {}
  ;(ec.buDrillDown || []).forEach(bu => {
    const parentCode = sectionToDept[bu.buCode] || bu.buCode
    const buName = deptDisplayNames[parentCode] || dims[parentCode] || bu.buCode
    ;(bu.sections || []).forEach(sec => {
      ;(sec.employees || []).forEach(emp => {
        if (emp.employeeNo && !empInfoMap[emp.employeeNo])
          empInfoMap[emp.employeeNo] = { buName }
      })
    })
  })
  ;(hr.seniorityList || []).forEach(s => {
    const empNo = nameToEmpNo[s.name]
    if (empNo) {
      if (!empInfoMap[empNo]) empInfoMap[empNo] = {}
      Object.assign(empInfoMap[empNo], { vc: s.vc, gender: s.gender, type: s.type })
    }
  })
  // nameToJobTitle: fullName → BC "Job Description" (seniorityList.title = r.jobTitle from headcount)
  const nameToJobTitle = {}
  ;(hr.seniorityList || []).forEach(s => {
    if (s.name && s.title && s.title !== 'Unknown') nameToJobTitle[s.name] = s.title
  })
  // Populate empInfoMap.title via name bridge: payroll emp.name ↔ headcount fullName
  ;(ec.buDrillDown || []).forEach(bu => {
    ;(bu.sections || []).forEach(sec => {
      ;(sec.employees || []).forEach(emp => {
        if (emp.employeeNo && emp.name && !empInfoMap[emp.employeeNo]?.title) {
          const t = nameToJobTitle[emp.name]
          if (t) {
            if (!empInfoMap[emp.employeeNo]) empInfoMap[emp.employeeNo] = {}
            empInfoMap[emp.employeeNo].title = t
          }
        }
      })
    })
  })

  // Resolve a headcount fullName (possibly 3-part) to a payroll employeeNo
  const resolveEmpNo = (name) => {
    if (!name) return undefined
    let no = nameToEmpNo[name]
    if (no) return no
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 3) no = nameToEmpNo[`${parts[0]} ${parts[parts.length - 1]}`]
    return no || undefined
  }

  // jobEmpMap: jobTitle → [{ employeeNo, name, gender }]  sorted by employeeNo ascending
  // Source: hr.byDeptHierarchy (emp.jobTitle = BC "Job Description" field)
  // NOTE: KFT_Employee_Headcount query has NO employeeNo column — dedup must use emp.name
  const jobEmpMap = {}
  const _jobEmpSeen = {}
  ;(hr.byDeptHierarchy || []).forEach(d => {
    ;(d.sections || []).forEach(sec => {
      ;(sec.employees || []).forEach(emp => {
        const title = emp.jobTitle
        if (!title || title === 'Unknown') return
        if (!jobEmpMap[title]) { jobEmpMap[title] = []; _jobEmpSeen[title] = new Set() }
        if (!_jobEmpSeen[title].has(emp.name)) {
          _jobEmpSeen[title].add(emp.name)
          jobEmpMap[title].push({ employeeNo: resolveEmpNo(emp.name), name: emp.name, gender: emp.gender })
        }
      })
    })
  })
  Object.values(jobEmpMap).forEach(list =>
    list.sort((a, b) => (a.employeeNo || '').localeCompare(b.employeeNo || ''))
  )

  // empPayrollMap: employeeNo → { monthly, total } — merged across all BUs from payroll drilldown
  // Pension (emp.pension / emp.pensionMonthly) is folded into the totals here so the
  // Employee Cost by Job Type table reflects the true employer cost.
  const empPayrollMap = {}
  ;(ec.buDrillDown || []).forEach(bu => {
    const parentBU = sectionToDept[bu.buCode] || bu.buCode
    if (filterBU !== 'All' && parentBU !== filterBU) return
    ;(bu.sections || []).forEach(sec => {
      ;(sec.employees || []).forEach(emp => {
        if (!emp.employeeNo) return
        const payEmpType = emp.employeeType || empNoToTypeMap[emp.employeeNo] || ''
        if (filterType   !== 'All' && payEmpType !== filterType)       return
        if (filterVC     !== 'All' && emp.vc     !== filterVC)         return
        if (filterSource === 'KIFIYA' && !(emp.kifiya  > 0))           return
        if (filterSource === 'SAFEE'  && !(emp.safee   > 0))           return
        if (!empPayrollMap[emp.employeeNo]) empPayrollMap[emp.employeeNo] = { monthly: {}, total: 0 }
        Object.entries(emp.monthly || {}).forEach(([m, v]) => {
          empPayrollMap[emp.employeeNo].monthly[m] = (empPayrollMap[emp.employeeNo].monthly[m] || 0) + v
        })
        Object.entries(emp.pensionMonthly || {}).forEach(([m, v]) => {
          empPayrollMap[emp.employeeNo].monthly[m] = (empPayrollMap[emp.employeeNo].monthly[m] || 0) + v
        })
        const empTotal = filterMonth === 'All'
          ? (emp.total || 0) + (emp.pension || 0)
          : (emp.monthly?.[filterMonth] || 0) + (emp.pensionMonthly?.[filterMonth] || 0)
        empPayrollMap[emp.employeeNo].total += empTotal
      })
    })
  })

  // ── Per-employee headcount list filtered by all shared context filters ──────
  // Combines byDeptHierarchy (gender/jobTitle) with nameInfo (vc/type).
  // All headcount charts and KPIs are recomputed from this instead of snapshot aggregates.
  const filteredHCEmployees = (() => {
    const seen = new Set()
    const result = []
    ;(hr.byDeptHierarchy || []).forEach(dept => {
      const parentBU = sectionToDept[dept.deptCode] || dept.deptCode
      if (filterBU !== 'All' && parentBU !== filterBU) return
      ;(dept.sections || []).forEach(sec => {
        ;(sec.employees || []).forEach(emp => {
          const key = emp.employeeNo || emp.name
          if (!key || seen.has(key)) return
          seen.add(key)
          const info = nameInfo[emp.name] || {}
          const vc = info.vc || 'Unknown'
          const employeeType = info.employeeType || nameToEmployeeType[emp.name] || emp.employeeType || 'Unknown'
          if (filterType !== 'All' && employeeType !== filterType) return
          if (filterVC   !== 'All' && vc           !== filterVC)   return
          if (filterSource !== 'All') {
            const empNo = emp.employeeNo || resolveEmpNo(emp.name)
            if (!empNo || !empPayrollMap[empNo]) return
          }
          result.push({
            name: emp.name,
            employeeNo: emp.employeeNo || resolveEmpNo(emp.name),
            gender: emp.gender || 'Unknown',
            jobTitle: emp.jobTitle || 'Unknown',
            buCode: parentBU,
            buName: dept.deptName,
            vc, employeeType,
            hired: info.hired,
          })
        })
      })
    })
    return result
  })()

  // Headcount is a point-in-time figure — hr.byDeptHierarchy only reflects "now", so
  // BU/type/VC/source filters can narrow it directly, but a month selection needs the
  // separate month-by-month reconstruction in hr.headcountEvolution instead (which also
  // carries its own male/female/eth/hub breakdown for that same point in time).
  const monthEvo = filterMonth !== 'All'
    ? (hr.headcountEvolution || []).find(m => m.label === filterMonth)
    : null
  const monthHeadcount = monthEvo?.count ?? null
  const filteredTotal = monthHeadcount != null ? monthHeadcount : filteredHCEmployees.length

  // Strict Male/Female match only — a stray whitespace-only or otherwise malformed
  // gender value should never create its own phantom bucket.
  const _gC = {}
  filteredHCEmployees.forEach(e => {
    if (e.gender === 'Male' || e.gender === 'Female') _gC[e.gender] = (_gC[e.gender] || 0) + 1
  })
  const filteredGenderData = monthEvo
    ? [{ gender: 'Male', count: monthEvo.male }, { gender: 'Female', count: monthEvo.female }].filter(g => g.count > 0)
    : Object.entries(_gC).map(([gender, count]) => ({ gender, count }))
  const filteredMale   = _gC['Male']   || 0
  const filteredFemale = _gC['Female'] || 0
  const filteredGenderTotal = filteredMale + filteredFemale

  const _vcC = {}
  filteredHCEmployees.forEach(e => { if (e.vc === 'ETH' || e.vc === 'HUB') _vcC[e.vc] = (_vcC[e.vc] || 0) + 1 })
  const filteredVCData = monthEvo
    ? [{ name: 'ETH', value: monthEvo.eth }, { name: 'HUB', value: monthEvo.hub }].filter(v => v.value > 0)
    : Object.entries(_vcC).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const filteredETH = _vcC['ETH'] || 0
  const filteredHUB = _vcC['HUB'] || 0

  const _tC = {}
  filteredHCEmployees.forEach(e => {
    const t = e.employeeType === 'Unknown' ? null : e.employeeType; if (!t) return
    if (!_tC[t]) _tC[t] = { type: t, male: 0, female: 0 }
    if (e.gender === 'Male') _tC[t].male++; else if (e.gender === 'Female') _tC[t].female++
  })
  const filteredTypeData = Object.values(_tC).filter(t => t.male + t.female > 0).sort((a, b) => (b.male + b.female) - (a.male + a.female))

  const _jtC = {}
  filteredHCEmployees.forEach(e => {
    const t = e.jobTitle === 'Unknown' ? null : e.jobTitle; if (!t) return
    if (!_jtC[t]) _jtC[t] = { jobTitle: t, male: 0, female: 0 }
    if (e.gender === 'Male') _jtC[t].male++; else if (e.gender === 'Female') _jtC[t].female++
  })
  const filteredJobTitleData = Object.values(_jtC).sort((a, b) => (b.male + b.female) - (a.male + a.female))

  const _dC = {}
  filteredHCEmployees.forEach(e => {
    if (!e.buCode || e.buCode === 'Unknown') return
    if (!_dC[e.buCode]) _dC[e.buCode] = { dept: e.buCode, name: e.buName, male: 0, female: 0 }
    if (e.gender === 'Male') _dC[e.buCode].male++; else if (e.gender === 'Female') _dC[e.buCode].female++
  })
  const filteredDeptChartData = Object.values(_dC).sort((a, b) => (b.male + b.female) - (a.male + a.female))

  const filteredJobEmpMap = {}
  filteredHCEmployees.forEach(emp => {
    const title = emp.jobTitle === 'Unknown' ? null : emp.jobTitle; if (!title) return
    if (!filteredJobEmpMap[title]) filteredJobEmpMap[title] = []
    filteredJobEmpMap[title].push({ employeeNo: emp.employeeNo || resolveEmpNo(emp.name), name: emp.name, gender: emp.gender })
  })
  Object.values(filteredJobEmpMap).forEach(list =>
    list.sort((a, b) => (a.employeeNo || '').localeCompare(b.employeeNo || ''))
  )

  const _dtM = {}
  filteredHCEmployees.forEach(emp => {
    if (!emp.buCode || emp.buCode === 'Unknown') return
    if (!_dtM[emp.buCode]) _dtM[emp.buCode] = { deptCode: emp.buCode, deptName: emp.buName, types: {} }
    const t = emp.employeeType === 'Unknown' ? 'Unknown' : emp.employeeType
    _dtM[emp.buCode].types[t] = (_dtM[emp.buCode].types[t] || 0) + 1
  })
  const filteredByDeptByType = Object.values(_dtM).sort((a, b) =>
    Object.values(b.types).reduce((s, v) => s + v, 0) - Object.values(a.types).reduce((s, v) => s + v, 0)
  )
  const filteredAllContractTypes = [...new Set(
    filteredHCEmployees.map(e => e.employeeType).filter(t => t && t !== 'Unknown')
  )].sort()

  const filteredBuEmpList = {}
  filteredHCEmployees.forEach(emp => {
    if (!filteredBuEmpList[emp.buCode]) filteredBuEmpList[emp.buCode] = []
    filteredBuEmpList[emp.buCode].push({ employeeNo: emp.employeeNo, name: emp.name, employeeType: emp.employeeType })
  })
  Object.values(filteredBuEmpList).forEach(list =>
    list.sort((a, b) => (a.employeeNo || '').localeCompare(b.employeeNo || ''))
  )

  const filteredSeniorityList = (hr.seniorityList || []).filter(s => {
    if (!s.name) return false
    const info = nameInfo[s.name] || {}
    const effectiveType = info.employeeType || nameToEmployeeType[s.name] || 'Unknown'
    if (filterType   !== 'All' && effectiveType             !== filterType)  return false
    if (filterVC     !== 'All' && (info.vc || 'Unknown')    !== filterVC)    return false
    if (filterSource !== 'All') {
      const empNo = nameToEmpNo[s.name] || resolveEmpNo(s.name)
      if (!empNo || !empPayrollMap[empNo]) return false
    }
    return true
  })

  // parent BU → unique employees from payroll drilldown (guaranteed employeeNo, unlike headcount path)
  const buEmpList = (() => {
    const byBU = {}
    ;(ec.buDrillDown || []).forEach(bu => {
      const parentCode = sectionToDept[bu.buCode] || bu.buCode
      if (!byBU[parentCode]) byBU[parentCode] = {}
      ;(bu.sections || []).forEach(sec => {
        ;(sec.employees || []).forEach(emp => {
          if (emp.employeeNo && !byBU[parentCode][emp.employeeNo])
            byBU[parentCode][emp.employeeNo] = { name: emp.name, employeeType: emp.employeeType || '' }
        })
      })
    })
    const result = {}
    Object.entries(byBU).forEach(([code, map]) => {
      result[code] = Object.entries(map)
        .map(([employeeNo, d]) => ({ employeeNo, name: d.name, employeeType: d.employeeType }))
        .sort((a, b) => a.name.localeCompare(b.name))
    })
    return result
  })()

  const resolveParent = (code) => {
    const buCode = sectionToDept[code] || (parentBUCodes.has(code) ? code : code)
    const buName = parentBUNames[buCode] || dims[buCode] || dims[code] || buCode
    return { buCode, buName }
  }

  // Re-group byDeptByType by parent BU
  const rawByDeptByType = hr.byDeptByType || []
  const allContractTypes = hr.allContractTypes || []
  const byDeptByType = (() => {
    if (rawByDeptByType.length === 0 || parentBUCodes.size === 0) return rawByDeptByType
    const grouped = {}
    rawByDeptByType.forEach(row => {
      const { buCode, buName } = resolveParent(row.deptCode)
      if (!buCode || buCode === 'Unknown') return
      if (!grouped[buCode]) grouped[buCode] = { deptCode: buCode, deptName: buName, types: {} }
      Object.entries(row.types || {}).forEach(([t, v]) => {
        grouped[buCode].types[t] = (grouped[buCode].types[t] || 0) + v
      })
    })
    return Object.values(grouped).sort((a, b) =>
      Object.values(b.types).reduce((s, v) => s + v, 0) - Object.values(a.types).reduce((s, v) => s + v, 0)
    )
  })()

  // Re-group byDeptByStatus by parent BU
  const rawByDeptByStatus = hr.byDeptByStatus || []
  const byDeptByStatus = (() => {
    if (rawByDeptByStatus.length === 0 || parentBUCodes.size === 0) return rawByDeptByStatus
    const grouped = {}
    rawByDeptByStatus.forEach(row => {
      const { buCode, buName } = resolveParent(row.deptCode)
      if (!buCode || buCode === 'Unknown') return
      if (!grouped[buCode]) grouped[buCode] = { deptCode: buCode, deptName: buName, Active: 0, Inactive: 0 }
      grouped[buCode].Active   += row.Active   || 0
      grouped[buCode].Inactive += row.Inactive || 0
    })
    return Object.values(grouped).sort((a, b) => (b.Active + b.Inactive) - (a.Active + a.Inactive))
  })()
  const headcountEvolution  = hr.headcountEvolution || []
  const turnoverData        = hr.turnover           || []
  const deptChartData = filteredDeptChartData

  // Cost allocation (Kifiya vs Safee) — fully filter-aware, built from buDrillDown
  const pensionBySrc = { KIFIYA: 0, SAFEE: 0 }
  const grossBySrc   = { KIFIYA: 0, SAFEE: 0 }
  ;(ec.buDrillDown || []).forEach(bu => {
    const parentBU = sectionToDept[bu.buCode] || bu.buCode
    if (filterBU !== 'All' && parentBU !== filterBU) return
    ;(bu.sections || []).forEach(sec => {
      ;(sec.employees || []).forEach(emp => {
        const payEmpType = emp.employeeType || empNoToTypeMap[emp.employeeNo] || ''
        if (filterType   !== 'All' && payEmpType !== filterType)       return
        if (filterVC     !== 'All' && emp.vc     !== filterVC)         return
        if (filterSource === 'KIFIYA' && !(emp.kifiya  > 0))           return
        if (filterSource === 'SAFEE'  && !(emp.safee   > 0))           return
        const pension = emp.pension || 0
        const gross   = (emp.kifiya || 0) + (emp.safee || 0)
        const grossK  = filterMonth === 'All'
          ? (emp.kifiya || 0)
          : (emp.monthly?.[filterMonth] || 0) * ((emp.kifiya || 0) / Math.max(gross, 1))
        const grossS  = filterMonth === 'All'
          ? (emp.safee  || 0)
          : (emp.monthly?.[filterMonth] || 0) * ((emp.safee  || 0) / Math.max(gross, 1))
        grossBySrc['KIFIYA'] += grossK
        grossBySrc['SAFEE']  += grossS
        if (pension) {
          if (gross > 0) {
            pensionBySrc['KIFIYA'] += pension * (emp.kifiya || 0) / gross
            pensionBySrc['SAFEE']  += pension * (emp.safee  || 0) / gross
          } else {
            pensionBySrc['KIFIYA'] += pension
          }
        }
      })
    })
  })
  const costSourceData = [
    { name: 'KIFIYA',           value: Math.round((grossBySrc['KIFIYA'] || 0) + (pensionBySrc['KIFIYA'] || 0)) },
    { name: 'MSP / Programme',  value: Math.round((grossBySrc['SAFEE']  || 0) + (pensionBySrc['SAFEE']  || 0)) },
  ].filter(d => d.value > 0)
  const totalCost  = costSourceData.reduce((s, d) => s + d.value, 0)
  const costPerEmp = filteredTotal > 0 ? Math.round(totalCost / filteredTotal) : 0

  const male   = monthEvo ? monthEvo.male   : filteredMale
  const female = monthEvo ? monthEvo.female : filteredFemale
  const eth    = monthEvo ? monthEvo.eth    : filteredETH
  const hub    = monthEvo ? monthEvo.hub    : filteredHUB

  const handleDeptBarClick = (entry) => {
    if (!entry) return
    const code = entry.dept || entry.activePayload?.[0]?.payload?.dept
    const found = deptHierarchy.find(d => d.deptCode === code)
    if (!found) return
    setActiveDept(prev => prev?.deptCode === found.deptCode ? null : found)
    setActiveSection(null)
  }

  const selectedDeptObj = activeDept
    ? deptHierarchy.find(d => d.deptCode === activeDept.deptCode) || null
    : null

  // Filter the drilldown sections/employees to match active context filters
  const filteredDeptObj = selectedDeptObj ? (() => {
    const anyHCFilter = filterType !== 'All' || filterVC !== 'All' || filterSource !== 'All'
    if (!anyHCFilter) return selectedDeptObj
    const filteredSections = selectedDeptObj.sections.map(sec => {
      const filteredEmps = sec.employees.filter(emp => {
        const info = nameInfo[emp.name] || {}
        const vc   = info.vc || 'Unknown'
        const type = info.employeeType || nameToEmployeeType[emp.name] || emp.employeeType || 'Unknown'
        if (filterType !== 'All' && type !== filterType) return false
        if (filterVC   !== 'All' && vc   !== filterVC)   return false
        if (filterSource !== 'All') {
          const empNo = emp.employeeNo || resolveEmpNo(emp.name)
          if (!empNo || !empPayrollMap[empNo]) return false
        }
        return true
      })
      const male   = filteredEmps.filter(e => e.gender === 'Male').length
      const female = filteredEmps.filter(e => e.gender === 'Female').length
      return { ...sec, employees: filteredEmps, count: filteredEmps.length, male, female }
    }).filter(sec => sec.count > 0)
    const male   = filteredSections.reduce((s, sec) => s + sec.male, 0)
    const female = filteredSections.reduce((s, sec) => s + sec.female, 0)
    return { ...selectedDeptObj, sections: filteredSections, count: male + female, male, female }
  })() : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">People & HR</h2>
        <p className="text-xs text-muted font-medium">Workforce composition, diversity, and payroll analytics</p>
      </div>

      <PeopleOpsFilterBar data={data} />

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Active"      value={fmtNum(filteredTotal)} sub="Active workforce" />
        <KpiCard label="Male"     value={fmtNum(male)}   sub={filteredTotal ? fmtPct((male   / filteredTotal) * 100) + ' of workforce' : ''} />
        <KpiCard label="Female"   value={fmtNum(female)} sub={filteredTotal ? fmtPct((female / filteredTotal) * 100) + ' of workforce' : ''} />
        <KpiCard label="ETH"      value={fmtNum(eth)}    sub="Ethiopia entity" />
        <KpiCard label="HUB"      value={fmtNum(hub)}    sub="Hub entity" />
        <KpiCard label="Cost / Employee" value={fmtM(costPerEmp)} sub="Avg monthly payroll ETB" />
      </div>

      {/* ── Workforce Composition + Contract Status ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">No Employees per Entity</h3>
          {filteredVCData.length > 0
            ? <MiniDonut data={filteredVCData} size={140} />
            : <div className="h-36 flex items-center justify-center text-muted text-sm">No data</div>}
        </div>

        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">HR Cost Allocation</h3>
          <p className="text-[10px] text-muted mb-3">Kifiya vs MSP / Programme</p>
          {costSourceData.length > 0 ? (
            <>
              <MiniDonut data={costSourceData} size={120} />
              <p className="text-[10px] text-muted mt-3 border-t border-border pt-2">
                Total: <strong className="text-navy">{fmtM(totalCost)} ETB</strong>
              </p>
            </>
          ) : (
            <div className="h-36 flex items-center justify-center text-muted text-sm">No payroll data</div>
          )}
        </div>
      </div>

      {/* ── Workforce Diversity ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-2">Employee per Gender Type</h3>
          {filteredGenderData.length > 0 ? (
            <div className="flex items-center justify-center gap-6">
              <PieChart width={160} height={160}>
                <Pie data={filteredGenderData.map(g => ({ name: g.gender, value: g.count }))}
                     cx="50%" cy="50%" innerRadius={44} outerRadius={72}
                     dataKey="value" nameKey="name" paddingAngle={3}>
                  {filteredGenderData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              </PieChart>
              <div className="space-y-2.5">
                {filteredGenderData.map((g, i) => (
                  <div key={g.gender} className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs font-bold text-navy">{g.gender}</span>
                    <span className="text-xs text-muted font-medium">
                      {fmtNum(g.count)} ({filteredGenderTotal ? fmtPct((g.count / filteredGenderTotal) * 100) : '—'})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-muted text-sm">No data</div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-2">Gender per Contract Type</h3>
          <GenderLegend />
          {filteredTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, filteredTypeData.length * 38)}>
              <BarChart data={filteredTypeData} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<GenderTooltip />} cursor={{ fill: 'rgba(2,64,79,0.04)' }} />
                <Bar dataKey="male"   name="Male"   stackId="g" fill={MALE_COLOR}   maxBarSize={18} />
                <Bar dataKey="female" name="Female" stackId="g" fill={FEMALE_COLOR} maxBarSize={18} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-muted text-sm">No data</div>
          )}
        </div>
      </div>

      {/* ── Gender per Role / Job Title ── */}
      {filteredJobTitleData.length > 0 && (() => {
        const genderTotal = filteredJobTitleData.reduce((s, d) => ({ male: s.male + d.male, female: s.female + d.female }), { male: 0, female: 0 })
        return (
          <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-navy">Gender per Role / Job Title</h3>
                <p className="text-[10px] text-muted mt-0.5">Click a row to expand employees · {filteredJobTitleData.length} roles</p>
              </div>
              <div className="flex gap-4 text-[10px] font-semibold text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: MALE_COLOR }} /> Male
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: FEMALE_COLOR }} /> Female
                </span>
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
              <table className="text-[11px] border-collapse w-full">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: '#02404F' }}>
                    <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20" style={{ background: '#02404F', minWidth: 220 }}>
                      Job Description
                    </th>
                    <th className="px-4 py-3 font-bold text-right whitespace-nowrap min-w-[70px]" style={{ color: FEMALE_COLOR }}>Female</th>
                    <th className="px-4 py-3 font-bold text-right whitespace-nowrap min-w-[70px]" style={{ color: '#90D4CE' }}>Male</th>
                    <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[70px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobTitleData.map((row, ri) => {
                    const isOpen  = !!expandedGenderJob[row.jobTitle]
                    const empList = filteredJobEmpMap[row.jobTitle] || []
                    const rowBg   = ri % 2 === 0 ? '#fff' : '#F9FBFD'
                    return (
                      <Fragment key={row.jobTitle}>
                        <tr
                          className="border-t border-border cursor-pointer hover:bg-[#F0F7F6] transition-colors"
                          style={{ background: rowBg }}
                          onClick={() => setExpandedGenderJob(prev => ({ ...prev, [row.jobTitle]: !prev[row.jobTitle] }))}
                        >
                          <td className="px-4 py-2.5 font-semibold text-navy sticky left-0 z-10" style={{ background: rowBg }}>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-[10px] text-muted w-3">{isOpen ? '▾' : '▸'}</span>
                              {row.jobTitle}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: FEMALE_COLOR }}>{row.female || 0}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: MALE_COLOR }}>{row.male || 0}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-bold text-navy">{(row.male || 0) + (row.female || 0)}</td>
                        </tr>
                        {isOpen && empList.length > 0 && empList.map(emp => (
                          <tr key={emp.employeeNo || emp.name} className="border-t border-border/30" style={{ background: '#F0FAF9' }}>
                            <td className="pl-10 pr-4 py-1.5 sticky left-0 z-10" style={{ background: '#F0FAF9' }}>
                              <span className="inline-flex items-center gap-1.5">
                                {emp.employeeNo && (
                                  <span className="font-mono text-[10px] text-muted">{emp.employeeNo}</span>
                                )}
                                <span className="text-[11px] font-medium text-navy">{emp.name}</span>
                              </span>
                            </td>
                            <td className="px-4 py-1.5 text-right tabular-nums font-semibold" style={{ color: FEMALE_COLOR }}>
                              {emp.gender === 'Female' ? 1 : <span className="text-muted opacity-40">—</span>}
                            </td>
                            <td className="px-4 py-1.5 text-right tabular-nums font-semibold" style={{ color: MALE_COLOR }}>
                              {emp.gender === 'Male' ? 1 : <span className="text-muted opacity-40">—</span>}
                            </td>
                            <td className="px-4 py-1.5 text-right tabular-nums font-bold text-navy">1</td>
                          </tr>
                        ))}
                        {isOpen && empList.length === 0 && (
                          <tr className="border-t border-border/30" style={{ background: '#F0FAF9' }}>
                            <td className="pl-10 pr-4 py-1.5 text-muted italic" colSpan={4}>No payroll records for this role</td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 z-10">
                  <tr style={{ background: '#02404F' }}>
                    <td className="px-4 py-3 font-extrabold text-white sticky left-0 z-20" style={{ background: '#02404F' }}>Total</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: FEMALE_COLOR }}>{genderTotal.female}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: '#90D4CE' }}>{genderTotal.male}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-white">{genderTotal.male + genderTotal.female}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── Employee Cost by Job Type ── */}
      {filteredJobTitleData.length > 0 && (ec.payrollMonths || []).length > 0 && (() => {
        const months = ec.payrollMonths || []

        // Build job rows from filteredHCEmployees (already deduplicated and filter-aware)
        // joined to empPayrollMap for costs.
        const jobRows = (() => {
          const byTitle = {}
          filteredHCEmployees.forEach(emp => {
            const title = emp.jobTitle
            if (!title || title === 'Unknown') return
            const empNo = emp.employeeNo || resolveEmpNo(emp.name)
            const costs = empNo ? empPayrollMap[empNo] : null
            if (!byTitle[title]) byTitle[title] = { jobTitle: title, employees: [], monthTotals: {}, total: 0 }
            const g = byTitle[title]
            g.employees.push({
              employeeNo: empNo || '',
              name: emp.name,
              gender: emp.gender,
              monthly: costs?.monthly || {},
              total: costs?.total || 0
            })
            Object.entries(costs?.monthly || {}).forEach(([m, v]) => {
              g.monthTotals[m] = (g.monthTotals[m] || 0) + v
            })
            g.total += costs?.total || 0
          })
          Object.values(byTitle).forEach(j =>
            j.employees.sort((a, b) => (a.employeeNo || '').localeCompare(b.employeeNo || ''))
          )
          return Object.values(byTitle)
            .filter(j => j.total > 0)
            .sort((a, b) => b.total - a.total)
        })()
        const fmtC = (n) => {
          if (!n && n !== 0) return '—'
          return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        }
        const grandTotal = {}
        jobRows.forEach(j => months.forEach(m => {
          grandTotal[m] = (grandTotal[m] || 0) + (j.monthTotals[m] || 0)
        }))
        return (
          <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-sm font-bold text-navy">Employee Cost by Job Type</h3>
              <p className="text-[10px] text-muted mt-0.5">Click a row to expand employees · {jobRows.length} job types</p>
            </div>
            <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 700 }}>
              <table className="text-[11px] border-collapse w-full" style={{ minWidth: Math.max(700, 240 + months.length * 130) }}>
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: '#02404F' }}>
                    <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20 min-w-[220px]"
                        style={{ background: '#02404F' }}>Job Description</th>
                    {months.map(m => (
                      <th key={m} className="px-3 py-3 font-bold text-white text-right whitespace-nowrap min-w-[120px]">{m}</th>
                    ))}
                    <th className="px-3 py-3 font-bold text-white text-right whitespace-nowrap min-w-[120px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {jobRows.map((job, ji) => {
                    const isOpen = !!expandedJobs[job.jobTitle]
                    const rowBg  = ji % 2 === 0 ? '#fff' : '#F9FBFD'
                    return (
                      <Fragment key={job.jobTitle}>
                        <tr
                          className="border-t border-border cursor-pointer hover:bg-[#F0F7F6] transition-colors"
                          style={{ background: rowBg }}
                          onClick={() => setExpandedJobs(prev => ({ ...prev, [job.jobTitle]: !prev[job.jobTitle] }))}
                        >
                          <td className="px-4 py-2.5 font-semibold text-navy sticky left-0 z-10"
                              style={{ background: rowBg }}>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-[10px] text-muted w-3">{isOpen ? '▾' : '▸'}</span>
                              {job.jobTitle}
                            </span>
                          </td>
                          {months.map(m => (
                            <td key={m} className="px-3 py-2.5 text-right tabular-nums text-navy">
                              {fmtC(job.monthTotals[m] || null)}
                            </td>
                          ))}
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold text-navy">{fmtC(job.total)}</td>
                        </tr>
                        {isOpen && job.employees.map(emp => (
                          <tr key={emp.name} className="border-t border-border/30" style={{ background: '#F0FAF9' }}>
                            <td className="pl-10 pr-4 py-2 sticky left-0 z-10" style={{ background: '#F0FAF9' }}>
                              <div className="inline-flex items-center gap-1.5">
                                {emp.employeeNo && (
                                  <span className="font-mono text-[10px] text-muted">{emp.employeeNo}</span>
                                )}
                                <span className="text-[11px] font-medium text-navy">{emp.name}</span>
                              </div>
                              {emp.gender && (
                                <div className="mt-0.5">
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={{ background: emp.gender === 'Male' ? 'rgba(2,64,79,.06)' : 'rgba(31,182,166,.1)', color: emp.gender === 'Male' ? MALE_COLOR : FEMALE_COLOR }}>
                                    {emp.gender === 'Male' ? '♂' : '♀'} {emp.gender}
                                  </span>
                                </div>
                              )}
                            </td>
                            {months.map(m => (
                              <td key={m} className="px-3 py-2 text-right tabular-nums text-muted">
                                {fmtC(emp.monthly[m] || null)}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-navy">{fmtC(emp.total || null)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 z-10">
                  <tr style={{ background: '#02404F' }}>
                    <td className="px-4 py-3 font-extrabold text-white sticky left-0 z-20" style={{ background: '#02404F' }}>Total</td>
                    {months.map(m => (
                      <td key={m} className="px-3 py-3 text-right tabular-nums font-bold text-white">
                        {fmtC(grandTotal[m] || null)}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-white">
                      {fmtC(jobRows.reduce((s, j) => s + j.total, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── Headcount by Department (3-level drilldown) ── */}
      {deptChartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-navy">No Employees per Business Unit</h3>
            {activeDept && (
              <button
                onClick={() => { setActiveDept(null); setActiveSection(null) }}
                className="text-[10px] font-semibold text-muted hover:text-navy transition-colors flex items-center gap-1"
              >
                ← All departments
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted mb-3">Click a bar to drill into sections and employees</p>
          <GenderLegend />

          <ResponsiveContainer width="100%" height={Math.max(220, deptChartData.length * 34)}>
            <BarChart data={deptChartData} layout="vertical"
              margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
              onClick={handleDeptBarClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={130} />
              <Tooltip content={<GenderTooltip />} cursor={{ fill: 'rgba(2,64,79,0.06)' }} />
              <Bar dataKey="male"   name="Male"   stackId="g" fill={MALE_COLOR}   maxBarSize={18} onClick={(d) => handleDeptBarClick(d)} />
              <Bar dataKey="female" name="Female" stackId="g" fill={FEMALE_COLOR} maxBarSize={18} radius={[0, 4, 4, 0]} onClick={(d) => handleDeptBarClick(d)} />
            </BarChart>
          </ResponsiveContainer>

          {/* Level 2: sections */}
          {filteredDeptObj && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-extrabold text-white px-2 py-0.5 rounded-full" style={{ background: '#02404F' }}>
                  {filteredDeptObj.deptName}
                </span>
                <GenderBadge male={filteredDeptObj.male} female={filteredDeptObj.female} />
                <span className="text-[10px] text-muted">{filteredDeptObj.count} employees · {filteredDeptObj.sections.length} sections</span>
              </div>
              <div className="space-y-1">
                {filteredDeptObj.sections.map(sec => {
                  const isOpen = activeSection === sec.sectionCode
                  return (
                    <div key={sec.sectionCode}>
                      <button
                        onClick={() => setActiveSection(isOpen ? null : sec.sectionCode)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-slate-50"
                        style={{ background: isOpen ? '#EBF8F6' : undefined }}
                      >
                        <span className="text-[9px] font-extrabold" style={{ color: '#EB7D23', width: 10 }}>{isOpen ? '▼' : '▶'}</span>
                        <span className="flex-1 text-[12px] font-semibold text-navy truncate">{sec.sectionName}</span>
                        <GenderBadge male={sec.male} female={sec.female} />
                        <span className="text-[10px] text-muted w-12 text-right">{sec.count}</span>
                      </button>
                      {/* Level 3: employees */}
                      {isOpen && (
                        <div className="ml-6 mt-1 mb-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                          {sec.employees.map((emp, i) => (
                            <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-white border border-border">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white flex-shrink-0 mt-0.5"
                                style={{ background: emp.gender === 'Male' ? MALE_COLOR : FEMALE_COLOR }}>
                                {(emp.name || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold text-navy truncate">
                                  {[emp.employeeNo || nameToEmpNo[emp.name], emp.name].filter(Boolean).join(' ') || '—'}
                                </p>
                                <p className="text-[9px] text-muted truncate">{emp.jobTitle || emp.employeeType || '—'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Headcount Evolution + Turnover Rate ── */}
      {(headcountEvolution.length > 0 || turnoverData.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* Headcount Evolution area chart */}
          {headcountEvolution.length > 0 && (
            <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
              <h3 className="text-sm font-bold text-navy mb-1">Headcount Evolution</h3>
              <p className="text-[10px] text-muted mb-4">Active employee count per month (last 12 months)</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={headcountEvolution} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hcGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#02404F" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#02404F" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    formatter={v => [v, 'Employees']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }}
                  />
                  <Area type="monotone" dataKey="count" name="Headcount"
                    stroke="#02404F" strokeWidth={2} fill="url(#hcGrad)" dot={{ r: 3, fill: '#02404F' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Turnover Rate composed chart (bars + line) */}
          {turnoverData.length > 0 && (
            <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
              <h3 className="text-sm font-bold text-navy mb-1">Employee Turnover Rate</h3>
              <p className="text-[10px] text-muted mb-4">Joiners vs leavers per month · rate % (last 12 months)</p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={turnoverData} margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="count" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis yAxisId="rate" orientation="right" tickFormatter={v => v + '%'}
                    tick={{ fontSize: 9, fill: '#EB7D23' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }}
                    formatter={(v, name) => name === 'Rate %' ? [v + '%', name] : [v, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                  <Bar yAxisId="count" dataKey="joiners" name="Joiners" fill="#1FB6A6" maxBarSize={14} radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="count" dataKey="leavers" name="Leavers" fill="#E5544B" maxBarSize={14} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="rate" type="monotone" dataKey="rate" name="Rate %" stroke="#EB7D23" strokeWidth={2}
                    dot={{ r: 3, fill: '#EB7D23' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Contract Type per BU matrix heatmap ── */}
      {filteredByDeptByType.length > 0 && filteredAllContractTypes.length > 0 && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Active Contract Type per Business Unit</h3>
            <p className="text-[10px] text-muted mt-0.5">Headcount by contract type · click a row to see employees</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{ background: '#02404F' }}>
                  <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-10 min-w-[160px]" style={{ background: '#02404F' }}>Business Unit</th>
                  {filteredAllContractTypes.map(t => (
                    <th key={t} className="px-3 py-3 font-bold text-white text-right whitespace-nowrap min-w-[90px]">{t}</th>
                  ))}
                  <th className="px-4 py-3 font-bold text-white text-right min-w-[72px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxVal = Math.max(...filteredByDeptByType.flatMap(d => Object.values(d.types)));
                  return filteredByDeptByType.map((row, i) => {
                    const total = Object.values(row.types).reduce((s, v) => s + v, 0);
                    const isOpen = !!expandedStatusBU[row.deptCode];
                    const emps   = filteredBuEmpList[row.deptCode] || [];
                    const bg = i % 2 === 0 ? '#fff' : '#F9FBFD';
                    return (
                      <Fragment key={row.deptCode}>
                        <tr
                          className="border-t border-border cursor-pointer hover:bg-[#F0F7F6] transition-colors"
                          style={{ background: bg }}
                          onClick={() => setExpandedStatusBU(prev => ({ ...prev, [row.deptCode]: !prev[row.deptCode] }))}
                        >
                          <td className="px-4 py-2.5 font-semibold text-navy sticky left-0 z-10" style={{ background: bg }}>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-[10px] text-muted w-3 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                              {row.deptName}
                            </span>
                          </td>
                          {filteredAllContractTypes.map(t => {
                            const val = row.types[t] || 0;
                            const intensity = maxVal > 0 ? val / maxVal : 0;
                            return (
                              <td key={t} className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{
                                background: val > 0 ? `rgba(2,64,79,${0.06 + intensity * 0.22})` : 'transparent',
                                color: intensity > 0.6 ? '#02404F' : '#6B7C93'
                              }}>
                                {val > 0 ? val : <span className="opacity-20">—</span>}
                              </td>
                            )
                          })}
                          <td className="px-4 py-2.5 text-right font-bold text-navy tabular-nums">{total}</td>
                        </tr>
                        {isOpen && emps.map(emp => {
                          const empType = empNoToType[emp.employeeNo] || emp.employeeType || '';
                          return (
                            <tr key={emp.employeeNo} className="border-t border-border/30" style={{ background: '#F0FAF9' }}>
                              <td className="pl-9 pr-4 py-1.5 sticky left-0 z-10" style={{ background: '#F0FAF9' }}>
                                <span className="inline-flex items-center gap-1.5">
                                  {emp.employeeNo && <span className="font-mono text-[10px] text-muted">{emp.employeeNo}</span>}
                                  <span className="text-[11px] font-medium text-navy">{emp.name}</span>
                                </span>
                              </td>
                              {filteredAllContractTypes.map(t => (
                                <td key={t} className="px-3 py-1.5 text-right tabular-nums">
                                  {empType === t
                                    ? <span className="font-bold" style={{ color: '#02404F' }}>1</span>
                                    : <span className="opacity-20">—</span>
                                  }
                                </td>
                              ))}
                              <td className="px-4 py-1.5 text-right font-bold tabular-nums" style={{ color: '#02404F' }}>1</td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* ── Employee Seniority List ── */}
      {filteredSeniorityList.length > 0 && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Employee Seniority List</h3>
            <p className="text-[10px] text-muted mt-0.5">All {filteredSeniorityList.length} active employees sorted by hire date — longest serving first · scroll to see all</p>
          </div>
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 480 }}>
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: '#02404F' }}>
                  <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20 min-w-[180px]" style={{ background: '#02404F' }}>Employee</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Hire Date</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Service</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Job Title</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Type</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Entity</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Gender</th>
                </tr>
              </thead>
              <tbody>
                {filteredSeniorityList.map((emp, i) => (
                  <tr key={i} className="border-t border-border" style={{ background: i % 2 === 0 ? '#fff' : '#F9FBFD' }}>
                    <td className="px-4 py-2 sticky left-0 z-10 font-medium text-navy" style={{ background: i % 2 === 0 ? '#fff' : '#F9FBFD' }}>
                      {[emp.employeeNo || nameToEmpNo[emp.name], emp.name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-muted tabular-nums">{emp.hired || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-navy tabular-nums">{yearsOfService(emp.hired)}</td>
                    <td className="px-3 py-2 text-muted">{emp.title || '—'}</td>
                    <td className="px-3 py-2 text-muted">{emp.type || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: emp.vc === 'ETH' ? 'rgba(2,64,79,.1)' : 'rgba(31,182,166,.12)',
                                 color:      emp.vc === 'ETH' ? MALE_COLOR : '#0e8a7e' }}>
                        {emp.vc || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span style={{ color: emp.gender === 'Male' ? MALE_COLOR : FEMALE_COLOR, fontWeight: 600 }}>
                        {emp.gender === 'Male' ? '♂' : '♀'} {emp.gender || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
