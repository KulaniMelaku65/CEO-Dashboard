import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, Legend, LineChart, Line
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'

const KIFIYA_COLOR = '#02404F'
const SAFEE_COLOR  = '#1FB6A6'

const fmtETBRaw = (n) => {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return (v / 1_000).toFixed(1) + 'K'
  return v.toLocaleString()
}

export default function EmployeeCost({ data }) {
  const ec   = data.employeeCost || {}
  const hr   = data.hr           || {}
  const dims = data.dimensionNames || {}

  const vcData  = ec.byVirtualCompany || []
  const monthly = ec.monthly          || []

  // sectionToDept from backend (covers ALL dimension values, including payroll-only sections)
  const sectionToDept    = hr.sectionToDept    || {}
  const deptDisplayNames = hr.deptDisplayNames || {}

  const resolveBU = (code) => {
    const parent = sectionToDept[code] || code
    const name   = deptDisplayNames[parent] || dims[parent] || dims[code] || parent
    return { dept: parent, name }
  }

  // Re-aggregate byDeptAndSource by parent BU so chart shows departments not sections
  const rawDeptData = ec.byDeptAndSource || []
  const deptData = (() => {
    const grouped = {}
    rawDeptData.forEach(d => {
      const { dept, name } = resolveBU(d.dept)
      if (!grouped[dept]) grouped[dept] = { dept, name, kifiya: 0, safee: 0 }
      grouped[dept].kifiya += d.kifiya || 0
      grouped[dept].safee  += d.safee  || 0
    })
    return Object.values(grouped).sort((a, b) => (b.kifiya + b.safee) - (a.kifiya + a.safee))
  })()

  const totalCost = vcData.reduce((s, d) => s + (d.total || 0), 0)
  const eth = vcData.find(d => d.virtualCompany === 'ETH')?.total || 0
  const hub = vcData.find(d => d.virtualCompany === 'HUB')?.total || 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Employee Cost</h2>
        <p className="text-xs text-muted font-medium">Payroll cost by business unit and virtual company — FY to date</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Total Payroll Cost" value={fmtETBRaw(totalCost)} sub="KIFIYA + SAFEE combined" />
        <KpiCard label="ETH Payroll Cost"   value={fmtETBRaw(eth)}       sub="Virtual Company: ETH" />
        <KpiCard label="HUB Payroll Cost"   value={fmtETBRaw(hub)}       sub="Virtual Company: HUB" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Clustered bar: KIFIYA vs SAFEE by dept */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Employee Cost by Business Unit</h3>
          {deptData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(260, deptData.length * 44)}>
              <BarChart data={deptData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={fmtETBRaw}
                  tick={{ fontSize: 10, fill: '#6B7C93' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#6B7C93' }}
                  axisLine={false}
                  tickLine={false}
                  width={160}
                />
                <Tooltip
                  formatter={(v, name) => [fmtETBRaw(v) + ' ETB', name]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="kifiya" name="KIFIYA" fill={KIFIYA_COLOR} radius={[0, 3, 3, 0]} maxBarSize={14} />
                <Bar dataKey="safee"  name="SAFEE"  fill={SAFEE_COLOR}  radius={[0, 3, 3, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">No payroll data</div>
          )}
        </div>

        {/* Monthly trend line */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Employee Cost Monthly Trend</h3>
          {monthly.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthly} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#6B7C93' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={fmtETBRaw}
                  tick={{ fontSize: 10, fill: '#6B7C93' }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  formatter={(v) => [fmtETBRaw(v) + ' ETB', 'Total Cost']}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total Cost"
                  stroke={KIFIYA_COLOR}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: KIFIYA_COLOR }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">No payroll data</div>
          )}
        </div>
      </div>
    </div>
  )
}
