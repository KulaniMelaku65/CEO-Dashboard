import { useState, Fragment } from 'react'
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  AreaChart, Area, LineChart, Line, ComposedChart, Legend
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtNum, fmtPct } from '../lib/fmt.js'

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

  // jobEmpMap: jobTitle → [{ employeeNo, name, gender }]
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
          jobEmpMap[title].push({ employeeNo: nameToEmpNo[emp.name], name: emp.name, gender: emp.gender })
        }
      })
    })
  })

  // empPayrollMap: employeeNo → { monthly, total } — merged across all BUs from payroll drilldown
  const empPayrollMap = {}
  ;(ec.buDrillDown || []).forEach(bu => {
    ;(bu.sections || []).forEach(sec => {
      ;(sec.employees || []).forEach(emp => {
        if (!emp.employeeNo) return
        if (!empPayrollMap[emp.employeeNo]) empPayrollMap[emp.employeeNo] = { monthly: {}, total: 0 }
        Object.entries(emp.monthly || {}).forEach(([m, v]) => {
          empPayrollMap[emp.employeeNo].monthly[m] = (empPayrollMap[emp.employeeNo].monthly[m] || 0) + v
        })
        empPayrollMap[emp.employeeNo].total += emp.total || 0
      })
    })
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
  const deptChartData  = (hr.byDept || []).map(d => ({
    ...d,
    name:        dims[d.dept] || d.dept || 'Unknown',
    male:        d.male   || 0,
    female:      d.female || 0
  }))

  // Cost allocation (Kifiya vs Safee)
  const costSourceData = (ec.byPayrollSource || []).map(d => ({ name: d.source, value: d.total }))
  const totalCost      = costSourceData.reduce((s, d) => s + d.value, 0)
  const costPerEmp     = hr.total > 0 ? Math.round(totalCost / hr.total) : 0

  const male   = genderData.find(g => g.gender === 'Male')?.count   || 0
  const female = genderData.find(g => g.gender === 'Female')?.count || 0
  const eth    = vcData.find(d => d.name === 'ETH')?.value || 0
  const hub    = vcData.find(d => d.name === 'HUB')?.value || 0

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">People & HR</h2>
        <p className="text-xs text-muted font-medium">Workforce composition, diversity, and payroll analytics</p>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Active"      value={fmtNum(hr.total)} sub="Active workforce" />
        <KpiCard label="Male"     value={fmtNum(male)}   sub={hr.total ? fmtPct((male   / hr.total) * 100) + ' of workforce' : ''} />
        <KpiCard label="Female"   value={fmtNum(female)} sub={hr.total ? fmtPct((female / hr.total) * 100) + ' of workforce' : ''} />
        <KpiCard label="ETH"      value={fmtNum(eth)}    sub="Ethiopia entity" />
        <KpiCard label="HUB"      value={fmtNum(hub)}    sub="Hub entity" />
        <KpiCard label="Cost / Employee" value={fmtM(costPerEmp)} sub="Avg monthly payroll ETB" />
      </div>

      {/* ── Workforce Composition + Contract Status ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">No Employees per Entity</h3>
          {vcData.length > 0
            ? <MiniDonut data={vcData} size={140} />
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
          {genderData.length > 0 ? (
            <div className="flex items-center justify-center gap-6">
              <PieChart width={160} height={160}>
                <Pie data={genderData.map(g => ({ name: g.gender, value: g.count }))}
                     cx="50%" cy="50%" innerRadius={44} outerRadius={72}
                     dataKey="value" nameKey="name" paddingAngle={3}>
                  {genderData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              </PieChart>
              <div className="space-y-2.5">
                {genderData.map((g, i) => (
                  <div key={g.gender} className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs font-bold text-navy">{g.gender}</span>
                    <span className="text-xs text-muted font-medium">
                      {fmtNum(g.count)} ({hr.total ? fmtPct((g.count / hr.total) * 100) : '—'})
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
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, typeData.length * 38)}>
              <BarChart data={typeData} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
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
      {jobTitleData.length > 0 && (() => {
        const genderTotal = jobTitleData.reduce((s, d) => ({ male: s.male + d.male, female: s.female + d.female }), { male: 0, female: 0 })
        return (
          <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-navy">Gender per Role / Job Title</h3>
                <p className="text-[10px] text-muted mt-0.5">Click a row to expand employees · {jobTitleData.length} roles</p>
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
                  {jobTitleData.map((row, ri) => {
                    const isOpen  = !!expandedGenderJob[row.jobTitle]
                    const empList = jobEmpMap[row.jobTitle] || []
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
      {jobTitleData.length > 0 && (ec.payrollMonths || []).length > 0 && (() => {
        const months = ec.payrollMonths || []

        // Resolve a headcount fullName (possibly 3-part) to a payroll employeeNo.
        // Payroll stores firstName+lastName only, so we try the full name first,
        // then fall back to first + last word for Ethiopian 3-part names.
        const resolveEmpNo = (fullName) => {
          if (!fullName) return null
          let no = nameToEmpNo[fullName]
          if (no) return no
          const parts = fullName.trim().split(/\s+/)
          if (parts.length >= 3) no = nameToEmpNo[`${parts[0]} ${parts[parts.length - 1]}`]
          return no || null
        }

        // Build job rows from headcount hierarchy (reliable job titles) joined to
        // payroll costs via name → employeeNo lookup.
        const jobRows = (() => {
          const byTitle = {}
          const seen = new Set()
          ;(hr.byDeptHierarchy || []).forEach(d => {
            ;(d.sections || []).forEach(sec => {
              ;(sec.employees || []).forEach(emp => {
                if (!emp.name || seen.has(emp.name)) return
                seen.add(emp.name)
                const title = emp.jobTitle
                if (!title || title === 'Unknown') return
                const empNo = resolveEmpNo(emp.name)
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
            })
          })
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
          {selectedDeptObj && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-extrabold text-white px-2 py-0.5 rounded-full" style={{ background: '#02404F' }}>
                  {selectedDeptObj.deptName}
                </span>
                <GenderBadge male={selectedDeptObj.male} female={selectedDeptObj.female} />
                <span className="text-[10px] text-muted">{selectedDeptObj.count} employees · {selectedDeptObj.sections.length} sections</span>
              </div>
              <div className="space-y-1">
                {selectedDeptObj.sections.map(sec => {
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
      {byDeptByType.length > 0 && allContractTypes.length > 0 && (
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
                  {allContractTypes.map(t => (
                    <th key={t} className="px-3 py-3 font-bold text-white text-right whitespace-nowrap min-w-[90px]">{t}</th>
                  ))}
                  <th className="px-4 py-3 font-bold text-white text-right min-w-[72px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxVal = Math.max(...byDeptByType.flatMap(d => Object.values(d.types)));
                  return byDeptByType.map((row, i) => {
                    const total = Object.values(row.types).reduce((s, v) => s + v, 0);
                    const isOpen = !!expandedStatusBU[row.deptCode];
                    const emps   = buEmpList[row.deptCode] || [];
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
                          {allContractTypes.map(t => {
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
                              {allContractTypes.map(t => (
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
      {seniorityList.length > 0 && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Employee Seniority List</h3>
            <p className="text-[10px] text-muted mt-0.5">All {seniorityList.length} active employees sorted by hire date — longest serving first · scroll to see all</p>
          </div>
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 480 }}>
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: '#02404F' }}>
                  <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20 min-w-[180px]" style={{ background: '#02404F' }}>#  Employee</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Hire Date</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Service</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Job Title</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Type</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Entity</th>
                  <th className="px-3 py-3 font-bold text-white text-left whitespace-nowrap">Gender</th>
                </tr>
              </thead>
              <tbody>
                {seniorityList.map((emp, i) => (
                  <tr key={i} className="border-t border-border" style={{ background: i % 2 === 0 ? '#fff' : '#F9FBFD' }}>
                    <td className="px-4 py-2 sticky left-0 z-10 font-medium text-navy" style={{ background: i % 2 === 0 ? '#fff' : '#F9FBFD' }}>
                      <span className="text-muted font-mono mr-2">{String(i + 1).padStart(2, '0')}</span>
                      {[nameToEmpNo[emp.name], emp.name].filter(Boolean).join(' ') || '—'}
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
