import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtNum, fmtPct } from '../lib/fmt.js'
import PeopleOpsFilterBar from '../components/PeopleOpsFilterBar.jsx'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'

const PIE_COLORS   = ['#7FA8C9', '#1FB6A6', '#EB7D23', '#2EBD85', '#F5A870', '#E5544B']
const MALE_COLOR   = '#7FA8C9'
const FEMALE_COLOR = '#1FB6A6'
const AXIS_COLOR   = 'rgba(255,255,255,0.55)'
const GRID_COLOR   = 'rgba(255,255,255,0.12)'
const TOOLTIP_STYLE = { fontSize: 11, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: '#0A3A46', color: '#fff' }

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
    <div style={{ background: '#0A3A46', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 11, minWidth: 140 }}>
      <p style={{ fontWeight: 700, color: '#fff', marginBottom: 6 }}>{label}</p>
      <p style={{ color: MALE_COLOR,   marginBottom: 2 }}>Male: <strong>{male}</strong></p>
      <p style={{ color: FEMALE_COLOR, marginBottom: 2 }}>Female: <strong>{female}</strong></p>
      <p style={{ color: AXIS_COLOR, borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 6, paddingTop: 6 }}>
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

function MiniDonut({ data, size = 140 }) {
  return (
    <div className="flex items-center gap-4">
      <PieChart width={size} height={size}>
        <Pie data={data} cx="50%" cy="50%" innerRadius={size * 0.3} outerRadius={size * 0.46}
             dataKey="value" paddingAngle={3}>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v, n) => [v, n]} contentStyle={TOOLTIP_STYLE} />
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

export default function HR({ data }) {
  const hr  = data.hr || {}
  const ec  = data.employeeCost || {}

  const { filterBU, filterType, filterVC, filterSource, filterMonth } = usePeopleOpsFilters()

  const sectionToDept    = hr.sectionToDept    || {}
  const deptDisplayNames = hr.deptDisplayNames || {}

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

  // Resolve a headcount fullName (possibly 3-part) to a payroll employeeNo
  const resolveEmpNo = (name) => {
    if (!name) return undefined
    let no = nameToEmpNo[name]
    if (no) return no
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 3) no = nameToEmpNo[`${parts[0]} ${parts[parts.length - 1]}`]
    return no || undefined
  }

  // empPayrollMap: employeeNo → { monthly, total } — merged across all BUs from payroll drilldown
  // Pension (emp.pension / emp.pensionMonthly) is folded into the totals here so headcount-cost
  // KPIs reflect the true employer cost.
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
  // Best-effort when a month/year is selected: only counts people traceable via
  // GetEmployee (still or previously Active) — KFT_Employment_History has no employment-
  // type field at all, so anyone who dropped out of GetEmployee entirely can't be typed.
  // Totals here can undercount hr.headcountEvolution's overall count for that reason.
  const filteredTypeData = monthEvo
    ? Object.entries(monthEvo.byType || {})
        .map(([type, v]) => ({ type, male: v.male, female: v.female }))
        .filter(t => t.male + t.female > 0)
        .sort((a, b) => (b.male + b.female) - (a.male + a.female))
    : Object.values(_tC).filter(t => t.male + t.female > 0).sort((a, b) => (b.male + b.female) - (a.male + a.female))

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
                <Tooltip formatter={(v, n) => [v, n]} contentStyle={TOOLTIP_STYLE} />
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
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: AXIS_COLOR }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: AXIS_COLOR }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<GenderTooltip />} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
                <Bar dataKey="male"   name="Male"   stackId="g" fill={MALE_COLOR}   maxBarSize={18} />
                <Bar dataKey="female" name="Female" stackId="g" fill={FEMALE_COLOR} maxBarSize={18} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-muted text-sm">No data</div>
          )}
        </div>
      </div>
    </div>
  )
}
