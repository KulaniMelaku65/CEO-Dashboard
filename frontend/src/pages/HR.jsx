import { useState } from 'react'
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

  const [activeDept,    setActiveDept]    = useState(null)
  const [activeSection, setActiveSection] = useState(null)

  const genderData          = hr.byGender          || []
  const typeData            = (hr.byType           || []).map(d => ({ ...d, male: d.male || 0, female: d.female || 0 }))
  const jobTitleData        = (hr.byJobTitle       || []).map(d => ({ ...d, male: d.male || 0, female: d.female || 0 }))
  const statusData          = (hr.byStatus         || []).map(d => ({ name: d.status, value: d.count }))
  const vcData              = (hr.byVirtualCompany || []).map(d => ({ name: d.virtualCompany, value: d.count }))
  const seniorityList       = hr.seniorityList     || []
  const deptHierarchy       = hr.byDeptHierarchy   || []
  // Use backend's full sectionToDept map (covers payroll-only & terminated employee sections)
  const sectionToDept    = hr.sectionToDept    || {}
  const deptDisplayNames = hr.deptDisplayNames || {}
  const parentBUNames    = { ...deptDisplayNames }
  ;(hr.byDeptHierarchy || []).forEach(d => { parentBUNames[d.deptCode] = d.deptName })
  const parentBUCodes = new Set(Object.keys(parentBUNames))

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
      if (!grouped[buCode]) grouped[buCode] = { deptCode: buCode, deptName: buName, Active: 0, Terminated: 0 }
      grouped[buCode].Active     += row.Active     || 0
      grouped[buCode].Terminated += row.Terminated || 0
    })
    return Object.values(grouped).sort((a, b) => (b.Active + b.Terminated) - (a.Active + a.Terminated))
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
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">N° Employees per Entity</h3>
          {vcData.length > 0
            ? <MiniDonut data={vcData} size={140} />
            : <div className="h-36 flex items-center justify-center text-muted text-sm">No data</div>}
        </div>

        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Employment Status</h3>
          {statusData.length > 0
            ? <MiniDonut data={statusData} size={140} />
            : <div className="h-36 flex items-center justify-center text-muted text-sm">No data</div>}
        </div>

        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">HR Cost Allocation</h3>
          <p className="text-[10px] text-muted mb-3">Kifiya (permanent) vs Programme (Safee)</p>
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
      {jobTitleData.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-2">Gender per Role / Job Title</h3>
          <GenderLegend />
          <ResponsiveContainer width="100%" height={Math.max(220, jobTitleData.length * 34)}>
            <BarChart data={jobTitleData} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="jobTitle" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={160} />
              <Tooltip content={<GenderTooltip />} cursor={{ fill: 'rgba(2,64,79,0.04)' }} />
              <Bar dataKey="male"   name="Male"   stackId="g" fill={MALE_COLOR}   maxBarSize={16} />
              <Bar dataKey="female" name="Female" stackId="g" fill={FEMALE_COLOR} maxBarSize={16} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Headcount by Department (3-level drilldown) ── */}
      {deptChartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-navy">N° Employees per Business Unit</h3>
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
                                <p className="text-[11px] font-bold text-navy truncate">{emp.name || '—'}</p>
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
            <p className="text-[10px] text-muted mt-0.5">Headcount by contract type across business units</p>
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
                    return (
                      <tr key={row.deptCode} className="border-t border-border" style={{ background: i % 2 === 0 ? '#fff' : '#F9FBFD' }}>
                        <td className="px-4 py-2.5 font-semibold text-navy sticky left-0 z-10" style={{ background: i % 2 === 0 ? '#fff' : '#F9FBFD' }}>{row.deptName}</td>
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
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Contract Status per BU matrix ── */}
      {byDeptByStatus.length > 0 && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Contract Status per Business Unit</h3>
            <p className="text-[10px] text-muted mt-0.5">Active headcount vs total separations per BU</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{ background: '#02404F' }}>
                  <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-10 min-w-[160px]" style={{ background: '#02404F' }}>Business Unit</th>
                  <th className="px-4 py-3 font-bold text-right whitespace-nowrap min-w-[90px]" style={{ color: '#86EFCF' }}>Active</th>
                  <th className="px-4 py-3 font-bold text-right whitespace-nowrap min-w-[90px]" style={{ color: '#FBB97B' }}>Terminated</th>
                  <th className="px-4 py-3 font-bold text-white text-right min-w-[90px]">Active %</th>
                  <th className="px-4 py-3 font-bold text-white text-right min-w-[72px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {byDeptByStatus.map((row, i) => {
                  const total   = (row.Active || 0) + (row.Inactive || 0);
                  const activePct = total > 0 ? ((row.Active / total) * 100).toFixed(0) : 0;
                  const bg = i % 2 === 0 ? '#fff' : '#F9FBFD';
                  return (
                    <tr key={row.deptCode} className="border-t border-border" style={{ background: bg }}>
                      <td className="px-4 py-2.5 font-semibold text-navy sticky left-0 z-10" style={{ background: bg }}>{row.deptName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: '#02404F' }}>
                        {row.Active || <span className="opacity-20">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: '#EB7D23' }}>
                        {row.Terminated || <span className="opacity-20">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: '#E3E9F2' }}>
                            <div className="h-full rounded-full" style={{ width: activePct + '%', background: '#02404F' }} />
                          </div>
                          <span className="font-semibold text-navy w-8 text-right">{activePct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-navy tabular-nums">{total}</td>
                    </tr>
                  )
                })}
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
            <p className="text-[10px] text-muted mt-0.5">Active employees sorted by hire date — longest serving first</p>
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
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
                      <span className="text-muted font-mono mr-2">{String(i + 1).padStart(2, '0')}</span>{emp.name || '—'}
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
