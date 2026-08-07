import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, Cell
} from 'recharts'
import PeopleOpsFilterBar from '../components/PeopleOpsFilterBar.jsx'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'

// Full-precision formatter for the table (matches Power BI style)
const fmtFull = (n) => {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Compact formatter for chart axis
const fmtM = (n) => {
  if (!n && n !== 0) return '0'
  const v = Math.abs(Number(n))
  if (v >= 1_000_000) return (Number(n) / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return (Number(n) / 1_000).toFixed(0) + 'K'
  return Number(n).toFixed(0)
}

function VarBadge({ variance }) {
  if (Math.abs(variance) < 0.01)
    return <span className="text-[12px]" style={{ color: '#EB7D23' }}>●</span>
  if (variance > 0)
    return <span className="text-[10px]" style={{ color: '#2EBD85' }}>▲</span>
  return <span className="text-[10px]" style={{ color: '#E5544B' }}>▼</span>
}

export default function EmployeeCostVariance({ data }) {
  const ec        = data.employeeCost || {}
  const hr        = data.hr           || {}
  const months    = ec.payrollMonths  || []
  const drillDown = ec.drillDown      || []

  const { filterBU, filterType, filterVC, filterSource } = usePeopleOpsFilters()

  // employeeNo → employeeType enrichment (headcount fallback, already computed by backend)
  const empNoToTypeMap = hr.empNoToType || {}

  // sectionToDept from backend — covers ALL dimension values including payroll-only sections
  const sectionToDept    = hr.sectionToDept    || {}
  const deptDisplayNames = hr.deptDisplayNames || {}
  const resolveBU = (code, fallbackName) => {
    const buCode = sectionToDept[code] || code
    const buName = deptDisplayNames[buCode] || fallbackName || buCode
    return { buCode, buName }
  }

  const rawBU = ec.buDrillDown || []
  const rawDrillDown = rawBU.length > 0
    ? rawBU
    : drillDown.map(d => ({
        buCode: d.dept, buName: d.deptName, total: d.total, monthTotals: d.monthTotals,
        sections: [{ sectionCode: d.dept, sectionName: d.deptName, total: d.total, monthTotals: d.monthTotals, employees: d.employees }]
      }))

  // Re-group by parent BU
  const buDrillDown = (() => {
    if (rawDrillDown.length === 0) return rawDrillDown
    const grouped = {}
    rawDrillDown.forEach(bu => {
      const { buCode, buName } = resolveBU(bu.buCode, bu.buName)
      if (!grouped[buCode]) grouped[buCode] = { buCode, buName, sections: [], monthTotals: {}, total: 0 }
      const g = grouped[buCode]
      bu.sections.forEach(sec => g.sections.push(sec))
      Object.entries(bu.monthTotals || {}).forEach(([m, v]) => { g.monthTotals[m] = (g.monthTotals[m] || 0) + v })
      g.total += bu.total
    })
    return Object.values(grouped).sort((a, b) => b.total - a.total)
  })()

  // Two freely-selectable months for comparison
  const [monthB, setMonthB] = useState(() => months[months.length - 1] || '')
  const [monthA, setMonthA] = useState(() => months.length >= 2 ? months[months.length - 2] : months[0] || '')

  const selectedMonth = monthB
  const prevMonth     = monthA

  // Build per-employee rows + BU-level variance aggregation
  const empRows    = []
  const buVarMap   = {}

  if (buDrillDown.length > 0) {
    // 3-level source: BU → sections → employees. An employee can appear more
    // than once — multiple sections within one BU, or even different BUs
    // entirely (e.g. a regular payroll record in their home department plus a
    // separate Consultant payroll record elsewhere). buVarMap stays per-BU
    // (each BU's own variance rollup should include everyone who cost that BU
    // money), but empRows is a single flat table across all BUs, so it needs a
    // BU-independent merge or the same employeeNo collides on key there.
    const byEmpGlobal = {}
    buDrillDown.forEach(bu => {
      const parentBU = sectionToDept[bu.buCode] || bu.buCode
      if (filterBU !== 'All' && parentBU !== filterBU) return
      const byEmp = {}
      bu.sections.forEach(sec => {
        sec.employees.forEach(emp => {
          const effectiveType = emp.employeeType || empNoToTypeMap[emp.employeeNo] || ''
          if (filterType   !== 'All' && effectiveType !== filterType) return
          if (filterVC     !== 'All' && emp.vc        !== filterVC)   return
          if (filterSource === 'KIFIYA' && !(emp.kifiya  > 0))           return
          if (filterSource === 'SAFEE'  && !(emp.safee   > 0))           return
          const prevCost = (monthA ? (emp.monthly[monthA] || 0) : 0) + (monthA ? (emp.pensionMonthly?.[monthA] || 0) : 0)
          const currCost = (emp.monthly[monthB] || 0) + (emp.pensionMonthly?.[monthB] || 0)
          if (prevCost === 0 && currCost === 0) return
          const key = emp.employeeNo || emp.name
          if (!byEmp[key]) byEmp[key] = { key, label: `${emp.employeeNo} ${emp.name}`.trim(), prevCost: 0, currCost: 0 }
          byEmp[key].prevCost += prevCost
          byEmp[key].currCost += currCost
        })
      })
      Object.values(byEmp).forEach(row => {
        const variance = row.currCost - row.prevCost
        if (!buVarMap[bu.buCode]) buVarMap[bu.buCode] = { name: bu.buName, variance: 0 }
        buVarMap[bu.buCode].variance += variance

        if (!byEmpGlobal[row.key]) byEmpGlobal[row.key] = { key: row.key, label: row.label, prevCost: 0, currCost: 0 }
        byEmpGlobal[row.key].prevCost += row.prevCost
        byEmpGlobal[row.key].currCost += row.currCost
      })
    })
    Object.values(byEmpGlobal).forEach(row => {
      const variance = row.currCost - row.prevCost
      const pct      = row.prevCost !== 0 ? (variance / row.prevCost) * 100 : (row.currCost !== 0 ? 100 : 0)
      empRows.push({ ...row, variance, pct })
    })
  } else {
    // Fallback to 2-level drillDown (section → employees)
    drillDown.forEach(dept => {
      dept.employees.forEach(emp => {
        const prevCost = monthA ? (emp.monthly[monthA] || 0) : 0
        const currCost = emp.monthly[monthB] || 0
        if (prevCost === 0 && currCost === 0) return
        const variance = currCost - prevCost
        const pct = prevCost !== 0 ? (variance / prevCost) * 100 : (currCost !== 0 ? 100 : 0)
        empRows.push({ key: emp.employeeNo, label: `${emp.employeeNo} ${emp.name}`.trim(), prevCost, currCost, variance, pct })
        if (!buVarMap[dept.dept]) buVarMap[dept.dept] = { name: dept.deptName, variance: 0 }
        buVarMap[dept.dept].variance += variance
      })
    })
  }

  const deptVarArr = Object.values(buVarMap)
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, 18)
    .map(d => ({ ...d, displayName: d.name.length > 24 ? d.name.slice(0, 23) + '…' : d.name }))

  empRows.sort((a, b) => a.key.localeCompare(b.key))

  const totalPrev = empRows.reduce((s, e) => s + e.prevCost, 0)
  const totalCurr = empRows.reduce((s, e) => s + e.currCost, 0)
  const totalVar  = totalCurr - totalPrev
  const totalPct  = totalPrev !== 0 ? (totalVar / totalPrev) * 100 : 0

  const varColor = (v) => v > 0.01 ? '#2EBD85' : v < -0.01 ? '#E5544B' : '#EB7D23'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Month to Month Employee Cost Comparison</h2>
        {monthA && monthB
          ? <p className="text-xs text-muted font-medium">Comparing <span className="font-bold text-navy">{monthA}</span> vs <span className="font-bold text-navy">{monthB}</span> — select any two months to compare</p>
          : <p className="text-xs text-muted font-medium">Select two months below to compare payroll costs</p>
        }
      </div>

      <PeopleOpsFilterBar data={data} />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* ── Left panel ── */}
        <div className="xl:col-span-1 space-y-4">

          {/* Period filter — two freely selectable months */}
          <div className="bg-white rounded-2xl border border-border p-4 shadow-card space-y-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted">Compare Months</p>

            <div>
              <p className="text-[10px] text-muted mb-1 font-semibold">From Month</p>
              <select
                value={monthA}
                onChange={e => setMonthA(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm font-semibold bg-white focus:outline-none"
                style={{ color: '#02404F' }}
              >
                {months.slice().reverse().map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 border-t border-border" />
              <span className="text-[10px] text-muted font-bold">vs</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <div>
              <p className="text-[10px] text-muted mb-1 font-semibold">To Month</p>
              <select
                value={monthB}
                onChange={e => setMonthB(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm font-semibold bg-white focus:outline-none"
                style={{ color: '#02404F' }}
              >
                {months.slice().reverse().map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {monthA === monthB
              ? <p className="text-[10px] text-amber-600 font-semibold mt-1">⚠ Same month selected — variance will be zero</p>
              : <p className="text-[10px] text-muted mt-1">Variance = <b>{monthB}</b> minus <b>{monthA}</b></p>
            }
          </div>

          {/* Variance by BU */}
          <div className="bg-white rounded-2xl border border-border p-4 shadow-card">
            <h3 className="text-sm font-bold text-navy mb-3">Variance By BU</h3>
            {deptVarArr.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={Math.max(200, deptVarArr.length * 36)}>
                  <BarChart data={deptVarArr} layout="vertical" margin={{ top: 0, right: 38, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={fmtM}
                      tick={{ fontSize: 9, fill: '#6B7C93' }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="displayName"
                      tick={{ fontSize: 8, fill: '#6B7C93' }}
                      axisLine={false} tickLine={false}
                      width={148}
                    />
                    <Tooltip
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.name || label}
                      formatter={(v) => [fmtFull(v) + ' ETB', 'Variance']}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }}
                    />
                    <Bar dataKey="variance" radius={[0, 3, 3, 0]} maxBarSize={12}>
                      {deptVarArr.map((d, i) => (
                        <Cell key={i} fill={d.variance >= 0 ? '#EB7D23' : '#E5544B'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[9px] text-muted text-center mt-1">Cost Variance — Month</p>
              </>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted text-xs">No data</div>
            )}
          </div>
        </div>

        {/* ── Right: comparison table ── */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          {empRows.length > 0 ? (
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: '#02404F' }}>
                    <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20 min-w-[220px]"
                        style={{ background: '#02404F' }}>
                      Employees
                    </th>
                    <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[120px]">
                      From ({monthA || '—'})
                    </th>
                    <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[120px]">
                      To ({monthB || '—'})
                    </th>
                    <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[100px]">
                      Variance
                    </th>
                    <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[100px]">
                      % Variance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {empRows.map((emp, i) => (
                    <tr
                      key={emp.key}
                      className="border-t border-border"
                      style={{ background: i % 2 === 0 ? '#fff' : '#F9FBFD' }}
                    >
                      <td className="px-4 py-2 font-medium text-navy sticky left-0 z-10"
                          style={{ background: i % 2 === 0 ? '#fff' : '#F9FBFD' }}>
                        {emp.label}
                      </td>
                      <td className="px-4 py-2 text-right text-muted tabular-nums">
                        {fmtFull(emp.prevCost)}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-navy tabular-nums">
                        {fmtFull(emp.currCost)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold"
                          style={{ color: varColor(emp.variance) }}>
                        {fmtFull(emp.variance)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1">
                          <VarBadge variance={emp.variance} />
                          <span className="font-semibold" style={{ color: varColor(emp.variance) }}>
                            {Math.abs(emp.pct).toFixed(2)}%
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Grand total row */}
                  <tr className="border-t-2 sticky bottom-0 z-10" style={{ background: '#02404F' }}>
                    <td className="px-4 py-3 font-extrabold text-white sticky left-0 z-20"
                        style={{ background: '#02404F' }}>
                      Total
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-white tabular-nums">{fmtFull(totalPrev)}</td>
                    <td className="px-4 py-3 text-right font-bold text-white tabular-nums">{fmtFull(totalCurr)}</td>
                    <td className="px-4 py-3 text-right font-bold text-white tabular-nums"
                        style={{ color: totalVar >= 0 ? '#2EBD85' : '#E5544B' }}>
                      {fmtFull(totalVar)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-white tabular-nums">
                      <span className="inline-flex items-center justify-end gap-1">
                        <VarBadge variance={totalVar} />
                        <span>{Math.abs(totalPct).toFixed(2)}%</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted text-sm">
              {months.length === 0 ? 'No payroll data — refresh the snapshot first' : 'No data for selected month'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
