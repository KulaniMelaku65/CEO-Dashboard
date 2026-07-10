import { useState, Fragment } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import KpiCard from '../components/KpiCard.jsx'

const COLORS = ['#02404F', '#1FB6A6', '#EB7D23', '#2EBD85', '#3A4656', '#E5544B']

const fmt = (n) => {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return (v / 1_000).toFixed(1) + 'K'
  return v.toLocaleString()
}

export default function EmployeeCostDetail({ data }) {
  const ec   = data.employeeCost || {}
  const hr   = data.hr || {}
  const dims = data.dimensionNames || {}

  const vcData    = ec.byVirtualCompany || []
  const drillDown = ec.drillDown        || []
  const months    = ec.payrollMonths    || []
  const deptData  = (hr.byDept || []).slice(0, 16).map(d => {
    const fullName = dims[d.dept] || d.dept || 'Unknown'
    return {
      ...d,
      name: fullName,
      displayName: fullName.length > 24 ? fullName.slice(0, 23) + '…' : fullName
    }
  })

  const [expanded, setExpanded] = useState({})
  const toggle = (dept) => setExpanded(p => ({ ...p, [dept]: !p[dept] }))

  const eth   = vcData.find(d => d.virtualCompany === 'ETH')?.total || 0
  const hub   = vcData.find(d => d.virtualCompany === 'HUB')?.total || 0
  const grand = drillDown.reduce((s, d) => s + d.total, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Employee Cost by BU</h2>
        <p className="text-xs text-muted font-medium">Click a department row to expand individual employee costs by month</p>
      </div>

      {/* Virtual Company KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Ethiopia" value={fmt(eth)} sub="Virtual Company: ETH" />
        <KpiCard label="HUB"      value={fmt(hub)} sub="Virtual Company: HUB" />
        <KpiCard label="Total"    value={fmt(grand)} sub="KIFIYA + SAFEE combined" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* Employees per dept bar chart */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card xl:col-span-1">
          <h3 className="text-sm font-bold text-navy mb-4">Employees Per Dept</h3>
          {deptData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, deptData.length * 36)}>
              <BarChart data={deptData} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="displayName" tick={{ fontSize: 8, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={148} />
                <Tooltip
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.name || label}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }}
                />
                <Bar dataKey="count" name="Employees" radius={[0, 3, 3, 0]} maxBarSize={12}>
                  {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm">No data</div>
          )}
        </div>

        {/* Drill-down table */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          {drillDown.length > 0 ? (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: '#02404F' }}>
                    <th className="text-left px-4 py-3 font-bold text-white sticky left-0 z-20 min-w-[180px]" style={{ background: '#02404F' }}>
                      Department / Employee
                    </th>
                    {months.map(m => (
                      <th key={m} className="px-3 py-3 font-bold text-white text-right whitespace-nowrap min-w-[72px]">{m}</th>
                    ))}
                    <th className="px-4 py-3 font-bold text-white text-right whitespace-nowrap min-w-[80px] sticky right-0 z-20" style={{ background: '#02404F' }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drillDown.map((dept, di) => (
                    <Fragment key={dept.dept}>
                      {/* Department row — clickable */}
                      <tr
                        onClick={() => toggle(dept.dept)}
                        className="cursor-pointer border-t border-border transition-colors"
                        style={{ background: expanded[dept.dept] ? '#EBF8F6' : di % 2 === 0 ? '#F9FBFD' : '#fff' }}
                        onMouseEnter={e => { if (!expanded[dept.dept]) e.currentTarget.style.background = '#F0F8FF' }}
                        onMouseLeave={e => { e.currentTarget.style.background = expanded[dept.dept] ? '#EBF8F6' : di % 2 === 0 ? '#F9FBFD' : '#fff' }}
                      >
                        <td
                          className="px-4 py-2.5 font-bold text-navy sticky left-0 z-10"
                          style={{ background: expanded[dept.dept] ? '#EBF8F6' : di % 2 === 0 ? '#F9FBFD' : '#fff' }}
                        >
                          <span className="inline-block w-4 text-[9px] font-extrabold" style={{ color: '#EB7D23' }}>
                            {expanded[dept.dept] ? '▼' : '▶'}
                          </span>
                          {dept.deptName}
                        </td>
                        {months.map(m => (
                          <td key={m} className="px-3 py-2.5 text-right font-semibold text-navy tabular-nums">
                            {dept.monthTotals[m] ? fmt(dept.monthTotals[m]) : <span className="text-muted/40">—</span>}
                          </td>
                        ))}
                        <td
                          className="px-4 py-2.5 text-right font-bold text-navy sticky right-0 z-10 tabular-nums"
                          style={{ background: expanded[dept.dept] ? '#EBF8F6' : di % 2 === 0 ? '#F9FBFD' : '#fff' }}
                        >
                          {fmt(dept.total)}
                        </td>
                      </tr>

                      {/* Employee rows — shown when expanded */}
                      {expanded[dept.dept] && dept.employees.map(emp => (
                        <tr key={emp.employeeNo} className="border-t border-border/30" style={{ background: '#F4FCFB' }}>
                          <td className="pl-10 pr-4 py-2 text-muted sticky left-0 z-10" style={{ background: '#F4FCFB' }}>
                            {emp.name || emp.employeeNo}
                          </td>
                          {months.map(m => (
                            <td key={m} className="px-3 py-2 text-right text-muted tabular-nums">
                              {emp.monthly[m] ? fmt(emp.monthly[m]) : <span className="opacity-30">—</span>}
                            </td>
                          ))}
                          <td className="px-4 py-2 text-right font-semibold text-navy sticky right-0 z-10 tabular-nums" style={{ background: '#F4FCFB' }}>
                            {fmt(emp.total)}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}

                  {/* Grand total row */}
                  <tr className="border-t-2 sticky bottom-0 z-10" style={{ background: '#02404F' }}>
                    <td className="px-4 py-3 font-extrabold text-white sticky left-0 z-20" style={{ background: '#02404F' }}>
                      Total
                    </td>
                    {months.map(m => {
                      const mTotal = drillDown.reduce((s, d) => s + (d.monthTotals[m] || 0), 0)
                      return (
                        <td key={m} className="px-3 py-3 text-right font-bold text-white tabular-nums">
                          {fmt(mTotal)}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-right font-extrabold text-white sticky right-0 z-20 tabular-nums" style={{ background: '#02404F' }}>
                      {fmt(grand)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted text-sm">No payroll data</div>
          )}
        </div>

      </div>
    </div>
  )
}
