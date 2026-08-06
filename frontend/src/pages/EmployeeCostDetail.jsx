import { useState, Fragment } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell, LineChart, Line, ReferenceLine } from 'recharts'
import KpiCard from '../components/KpiCard.jsx'

const MALE_COLOR   = '#02404F'
const FEMALE_COLOR = '#1FB6A6'
const KIF_COLOR    = '#02404F'
const SAF_COLOR    = '#EB7D23'

const fmt = (n) => {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return (v / 1_000).toFixed(1) + 'K'
  return v.toLocaleString()
}

const fmtFull = (n) => {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function GenderTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const male   = payload.find(p => p.dataKey === 'male')?.value   || 0
  const female = payload.find(p => p.dataKey === 'female')?.value || 0
  return (
    <div style={{ background: '#fff', border: '1px solid #E3E9F2', borderRadius: 8, padding: '8px 12px', fontSize: 11, minWidth: 160 }}>
      <p style={{ fontWeight: 700, color: '#02404F', marginBottom: 6 }}>{label}</p>
      <p style={{ color: MALE_COLOR,   marginBottom: 2 }}>Male: <strong>{male}</strong></p>
      <p style={{ color: FEMALE_COLOR, marginBottom: 2 }}>Female: <strong>{female}</strong></p>
      <p style={{ color: '#6B7C93', borderTop: '1px solid #E3E9F2', marginTop: 6, paddingTop: 6 }}>
        Total: <strong>{male + female}</strong>
      </p>
    </div>
  )
}

export default function EmployeeCostDetail({ data }) {
  const ec   = data.employeeCost || {}
  const hr   = data.hr || {}

  const vcData    = ec.byVirtualCompany || []
  const months    = ec.payrollMonths    || []

  // 3-level (BU→section→employee) structure; fall back to wrapped drillDown before first refresh
  const rawBU = ec.buDrillDown || []
  const buDrillDown = rawBU.length > 0
    ? rawBU
    : (ec.drillDown || []).map(d => ({
        buCode:      d.dept,
        buName:      d.deptName,
        total:       d.total,
        monthTotals: d.monthTotals,
        sections: [{
          sectionCode: d.dept,
          sectionName: d.deptName,
          total:       d.total,
          monthTotals: d.monthTotals,
          employees:   (d.employees || []).map(e => ({ ...e, kifiya: e.kifiya || 0, safee: e.safee || 0, vc: e.vc || 'Unknown' }))
        }]
      }))

  // Bar chart data — parent BU level with gender breakdown
  const deptChartData = (hr.byDeptHierarchy || []).slice(0, 16).map(d => ({
    dept:        d.deptCode,
    name:        d.deptName,
    displayName: d.deptName.length > 24 ? d.deptName.slice(0, 23) + '…' : d.deptName,
    male:        d.male   || 0,
    female:      d.female || 0,
    count:       d.count  || 0
  }))

  // Use backend's full sectionToDept map (covers all dimension values including payroll-only sections)
  const sectionToDept    = hr.sectionToDept    || {}
  const deptDisplayNames = hr.deptDisplayNames || {}
  const parentBUCodes    = new Set(Object.keys(deptDisplayNames))
  ;(hr.byDeptHierarchy || []).forEach(d => parentBUCodes.add(d.deptCode))

  const resolveParentBU = (code, fallbackName) => {
    const buCode = sectionToDept[code] || (parentBUCodes.has(code) ? code : code)
    const buName = deptDisplayNames[buCode] || (hr.byDeptHierarchy || []).find(d => d.deptCode === buCode)?.deptName || fallbackName || buCode
    return { buCode, buName }
  }

  // Re-group buDrillDown by parent BU using the authoritative sectionToDept map
  const normalizedDrillDown = (() => {
    if (buDrillDown.length === 0) return buDrillDown
    const grouped = {}
    buDrillDown.forEach(bu => {
      const { buCode, buName } = resolveParentBU(bu.buCode, bu.buName)
      if (!grouped[buCode]) grouped[buCode] = { buCode, buName, sections: [], monthTotals: {}, total: 0 }
      const g = grouped[buCode]
      bu.sections.forEach(sec => g.sections.push(sec))
      Object.entries(bu.monthTotals || {}).forEach(([m, v]) => { g.monthTotals[m] = (g.monthTotals[m] || 0) + v })
      g.total += bu.total
    })
    return Object.values(grouped).sort((a, b) => b.total - a.total)
  })()

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedBU,  setSelectedBU]  = useState(null)   // buCode or null
  const [expandedSec, setExpandedSec] = useState({})
  const [entityFilter, setEntityFilter] = useState(null)  // 'ETH|KIFIYA' etc

  const entitySrcData = ec.byEntitySource || []

  const toggleSec = (buCode, secCode) => {
    const key = `${buCode}|${secCode}`
    setExpandedSec(p => ({ ...p, [key]: !p[key] }))
  }

  const selectBU = (deptCode) => {
    setSelectedBU(prev => prev === deptCode ? null : deptCode)
    setExpandedSec({})
  }

  // ── Selected BU details (for gender panel) ───────────────────────────────
  const selectedBUHR = selectedBU ? deptChartData.find(d => d.dept === selectedBU) : null

  // ── Cost per BU column chart data ────────────────────────────────────────
  // Prefer parent BU name from HR hierarchy; fall back to buName from drill-down
  const buNameLookup = {}
  ;(hr.byDeptHierarchy || []).forEach(d => { buNameLookup[d.deptCode] = d.deptName })

  const buCostData = normalizedDrillDown.map(bu => {
    const total = bu.sections.reduce((s, sec) => s + sec.employees.reduce((ss, e) => ss + e.total, 0), 0)
    const name  = buNameLookup[bu.buCode] || bu.buName
    return { code: bu.buCode, name, displayName: name.length > 22 ? name.slice(0, 21) + '…' : name, total }
  }).sort((a, b) => b.total - a.total)
  const buCostGrand = buCostData.reduce((s, d) => s + d.total, 0)

  // ── Cost per Employee (all employees) ────────────────────────────────────
  const [selectedEmp, setSelectedEmp] = useState(null)
  const allEmployees = normalizedDrillDown.flatMap(bu =>
    bu.sections.flatMap(sec =>
      sec.employees.map(e => ({
        ...e,
        buName:      bu.buName,
        sectionName: sec.sectionName,
        displayName: [e.employeeNo, e.name].filter(Boolean).join(' ').slice(0, 26)
      }))
    )
  ).sort((a, b) => b.total - a.total)
  const selectedEmpData = selectedEmp ? allEmployees.find(e => e.employeeNo === selectedEmp) : null
  const empTrendData = selectedEmpData
    ? months.map(m => ({ month: m, cost: selectedEmpData.monthly[m] || 0 }))
    : []

  // ── Filter pipeline ───────────────────────────────────────────────────────
  // 1. Entity × source filter
  const entityFiltered = entityFilter
    ? (() => {
        const [fe, fs] = entityFilter.split('|')
        return normalizedDrillDown.map(bu => ({
          ...bu,
          sections: bu.sections.map(sec => ({
            ...sec,
            employees: sec.employees.filter(emp => {
              const matchE = emp.vc === fe
              const matchS = fs === 'KIFIYA' ? (emp.kifiya || 0) > 0
                           : fs === 'SAFEE'  ? (emp.safee  || 0) > 0
                           : true
              return matchE && matchS
            })
          })).filter(s => s.employees.length > 0)
        })).filter(bu => bu.sections.length > 0)
      })()
    : normalizedDrillDown

  // 2. BU selection filter
  const visibleDrillDown = selectedBU
    ? entityFiltered.filter(bu => bu.buCode === selectedBU)
    : entityFiltered

  // ── Totals ────────────────────────────────────────────────────────────────
  const eth   = vcData.find(d => d.virtualCompany === 'ETH')?.total || 0
  const hub   = vcData.find(d => d.virtualCompany === 'HUB')?.total || 0
  const grand = visibleDrillDown.reduce((s, bu) => s + bu.sections.reduce((ss, sec) => ss + sec.employees.reduce((sss, e) => sss + e.total, 0), 0), 0)

  // ── Helper ────────────────────────────────────────────────────────────────
  const pct = (part, total) => total > 0 ? ((part / total) * 100).toFixed(0) + '%' : '—'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Employee Cost by Business Unit</h2>
        <p className="text-xs text-muted font-medium">
          {selectedBU
            ? `Showing: ${selectedBUHR?.name || selectedBU} — click the bar again or "Clear" to see all`
            : 'Click a business unit bar to drill in; click a section to see employees'}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Ethiopia" value={fmt(eth)}   sub="Virtual Company: ETH" />
        <KpiCard label="HUB"      value={fmt(hub)}   sub="Virtual Company: HUB" />
        <KpiCard label="Total"    value={fmt(grand)}  sub={selectedBU ? selectedBUHR?.name || selectedBU : 'Kifiya + MSP / Programme'} />
      </div>

      {/* Entity × Payroll Source tiles */}
      {entitySrcData.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-navy">By Company & Payroll Source</h3>
              <p className="text-[10px] text-muted mt-0.5">
                {entityFilter
                  ? `Filtered: ${entityFilter.replace('|', ' · ')} — click again to clear`
                  : 'Click a tile to filter employees below by company & source'}
              </p>
            </div>
            {entityFilter && (
              <button onClick={() => setEntityFilter(null)}
                className="text-[10px] font-bold px-3 py-1 rounded-full border transition-colors"
                style={{ color: '#02404F', borderColor: '#02404F' }}>
                Clear ✕
              </button>
            )}
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(entitySrcData.length * 2, 8)}, minmax(0,1fr))` }}>
            {entitySrcData.map(row => {
              const kifKey = `${row.entity}|KIFIYA`
              const safKey = `${row.entity}|SAFEE`
              return (
                <Fragment key={row.entity}>
                  <button onClick={() => setEntityFilter(f => f === kifKey ? null : kifKey)}
                    className="rounded-xl border-2 p-4 text-left transition-all hover:shadow-md"
                    style={{ borderColor: entityFilter === kifKey ? KIF_COLOR : '#E3E9F2', background: entityFilter === kifKey ? '#EBF8F6' : '#F9FBFD' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: KIF_COLOR }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: KIF_COLOR }}>{row.entity} · Kifiya</span>
                    </div>
                    <p className="text-lg font-extrabold text-navy tabular-nums">{fmt(row.kifiyaTotal)}</p>
                    <p className="text-[10px] text-muted mt-0.5">{row.kifiyaCount} employee{row.kifiyaCount !== 1 ? 's' : ''}</p>
                  </button>

                  <button onClick={() => setEntityFilter(f => f === safKey ? null : safKey)}
                    className="rounded-xl border-2 p-4 text-left transition-all hover:shadow-md"
                    style={{ borderColor: entityFilter === safKey ? SAF_COLOR : '#E3E9F2', background: entityFilter === safKey ? '#FEF3EA' : '#F9FBFD' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: SAF_COLOR }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: SAF_COLOR }}>{row.entity} · MSP / Programme</span>
                    </div>
                    <p className="text-lg font-extrabold text-navy tabular-nums">{fmt(row.safeeTotal)}</p>
                    <p className="text-[10px] text-muted mt-0.5">{row.safeeCount} employee{row.safeeCount !== 1 ? 's' : ''}</p>
                  </button>
                </Fragment>
              )
            })}
          </div>

          <div className="mt-4">
            <ResponsiveContainer width="100%" height={entitySrcData.length * 34 + 10}>
              <BarChart data={entitySrcData.map(r => ({ name: r.entity, Kifiya: r.kifiyaTotal, 'MSP / Programme': r.safeeTotal }))}
                layout="vertical" margin={{ top: 0, right: 10, left: 40, bottom: 0 }}>
                <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: '#02404F' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={(v, name) => [fmt(v) + ' ETB', name]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="Kifiya" stackId="s" fill={KIF_COLOR} maxBarSize={16} />
                <Bar dataKey="MSP / Programme" stackId="s" fill={SAF_COLOR} maxBarSize={16} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Company Cost per Business Unit column chart ── */}
      {buCostData.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-1">Company Cost per Business Unit</h3>
          <p className="text-[10px] text-muted mb-4">Total payroll cost (Kifiya + MSP / Programme) per parent BU — % of grand total</p>
          <ResponsiveContainer width="100%" height={Math.max(200, buCostData.length * 42)}>
            <BarChart data={buCostData} layout="vertical" margin={{ top: 0, right: 80, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
              <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="displayName" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={172} />
              <Tooltip
                formatter={(v, _, { payload }) => [
                  `${fmt(v)} ETB (${buCostGrand > 0 ? ((v / buCostGrand) * 100).toFixed(1) : 0}%)`, 'Cost'
                ]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }}
              />
              <Bar dataKey="total" maxBarSize={18} radius={[0, 4, 4, 0]}
                label={{ position: 'right', fontSize: 9, fill: '#6B7C93', formatter: v => buCostGrand > 0 ? ((v / buCostGrand) * 100).toFixed(0) + '%' : '' }}>
                {buCostData.map((d, i) => (
                  <Cell key={d.code} fill={selectedBU === d.code ? '#EB7D23' : i < 3 ? '#02404F' : `rgba(2,64,79,${0.75 - i * 0.04})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Company Cost per Employee ── */}
      {allEmployees.length > 0 && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-navy">Company Cost per Employee</h3>
                <p className="text-[10px] text-muted mt-0.5">{allEmployees.length} employees · click a row to see monthly cost trend</p>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 480 }}>
              <table className="text-[11px] border-collapse w-full" style={{ minWidth: 700 }}>
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: '#02404F' }}>
                    <th className="px-3 py-3 font-bold text-white text-left w-8">#</th>
                    <th className="px-3 py-3 font-bold text-white text-left min-w-[180px]">Employee</th>
                    <th className="px-3 py-3 font-bold text-white text-left min-w-[120px]">Business Unit</th>
                    <th className="px-3 py-3 font-bold text-white text-left min-w-[120px]">Section</th>
                    <th className="px-3 py-3 font-bold text-right min-w-[100px]" style={{ color: '#90D4CE' }}>Kifiya</th>
                    <th className="px-3 py-3 font-bold text-right min-w-[100px]" style={{ color: '#EB7D23' }}>MSP / Programme</th>
                    <th className="px-3 py-3 font-bold text-white text-right min-w-[110px]">Total Cost</th>
                    <th className="px-3 py-3 font-bold text-white text-right min-w-[60px]">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {allEmployees.map((emp, i) => {
                    const isSelected  = selectedEmp === emp.employeeNo
                    const pctOfGrand  = buCostGrand > 0 ? (emp.total / buCostGrand) * 100 : 0
                    const rowBg       = isSelected ? '#EBF8F6' : i % 2 === 0 ? '#fff' : '#F9FBFD'
                    return (
                      <tr
                        key={emp.employeeNo}
                        className="border-t border-border cursor-pointer hover:bg-[#F0F7F6] transition-colors"
                        style={{ background: rowBg }}
                        onClick={() => setSelectedEmp(prev => prev === emp.employeeNo ? null : emp.employeeNo)}
                      >
                        <td className="px-3 py-2 text-muted font-mono">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold text-navy">
                          {[emp.employeeNo, emp.name].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="px-3 py-2 text-muted">{emp.buName}</td>
                        <td className="px-3 py-2 text-muted">{emp.sectionName}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: KIF_COLOR }}>{fmtFull(emp.kifiya || null)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: SAF_COLOR }}>{fmtFull(emp.safee  || null)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-navy">{fmtFull(emp.total)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{pctOfGrand.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 z-10">
                  <tr style={{ background: '#02404F' }}>
                    <td className="px-3 py-3 font-extrabold text-white" colSpan={4}>Total</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: '#90D4CE' }}>
                      {fmtFull(allEmployees.reduce((s, e) => s + (e.kifiya || 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: '#EB7D23' }}>
                      {fmtFull(allEmployees.reduce((s, e) => s + (e.safee || 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-white tabular-nums">
                      {fmtFull(allEmployees.reduce((s, e) => s + e.total, 0))}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-white">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {selectedEmpData && (
            <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-navy">{[selectedEmpData.employeeNo, selectedEmpData.name].filter(Boolean).join(' ')}</h3>
                <p className="text-[10px] text-muted">{selectedEmpData.sectionName} · {selectedEmpData.buName}</p>
                <div className="flex gap-4 mt-2">
                  <span className="text-[10px] font-semibold" style={{ color: '#02404F' }}>
                    Kifiya: <strong>{fmt(selectedEmpData.kifiya || 0)}</strong>
                  </span>
                  <span className="text-[10px] font-semibold" style={{ color: '#EB7D23' }}>
                    MSP / Programme: <strong>{fmt(selectedEmpData.safee || 0)}</strong>
                  </span>
                  <span className="text-[10px] font-semibold text-muted">
                    Total: <strong className="text-navy">{fmt(selectedEmpData.total)}</strong>
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={empTrendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmt} tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => [fmt(v) + ' ETB', 'Cost']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
                  <Line type="monotone" dataKey="cost" stroke="#02404F" strokeWidth={2.5}
                    dot={{ r: 4, fill: '#02404F', strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: '#EB7D23', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Main grid: bar chart (left) + drill-down table (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">

        {/* ── Left: Employees Per BU bar chart ── */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-navy">Employees Per BU</h3>
              {selectedBU && (
                <button onClick={() => { setSelectedBU(null); setExpandedSec({}) }}
                  className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: '#EBF8F6', color: '#02404F' }}>
                  Clear ✕
                </button>
              )}
            </div>
            <div className="flex gap-4 mb-3">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: MALE_COLOR }} /> Male
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: FEMALE_COLOR }} /> Female
              </span>
            </div>
            <p className="text-[9px] text-muted mb-2">Click a bar to filter payroll data</p>

            {deptChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(220, deptChartData.length * 38)}>
                <BarChart
                  data={deptChartData}
                  layout="vertical"
                  margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
                  onClick={e => { if (e?.activePayload?.[0]) selectBU(e.activePayload[0].payload.dept) }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="displayName" tick={{ fontSize: 8, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={148} />
                  <Tooltip content={<GenderTooltip />} cursor={{ fill: 'rgba(2,64,79,0.06)', cursor: 'pointer' }} />
                  <Bar dataKey="male" name="Male" stackId="g" maxBarSize={14} style={{ cursor: 'pointer' }}>
                    {deptChartData.map(d => (
                      <Cell key={d.dept} fill={selectedBU && selectedBU !== d.dept ? `${MALE_COLOR}44` : MALE_COLOR} />
                    ))}
                  </Bar>
                  <Bar dataKey="female" name="Female" stackId="g" maxBarSize={14} radius={[0, 3, 3, 0]} style={{ cursor: 'pointer' }}>
                    {deptChartData.map(d => (
                      <Cell key={d.dept} fill={selectedBU && selectedBU !== d.dept ? `${FEMALE_COLOR}44` : FEMALE_COLOR} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted text-sm">No data</div>
            )}
          </div>

          {/* Gender breakdown panel — appears when a BU is selected */}
          {selectedBUHR && (
            <div className="bg-white rounded-2xl border-2 border-navy/20 p-5 shadow-card">
              <h4 className="text-[11px] font-extrabold text-navy uppercase tracking-wider mb-3">
                {selectedBUHR.name}
              </h4>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[10px] font-semibold mb-1">
                    <span style={{ color: MALE_COLOR }}>Male</span>
                    <span style={{ color: MALE_COLOR }}>{selectedBUHR.male} · {pct(selectedBUHR.male, selectedBUHR.count)}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: '#E3E9F2' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: pct(selectedBUHR.male, selectedBUHR.count), background: MALE_COLOR }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-semibold mb-1">
                    <span style={{ color: FEMALE_COLOR }}>Female</span>
                    <span style={{ color: FEMALE_COLOR }}>{selectedBUHR.female} · {pct(selectedBUHR.female, selectedBUHR.count)}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: '#E3E9F2' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: pct(selectedBUHR.female, selectedBUHR.count), background: FEMALE_COLOR }} />
                  </div>
                </div>
                <p className="text-[10px] text-muted pt-1 border-t border-border">Total headcount: <strong className="text-navy">{selectedBUHR.count}</strong></p>
              </div>

              {/* Payroll source split for selected BU */}
              {(() => {
                const buData = visibleDrillDown[0]
                if (!buData) return null
                const kifTotal = buData.sections.reduce((s, sec) => s + sec.employees.reduce((ss, e) => ss + (e.kifiya || 0), 0), 0)
                const safTotal = buData.sections.reduce((s, sec) => s + sec.employees.reduce((ss, e) => ss + (e.safee  || 0), 0), 0)
                const buTotal  = kifTotal + safTotal
                if (buTotal === 0) return null
                return (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <p className="text-[10px] font-bold text-navy uppercase tracking-wider">Payroll Source</p>
                    <div className="flex gap-2">
                      {kifTotal > 0 && (
                        <div className="flex-1 rounded-lg p-2 text-center" style={{ background: '#EBF8F6' }}>
                          <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: KIF_COLOR }}>Kifiya</p>
                          <p className="text-sm font-extrabold text-navy tabular-nums">{fmt(kifTotal)}</p>
                          <p className="text-[9px] text-muted">{pct(kifTotal, buTotal)}</p>
                        </div>
                      )}
                      {safTotal > 0 && (
                        <div className="flex-1 rounded-lg p-2 text-center" style={{ background: '#FEF3EA' }}>
                          <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: SAF_COLOR }}>MSP / Programme</p>
                          <p className="text-sm font-extrabold text-navy tabular-nums">{fmt(safTotal)}</p>
                          <p className="text-[9px] text-muted">{pct(safTotal, buTotal)}</p>
                        </div>
                      )}
                    </div>
                    {kifTotal > 0 && safTotal > 0 && (
                      <p className="text-[9px] text-muted text-center">Employees are paid from <strong>both</strong> sources</p>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {/* ── Right: 3-level drill-down table ── */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          {visibleDrillDown.length > 0 ? (
            <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: '#02404F' }}>
                    <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20 min-w-[210px]" style={{ background: '#02404F' }}>
                      Business Unit / Section / Employee
                    </th>
                    {months.map(m => (
                      <th key={m} className="px-3 py-3 font-bold text-white text-right whitespace-nowrap min-w-[72px]">{m}</th>
                    ))}
                    <th className="px-3 py-3 font-bold text-right whitespace-nowrap min-w-[80px]" style={{ color: '#86EFCF' }}>Kifiya</th>
                    <th className="px-3 py-3 font-bold text-right whitespace-nowrap min-w-[80px]" style={{ color: '#FBB97B' }}>MSP / Programme</th>
                    <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[80px] sticky right-0 z-20" style={{ background: '#02404F' }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDrillDown.map((bu, bi) => {
                    // When a BU is selected from the chart we always show its sections; otherwise always expand (no collapse at BU level since we already filter by selectedBU)
                    const isChosen = selectedBU === bu.buCode
                    const buBg     = isChosen ? '#EBF8F6' : bi % 2 === 0 ? '#F9FBFD' : '#fff'
                    const buKifiya = bu.sections.reduce((s, sec) => s + sec.employees.reduce((ss, e) => ss + (e.kifiya || 0), 0), 0)
                    const buSafee  = bu.sections.reduce((s, sec) => s + sec.employees.reduce((ss, e) => ss + (e.safee  || 0), 0), 0)

                    return (
                      <Fragment key={bu.buCode}>
                        {/* Level 1: Business Unit */}
                        <tr className="border-t border-border" style={{ background: buBg }}>
                          <td className="px-4 py-2.5 font-bold text-navy sticky left-0 z-10" style={{ background: buBg }}>
                            <span className="inline-block w-4 text-[9px] font-extrabold" style={{ color: '#EB7D23' }}>▼</span>
                            {bu.buName}
                            <span className="ml-2 text-[9px] font-normal text-muted">({bu.sections.length} section{bu.sections.length !== 1 ? 's' : ''})</span>
                          </td>
                          {months.map(m => (
                            <td key={m} className="px-3 py-2.5 text-right font-semibold text-navy tabular-nums">
                              {bu.monthTotals[m] ? fmt(bu.monthTotals[m]) : <span className="opacity-30">—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: KIF_COLOR }}>
                            {buKifiya > 0 ? fmt(buKifiya) : <span className="opacity-20">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: SAF_COLOR }}>
                            {buSafee > 0 ? fmt(buSafee) : <span className="opacity-20">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-navy sticky right-0 z-10 tabular-nums" style={{ background: buBg }}>
                            {fmt(bu.total)}
                          </td>
                        </tr>

                        {/* Level 2: Sections */}
                        {bu.sections.map(sec => {
                          const secKey    = `${bu.buCode}|${sec.sectionCode}`
                          const secOpen   = !!expandedSec[secKey]
                          const secBg     = secOpen ? '#F0FAF8' : '#F4F6FA'
                          const secKifiya = sec.employees.reduce((s, e) => s + (e.kifiya || 0), 0)
                          const secSafee  = sec.employees.reduce((s, e) => s + (e.safee  || 0), 0)

                          return (
                            <Fragment key={sec.sectionCode}>
                              <tr
                                onClick={() => toggleSec(bu.buCode, sec.sectionCode)}
                                className="cursor-pointer border-t border-border/40 transition-colors"
                                style={{ background: secBg }}
                                onMouseEnter={e => { if (!secOpen) e.currentTarget.style.background = '#E8F5F3' }}
                                onMouseLeave={e => { e.currentTarget.style.background = secBg }}
                              >
                                <td className="pl-8 pr-4 py-2 sticky left-0 z-10" style={{ background: secBg }}>
                                  <span className="inline-block w-4 text-[8px] font-extrabold" style={{ color: '#1FB6A6' }}>
                                    {secOpen ? '▼' : '▶'}
                                  </span>
                                  <span className="font-semibold text-navy">{sec.sectionName}</span>
                                  <span className="ml-1.5 text-[9px] text-muted">({sec.employees.length})</span>
                                </td>
                                {months.map(m => (
                                  <td key={m} className="px-3 py-2 text-right text-muted tabular-nums">
                                    {sec.monthTotals[m] ? fmt(sec.monthTotals[m]) : <span className="opacity-30">—</span>}
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-right tabular-nums" style={{ color: KIF_COLOR }}>
                                  {secKifiya > 0 ? fmt(secKifiya) : <span className="opacity-20">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums" style={{ color: SAF_COLOR }}>
                                  {secSafee > 0 ? fmt(secSafee) : <span className="opacity-20">—</span>}
                                </td>
                                <td className="px-4 py-2 text-right font-semibold text-navy sticky right-0 z-10 tabular-nums" style={{ background: secBg }}>
                                  {fmt(sec.total)}
                                </td>
                              </tr>

                              {/* Level 3: Employees */}
                              {secOpen && sec.employees.map(emp => {
                                const hasBoth = (emp.kifiya || 0) > 0 && (emp.safee || 0) > 0
                                const source  = hasBoth ? 'Both' : (emp.safee || 0) > 0 ? 'MSP / Programme' : 'Kifiya'
                                const srcClr  = source === 'MSP / Programme' ? SAF_COLOR : source === 'Both' ? '#2EBD85' : KIF_COLOR
                                return (
                                  <tr key={emp.employeeNo} className="border-t border-border/20 group" style={{ background: '#FAFFFE' }}>
                                    <td className="pl-14 pr-4 py-1.5 sticky left-0 z-10" style={{ background: '#FAFFFE' }}>
                                      <div className="flex items-center gap-2">
                                        <div className="min-w-0">
                                          <span className="font-medium text-navy block leading-tight">{[emp.employeeNo, emp.name].filter(Boolean).join(' ') || '—'}</span>
                                        </div>
                                        <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                          style={{ background: `${srcClr}18`, color: srcClr }}>
                                          {source}
                                        </span>
                                      </div>
                                    </td>
                                    {months.map(m => (
                                      <td key={m} className="px-3 py-1.5 text-right text-muted tabular-nums">
                                        {emp.monthly[m] ? fmt(emp.monthly[m]) : <span className="opacity-30">—</span>}
                                      </td>
                                    ))}
                                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: KIF_COLOR }}>
                                      {(emp.kifiya || 0) > 0 ? fmtFull(emp.kifiya) : <span className="opacity-20">—</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: SAF_COLOR }}>
                                      {(emp.safee || 0) > 0 ? fmtFull(emp.safee) : <span className="opacity-20">—</span>}
                                    </td>
                                    <td className="px-4 py-1.5 text-right font-bold text-navy sticky right-0 z-10 tabular-nums" style={{ background: '#FAFFFE' }}>
                                      {fmtFull(emp.total)}
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

                  {/* Grand total row */}
                  <tr className="border-t-2 sticky bottom-0 z-10" style={{ background: '#02404F' }}>
                    <td className="px-4 py-3 font-extrabold text-white sticky left-0 z-20" style={{ background: '#02404F' }}>
                      {selectedBU ? selectedBUHR?.name || selectedBU : 'Total'}
                    </td>
                    {months.map(m => {
                      const mTotal = visibleDrillDown.reduce((s, bu) => s + bu.sections.reduce((ss, sec) => ss + sec.employees.reduce((sss, e) => sss + (e.monthly[m] || 0), 0), 0), 0)
                      return (
                        <td key={m} className="px-3 py-3 text-right font-bold text-white tabular-nums">{fmt(mTotal)}</td>
                      )
                    })}
                    <td className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: '#86EFCF' }}>
                      {fmt(visibleDrillDown.reduce((s, bu) => s + bu.sections.reduce((ss, sec) => ss + sec.employees.reduce((sss, e) => sss + (e.kifiya || 0), 0), 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: '#FBB97B' }}>
                      {fmt(visibleDrillDown.reduce((s, bu) => s + bu.sections.reduce((ss, sec) => ss + sec.employees.reduce((sss, e) => sss + (e.safee || 0), 0), 0), 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-white sticky right-0 z-20 tabular-nums" style={{ background: '#02404F' }}>
                      {fmt(grand)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted text-sm">
              {months.length === 0 ? 'No payroll data — refresh the snapshot first' : 'No employees match the current filter'}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
