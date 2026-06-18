import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import { fmtNum, fmtPct } from '../lib/fmt.js'

const COLORS = ['#02404F', '#1FB6A6', '#EB7D23', '#2EBD85', '#3A4656', '#E5544B']

export default function HR({ data }) {
  const hr   = data.hr || {}
  const dims = data.dimensionNames || {}

  const genderData = hr.byGender || []
  const typeData   = hr.byType   || []
  const deptData   = (hr.byDept  || []).map(d => ({
    ...d,
    name: dims[d.dept] || d.dept || 'Unknown'
  }))

  const male   = genderData.find(g => g.gender === 'Male')?.count   || 0
  const female = genderData.find(g => g.gender === 'Female')?.count || 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">People & HR</h2>
        <p className="text-xs text-muted font-medium">Workforce composition and headcount breakdown</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Employees" value={fmtNum(hr.total)} sub="Active workforce" />
        <KpiCard label="Male" value={fmtNum(male)} sub={hr.total ? fmtPct((male / hr.total) * 100) + ' of workforce' : 'employees'} />
        <KpiCard label="Female" value={fmtNum(female)} sub={hr.total ? fmtPct((female / hr.total) * 100) + ' of workforce' : 'employees'} />
        <KpiCard label="Employment Types" value={fmtNum(typeData.length)} sub="distinct categories" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Employment type */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">By Employment Type</h3>
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={typeData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm">No data</div>
          )}
        </div>

        {/* Gender donut */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Gender Breakdown</h3>
          {genderData.length > 0 ? (
            <div className="flex items-center justify-center gap-6">
              <PieChart width={170} height={170}>
                <Pie
                  data={genderData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={76}
                  dataKey="count"
                  nameKey="gender"
                  paddingAngle={3}
                >
                  {genderData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              </PieChart>
              <div className="space-y-2.5">
                {genderData.map((g, i) => (
                  <div key={g.gender} className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-xs font-bold text-navy">{g.gender}</span>
                    <span className="text-xs text-muted font-medium">
                      {fmtNum(g.count)} ({hr.total ? fmtPct((g.count / hr.total) * 100) : '—'})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[170px] flex items-center justify-center text-muted text-sm">No data</div>
          )}
        </div>
      </div>

      {/* Headcount by department */}
      {deptData.length > 0 && deptData.some(d => d.name !== 'Unknown') ? (
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <h3 className="text-sm font-bold text-navy mb-4">Headcount by Department</h3>
          <ResponsiveContainer width="100%" height={Math.max(220, deptData.length * 32)}>
            <BarChart data={deptData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F2" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6B7C93' }} axisLine={false} tickLine={false} width={130} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E3E9F2' }} />
              <Bar dataKey="count" name="Employees" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  )
}
