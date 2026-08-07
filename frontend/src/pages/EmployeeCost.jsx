import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, Legend, LineChart, Line
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'
import PeopleOpsFilterBar from '../components/PeopleOpsFilterBar.jsx'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'

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

  const { filterBU, filterType, filterVC, filterSource, filterMonth } = usePeopleOpsFilters()

  // employeeNo → employeeType enrichment (headcount fallback, already computed by backend)
  const empNoToTypeMap = hr.empNoToType || {}

  // sectionToDept from backend (covers ALL dimension values, including payroll-only sections)
  const sectionToDept    = hr.sectionToDept    || {}
  const deptDisplayNames = hr.deptDisplayNames || {}

  const resolveBU = (code) => {
    const parent = sectionToDept[code] || code
    const name   = deptDisplayNames[parent] || dims[parent] || dims[code] || parent
    return { dept: parent, name }
  }

  // Build all cost aggregations from buDrillDown — always pension-inclusive and
  // filter-aware. When filters are active, only matching employees are counted;
  // when no filters, results match the snapshot (plus pension from buDrillDown).
  const vcMap = {}, deptMap = {}, mthMap = {}
  ;(ec.buDrillDown || []).forEach(bu => {
    const parentBU = sectionToDept[bu.buCode] || bu.buCode
    const buName   = deptDisplayNames[parentBU] || dims[parentBU] || parentBU
    if (filterBU !== 'All' && parentBU !== filterBU) return
    ;(bu.sections || []).forEach(sec => {
      ;(sec.employees || []).forEach(emp => {
        const effectiveType = emp.employeeType || empNoToTypeMap[emp.employeeNo] || ''
        if (filterType !== 'All' && effectiveType !== filterType) return
        if (filterVC   !== 'All' && emp.vc        !== filterVC)   return
        if (filterSource === 'KIFIYA' && !(emp.kifiya > 0)) return
        if (filterSource === 'SAFEE'  && !(emp.safee  > 0)) return

        const vc      = emp.vc || 'Unknown'
        const pension = emp.pension || 0
        const gross   = (emp.kifiya || 0) + (emp.safee || 0)
        const kPen    = gross > 0 ? pension * (emp.kifiya || 0) / gross : pension
        const sPen    = gross > 0 ? pension * (emp.safee  || 0) / gross : 0

        // When a specific month is selected, use only that month's cost; otherwise use YTD total
        const empCost   = filterMonth === 'All'
          ? (emp.total || 0) + pension
          : (emp.monthly?.[filterMonth] || 0) + (emp.pensionMonthly?.[filterMonth] || 0)
        const empKifiya = filterMonth === 'All'
          ? (emp.kifiya || 0) + kPen
          : (emp.monthly?.[filterMonth] || 0) * ((emp.kifiya || 0) / Math.max(gross, 1)) + (emp.pensionMonthly?.[filterMonth] || 0) * ((emp.kifiya || 0) / Math.max(gross, 1))
        const empSafee  = filterMonth === 'All'
          ? (emp.safee  || 0) + sPen
          : (emp.monthly?.[filterMonth] || 0) * ((emp.safee  || 0) / Math.max(gross, 1)) + (emp.pensionMonthly?.[filterMonth] || 0) * ((emp.safee  || 0) / Math.max(gross, 1))

        vcMap[vc] = (vcMap[vc] || 0) + empCost

        if (!deptMap[parentBU]) deptMap[parentBU] = { name: buName, kifiya: 0, safee: 0 }
        deptMap[parentBU].kifiya += empKifiya
        deptMap[parentBU].safee  += empSafee

        Object.entries(emp.monthly || {}).forEach(([m, v]) => { mthMap[m] = (mthMap[m] || 0) + v })
        Object.entries(emp.pensionMonthly || {}).forEach(([m, v]) => { mthMap[m] = (mthMap[m] || 0) + v })
      })
    })
  })

  const vcData  = Object.entries(vcMap).map(([virtualCompany, total]) => ({ virtualCompany, total: Math.round(total) })).sort((a, b) => b.total - a.total)
  const deptData = Object.entries(deptMap).map(([dept, d]) => ({ dept, name: d.name, kifiya: Math.round(d.kifiya), safee: Math.round(d.safee) })).sort((a, b) => (b.kifiya + b.safee) - (a.kifiya + a.safee))
  const monthly  = (ec.payrollMonths || []).map(m => ({ label: m, total: Math.round(mthMap[m] || 0) }))

  const totalCost = vcData.reduce((s, d) => s + (d.total || 0), 0)
  const eth = vcData.find(d => d.virtualCompany === 'ETH')?.total || 0
  const hub = vcData.find(d => d.virtualCompany === 'HUB')?.total || 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Employee Cost</h2>
        <p className="text-xs text-muted font-medium">Payroll cost by business unit and virtual company — FY to date</p>
      </div>

      <PeopleOpsFilterBar data={data} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Total Payroll Cost" value={fmtETBRaw(totalCost)} sub="Kifiya + MSP / Programme" />
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
                <Bar dataKey="safee"  name="MSP / Programme"  fill={SAFEE_COLOR}  radius={[0, 3, 3, 0]} maxBarSize={14} />
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
