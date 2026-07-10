import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, Cell
} from 'recharts'

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
  const months    = ec.payrollMonths  || []
  const drillDown = ec.drillDown      || []

  // Default to most recent month
  const [selectedMonth, setSelectedMonth] = useState(() => months[months.length - 1] || '')

  const selectedIdx = months.indexOf(selectedMonth)
  const prevMonth   = selectedIdx > 0 ? months[selectedIdx - 1] : null

  // Build per-employee comparison rows + dept variance aggregation
  const empRows   = []
  const deptVarMap = {}

  drillDown.forEach(dept => {
    dept.employees.forEach(emp => {
      const prevCost = prevMonth ? (emp.monthly[prevMonth] || 0) : 0
      const currCost = emp.monthly[selectedMonth] || 0
      if (prevCost === 0 && currCost === 0) return

      const variance = currCost - prevCost
      const pct      = prevCost !== 0
        ? (variance / prevCost) * 100
        : (currCost !== 0 ? 100 : 0)

      empRows.push({
        key:      emp.employeeNo,
        label:    `${emp.employeeNo} ${emp.name}`.trim(),
        prevCost, currCost, variance, pct
      })

      if (!deptVarMap[dept.dept]) deptVarMap[dept.dept] = { name: dept.deptName, variance: 0 }
      deptVarMap[dept.dept].variance += variance
    })
  })

  const deptVarArr = Object.values(deptVarMap)
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
        <p className="text-xs text-muted font-medium">Compare each employee's payroll cost against the previous month</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* ── Left panel ── */}
        <div className="xl:col-span-1 space-y-4">

          {/* Period filter */}
          <div className="bg-white rounded-2xl border border-border p-4 shadow-card">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted mb-2">Period Filter</p>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm font-semibold text-navy bg-white focus:outline-none"
              style={{ color: '#02404F' }}
            >
              {months.slice().reverse().map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {prevMonth
              ? <p className="text-[10px] text-muted mt-2">Comparing <b>{selectedMonth}</b> vs <b>{prevMonth}</b></p>
              : <p className="text-[10px] text-muted mt-2">No previous month available</p>
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
                      {prevMonth ? `Previous M. (${prevMonth})` : 'Previous M.'}
                    </th>
                    <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[120px]">
                      Current M. ({selectedMonth})
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
