import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts'
import PeopleOpsFilterBar from '../components/PeopleOpsFilterBar.jsx'
import ExportButton from '../components/ExportButton.jsx'
import { usePeopleOpsFilters } from '../context/PeopleOpsFilters.jsx'
import { buildEmployeeExportRows, buildExportMeta, EMPLOYEE_EXPORT_COLUMNS } from '../lib/csvExport.js'

const BG      = '#052C36'
const PANEL   = '#0A3A46'
const ORANGE  = '#EB7D23'
const TEAL    = '#1FB6A6'
const LINE    = 'rgba(255,255,255,0.10)'
const AXIS    = 'rgba(255,255,255,0.55)'

const fmtN = (n) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US')
const fmtC = (n) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct1 = (n) => (n == null || isNaN(n)) ? '—' : `${n.toFixed(0)}%`

function Cell1({ label, value, valueSize = 34, sub, icon, children }) {
  return (
    <div className="flex flex-col p-4" style={{ background: PANEL }}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: ORANGE }}>{label}</p>
        {icon}
      </div>
      {value !== undefined && (
        <p className="font-extrabold text-white leading-none mt-2" style={{ fontSize: valueSize }}>{value}</p>
      )}
      {sub && <p className="text-[10px] font-semibold mt-1" style={{ color: AXIS }}>{sub}</p>}
      {children}
    </div>
  )
}

const PeopleIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="1.6">
    <circle cx="9" cy="7" r="3.2" /><circle cx="16" cy="8" r="2.6" />
    <path d="M2 21v-1.5C2 16.5 5 15 9 15s7 1.5 7 4.5V21" />
    <path d="M15.5 15.3c2.6.3 4.5 1.7 4.5 4.2V21" />
  </svg>
)

export default function PeopleHRSummary({ data }) {
  const hr  = data.hr        || {}
  const rev = data.hrReview  || {}

  const { filterBU, filterType, filterVC, filterSource, filterMonth, filterYear } = usePeopleOpsFilters()

  const [locationView, setLocationView] = useState('city') // 'city' | 'country'

  const sectionToDept    = hr.sectionToDept    || {}
  const deptDisplayNames = hr.deptDisplayNames || {}

  // ── CTC / payroll — moved up so sourceEmpNoSet (below) can use it. Cost genuinely
  // paid this month (active + inactive who were paid), same definition as "Monthly
  // Cost by Business Unit" on HR Analysis ─────────────────────────────────────────
  const payrollMonths    = rev.payrollMonths || []
  // stdPayrollMonths excludes consultant-only periods — defaulting off the full
  // payrollMonths list can land on a month where only a stray IC voucher exists,
  // making CTC look like a tiny fraction of the real figure (e.g. the in-progress
  // current month before standard payroll has run for it yet).
  const stdPayrollMonths = rev.stdPayrollMonths || payrollMonths
  const effectiveMonth = filterMonth !== 'All'
    ? filterMonth
    : stdPayrollMonths[stdPayrollMonths.length - 1] || payrollMonths[payrollMonths.length - 1] || ''
  const employeePayroll = rev.employeePayroll || []

  const filteredPayroll = employeePayroll.filter(r => {
    const parentBU = sectionToDept[r.buCode] || r.buCode
    return (filterBU     === 'All' || r.buCode === filterBU || parentBU === filterBU) &&
           (filterType   === 'All' || r.employeeType   === filterType) &&
           (filterVC     === 'All' || r.virtualCompany === filterVC) &&
           (filterSource === 'All' || r.payrollSource  === filterSource)
  })

  // Which employees are actually funded by the selected Budget Source this month —
  // used to scope headcount-side figures (Employees Number, Male/Female, Employment
  // Type, Business Unit, Based In, HQ/Field) to the same source, not just CTC.
  const sourceEmpNoSet = filterSource !== 'All'
    ? new Set(
        filteredPayroll
          .filter(r => ((r.monthTotals[effectiveMonth] || 0) + (r.pensionMonthTotals?.[effectiveMonth] || 0)) !== 0)
          .map(r => r.employeeNo)
      )
    : null

  // ── Headcount (active only), BU/Type/VC/Source-filterable, from the live dept
  // hierarchy. This is a "now" snapshot only — a month/year selection needs the
  // separate month-by-month reconstruction in hr.headcountEvolution instead (below),
  // same approach as the People & Operations and HR Analysis pages. Budget Source has
  // no historical reconstruction at all (headcountEvolution doesn't track payroll
  // source per month), so a Source filter always uses this live path, never monthEvo.
  const activeEmployees = (() => {
    const result = []
    ;(hr.byDeptHierarchy || []).forEach(dept => {
      const parentBU = sectionToDept[dept.deptCode] || dept.deptCode
      if (filterBU !== 'All' && parentBU !== filterBU) return
      ;(dept.sections || []).forEach(sec => {
        ;(sec.employees || []).forEach(emp => {
          if (filterType !== 'All' && (emp.employeeType   || 'Unknown') !== filterType) return
          if (filterVC   !== 'All' && (emp.virtualCompany || 'Unknown') !== filterVC)   return
          if (sourceEmpNoSet && !sourceEmpNoSet.has(emp.employeeNo)) return
          result.push({ ...emp, buCode: parentBU, buName: dept.deptName })
        })
      })
    })
    return result
  })()

  // Point-in-time reconstruction for the selected month/year — byBU has its own
  // male/female/count/byType breakdown for that same point in time.
  const hcEvoLabels = hr.headcountEvolution || []
  const yearOnly = filterMonth === 'All' && filterYear !== 'All'
  const headcountMonthLabel = filterMonth !== 'All'
    ? filterMonth
    : (yearOnly ? [...hcEvoLabels].reverse().find(m => m.label.endsWith(' ' + filterYear))?.label || null : null)
  const monthEvo = headcountMonthLabel ? hcEvoLabels.find(m => m.label === headcountMonthLabel) : null
  // byBU has no further type/VC/source split, so only trust it when those filters
  // aren't also narrowing things (a BU filter alone is fine — byBU is already per-BU).
  const monthEvoTrusted = monthEvo && filterType === 'All' && filterVC === 'All' && filterSource === 'All'
  const monthEvoScope = monthEvoTrusted
    ? (filterBU === 'All' ? monthEvo : monthEvo.byBU?.[filterBU] || null)
    : null

  const totalEmployees = monthEvoScope ? monthEvoScope.count : activeEmployees.length
  const maleCount   = monthEvoScope ? (monthEvoScope.male   || 0) : activeEmployees.filter(e => e.gender === 'Male').length
  const femaleCount = monthEvoScope ? (monthEvoScope.female || 0) : activeEmployees.filter(e => e.gender === 'Female').length
  const malePct   = totalEmployees ? Math.round((maleCount   / totalEmployees) * 100) : 0
  const femalePct = totalEmployees ? Math.round((femaleCount / totalEmployees) * 100) : 0

  // "Individual Consultant" reads as "Consultant" here to match HR terminology
  const employmentTypeRows = monthEvoScope
    ? Object.entries(monthEvoScope.byType || {})
        .map(([type, v]) => ({ type: type === 'Individual Consultant' ? 'Consultant' : type, count: (v.male || 0) + (v.female || 0) }))
        .filter(t => t.count > 0)
        .sort((a, b) => b.count - a.count)
    : (() => {
        const typeCounts = {}
        activeEmployees.forEach(e => {
          const t = e.employeeType && e.employeeType !== 'Unknown' ? e.employeeType : null
          if (!t) return
          typeCounts[t] = (typeCounts[t] || 0) + 1
        })
        return Object.entries(typeCounts)
          .map(([type, count]) => ({ type: type === 'Individual Consultant' ? 'Consultant' : type, count }))
          .sort((a, b) => b.count - a.count)
      })()

  let ctcTotal = 0
  const ctcByBU = {}
  filteredPayroll.forEach(r => {
    const v = (r.monthTotals[effectiveMonth] || 0) + (r.pensionMonthTotals?.[effectiveMonth] || 0)
    if (!v) return
    ctcTotal += v
    const buLabel = r.buName || r.buCode || 'Unknown'
    ctcByBU[buLabel] = (ctcByBU[buLabel] || 0) + v
  })
  const ctcByBUData = Object.entries(ctcByBU)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)

  // ── Business Unit headcount — built from activeEmployees (already scoped to every
  // active filter: BU/Type/VC/Source) so changing Budget Source actually narrows this
  // chart instead of always showing the company-wide total. ─────────────────────────
  const buHeadcountData = (monthEvoTrusted && filterBU === 'All')
    ? Object.entries(monthEvo.byBU || {})
        .map(([code, v]) => ({ name: deptDisplayNames[code] || code, count: v.count }))
        .filter(d => d.count > 0)
        .sort((a, b) => b.count - a.count)
    : (() => {
        const byBU = {}
        activeEmployees.forEach(e => {
          if (!e.buCode || e.buCode === 'Unknown') return
          const name = e.buName || e.buCode
          byBU[name] = (byBU[name] || 0) + 1
        })
        return Object.entries(byBU)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
      })()

  // ── Turnover — always year-scoped: the selected Year filter, or the current calendar
  // year (from the snapshot's asOf date, not the browser clock, so a historical snapshot
  // still shows ITS current year) when no Year filter is picked. Each monthly bucket also
  // carries a tagged roster/joinerRecords/leaverRecords, so BU/Employment Type/Virtual
  // Company filters narrow turnover too — same as every other figure on this page.
  // Budget Source is left out here: it's a payroll concept with no historical
  // reconstruction (someone who left 8 months ago has no "current" payroll row to read
  // a source from), the same limitation already documented for headcount above.
  const turnoverByYear        = hr.turnoverByYear        || {}
  const turnoverSummaryByYear = hr.turnoverSummaryByYear || {}
  const currentYear           = String(data.asOf ? new Date(data.asOf).getFullYear() : new Date().getFullYear())
  const effectiveTurnoverYear = filterYear !== 'All' ? filterYear : currentYear
  const selectedYearTurnover  = turnoverByYear[effectiveTurnoverYear]        || null
  const selectedYearSummary   = turnoverSummaryByYear[effectiveTurnoverYear] || null

  const baseTurnoverSeries  = selectedYearTurnover || hr.turnover || []
  const turnoverFilterActive = filterBU !== 'All' || filterType !== 'All' || filterVC !== 'All'
  const matchesTurnoverFilters = (r) =>
    (filterBU   === 'All' || r.buCode === filterBU) &&
    (filterType === 'All' || r.type   === filterType) &&
    (filterVC   === 'All' || r.vc     === filterVC)

  // Denominator excludes Agents everywhere — there is only ever one turnover rate.
  const nonAgentCount = (roster) => roster.filter(r => matchesTurnoverFilters(r) && !r.isAgent).length

  const turnoverSeries = turnoverFilterActive
    ? baseTurnoverSeries.map((t, i) => {
        const count      = nonAgentCount(t.roster || [])
        const prevCount  = i > 0 ? nonAgentCount(baseTurnoverSeries[i - 1].roster || []) : count
        const avgCount   = (prevCount + count) / 2
        const joiners    = (t.joinerRecords || []).filter(matchesTurnoverFilters).length
        const leavers    = (t.leaverRecords || []).filter(matchesTurnoverFilters).length
        const rate       = avgCount > 0 ? +((leavers / avgCount) * 100).toFixed(1) : 0
        return { label: t.label, joiners, leavers, rate }
      })
    : baseTurnoverSeries

  const turnoverSummary = turnoverFilterActive
    ? (() => {
        const totalLeavers = turnoverSeries.reduce((s, t) => s + t.leavers, 0)
        const n = baseTurnoverSeries.length
        const avgHC = n > 0
          ? baseTurnoverSeries.reduce((s, t) => s + nonAgentCount(t.roster || []), 0) / n
          : 0
        return { rate: avgHC > 0 ? +((totalLeavers / avgHC) * 100).toFixed(1) : 0 }
      })()
    : null

  const turnoverRate        = turnoverSummary ? turnoverSummary.rate
    : selectedYearSummary   ? selectedYearSummary.rate
    : (hr.turnoverRate12mo ?? null)
  const turnoverPeriodLabel = effectiveTurnoverYear

  // ── Based In (region) + HQ/Field split — built from activeEmployees so these also
  // narrow with every active filter (BU/Type/VC/Source), not just the company-wide
  // total. No historical reconstruction exists for location, so this is always the
  // live/current picture regardless of Month/Year filter (same limitation as before).
  const byLocation = (() => {
    const counts = {}
    activeEmployees.forEach(e => {
      if (!e.region) return
      counts[e.region] = (counts[e.region] || 0) + 1
    })
    return Object.entries(counts)
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count)
  })()
  const byCountry = (() => {
    const counts = {}
    activeEmployees.forEach(e => {
      if (!e.country) return
      counts[e.country] = (counts[e.country] || 0) + 1
    })
    return Object.entries(counts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
  })()
  const hqField = activeEmployees.reduce((acc, e) => {
    if (e.region) { if (e.isHQ) acc.hq++; else acc.field++ }
    return acc
  }, { hq: 0, field: 0 })

  // ── Budget Source — cost split by payroll source (Corporate vs Programme) ──
  const budgetLine = [
    { name: 'Corporate', value: filteredPayroll.filter(r => r.payrollSource === 'KIFIYA').reduce((s, r) => s + ((r.monthTotals[effectiveMonth]||0) + (r.pensionMonthTotals?.[effectiveMonth]||0)), 0) },
    { name: 'Programme', value: filteredPayroll.filter(r => r.payrollSource === 'SAFEE').reduce((s, r) => s + ((r.monthTotals[effectiveMonth]||0) + (r.pensionMonthTotals?.[effectiveMonth]||0)), 0) },
  ].map(d => ({ ...d, value: Math.round(d.value) })).filter(d => d.value > 0)
  const budgetLineTotal = budgetLine.reduce((s, d) => s + d.value, 0)
  const BUDGET_COLORS = [TEAL, ORANGE]

  // ── Monthly Hires (joiners) — same year-scoping as turnover above ────────────
  const monthlyHires = turnoverSeries.map(t => ({
    label: (t.label || '').split(' ')[0]?.slice(0, 3) || t.label,
    joiners: t.joiners
  }))

  const exportRows = buildEmployeeExportRows(filteredPayroll, effectiveMonth, activeEmployees, deptDisplayNames)
  const exportMeta = buildExportMeta({ filterBU, filterType, filterVC, filterSource, effectiveMonth, deptDisplayNames })

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">People & Culture</h2>
          <p className="text-xs text-muted font-medium">Workforce & cost snapshot — headcount, turnover, and CTC by business unit</p>
        </div>
        <ExportButton
          rows={exportRows}
          columns={EMPLOYEE_EXPORT_COLUMNS}
          meta={exportMeta}
          filename={`people-culture-${effectiveMonth || 'export'}.csv`.replace(/\s+/g, '-')}
        />
      </div>

      <PeopleOpsFilterBar data={data} />

      <div className="rounded-2xl overflow-hidden" style={{ background: BG }}>
        {/* ── Row 1: KPI cells ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7" style={{ gap: 1, background: LINE }}>
          <Cell1 label="Employees Number" value={fmtN(totalEmployees)} sub="Total Employees" icon={<PeopleIcon />} />
          <Cell1 label="CTC" value={fmtC(ctcTotal)} valueSize={22} sub={effectiveMonth || 'This month'} />
          <Cell1 label="Male" value={fmtN(maleCount)} />
          <Cell1 label="Female" value={fmtN(femaleCount)} />
          <Cell1 label="Gender in %" valueSize={20}
            sub={null}>
            <div className="mt-2 flex gap-4">
              <div><p className="text-white font-extrabold text-xl leading-none">{malePct}%</p><p className="text-[9px] mt-1" style={{ color: AXIS }}>Male</p></div>
              <div><p className="text-white font-extrabold text-xl leading-none">{femalePct}%</p><p className="text-[9px] mt-1" style={{ color: AXIS }}>Female</p></div>
            </div>
          </Cell1>
          <Cell1 label="Employees In HQ" value={fmtN(hqField.hq)} />
          <Cell1 label="Employees in Field" value={fmtN(hqField.field)} />
        </div>

        {/* ── Row 2: Employment Type table + Turnover + BU charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 1, background: LINE }}>
          <div className="p-4" style={{ background: PANEL }}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: ORANGE }}>Employment Type</p>
            <div className="space-y-1.5">
              {employmentTypeRows.length > 0 ? employmentTypeRows.map(row => (
                <div key={row.type} className="flex items-center justify-between text-[12px]">
                  <span className="font-medium" style={{ color: '#D7E5E9' }}>{row.type}</span>
                  <span className="font-bold text-white">{fmtN(row.count)}</span>
                </div>
              )) : <p className="text-[11px]" style={{ color: AXIS }}>No data</p>}
            </div>
          </div>

          <div className="p-4 flex flex-col items-center justify-center text-center" style={{ background: PANEL }}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: ORANGE }}>Turnover Rate</p>
            <p className="font-extrabold text-white leading-none mt-2" style={{ fontSize: 40 }}>{fmtPct1(turnoverRate)}</p>
            <p className="text-[9px] mt-1" style={{ color: AXIS }}>Excl. Agents · {turnoverPeriodLabel}</p>
          </div>

          <div className="p-4 flex flex-col justify-between" style={{ background: PANEL }}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: ORANGE }}>Monthly Hires</p>
            {monthlyHires.length > 0 ? (
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={monthlyHires} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: AXIS }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 8, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 10, background: PANEL, border: '1px solid rgba(255,255,255,.15)', color: '#fff' }} />
                  <Line type="monotone" dataKey="joiners" stroke={TEAL} strokeWidth={2} dot={{ r: 2.5, fill: TEAL }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-[11px]" style={{ color: AXIS }}>No data</p>}
          </div>
        </div>

        {/* ── Row 3: Business Unit + CTC By Business Unit ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 1, background: LINE }}>
          <div className="p-4" style={{ background: PANEL }}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: ORANGE }}>No of Employees by Business Unit</p>
            {buHeadcountData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={buHeadcountData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: AXIS }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 9, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 11, background: PANEL, border: '1px solid rgba(255,255,255,.15)', color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="count" fill="#D7E5E9" maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-[220px] flex items-center justify-center text-[11px]" style={{ color: AXIS }}>No data</div>}
          </div>

          <div className="p-4" style={{ background: PANEL }}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: ORANGE }}>CTC By Business Unit</p>
            {ctcByBUData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ctcByBUData} layout="vertical" margin={{ top: 4, right: 60, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={LINE} horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: AXIS }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip formatter={v => fmtC(v)} contentStyle={{ fontSize: 11, background: PANEL, border: '1px solid rgba(255,255,255,.15)', color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="value" fill={TEAL} maxBarSize={16}>
                    {ctcByBUData.map((_, i) => <Cell key={i} fill={TEAL} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-[220px] flex items-center justify-center text-[11px]" style={{ color: AXIS }}>No payroll data</div>}
          </div>
        </div>

        {/* ── Row 4: Based In + Budget Source ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 1, background: LINE }}>
          <div className="p-4" style={{ background: PANEL }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: ORANGE }}>Employees by City and Country</p>
              <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
                {['city', 'country'].map(v => (
                  <button
                    key={v}
                    onClick={() => setLocationView(v)}
                    className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors"
                    style={{
                      background: locationView === v ? ORANGE : 'transparent',
                      color:      locationView === v ? BG     : AXIS
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {(locationView === 'city' ? byLocation : byCountry).length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={(locationView === 'city' ? byLocation : byCountry).map(l => ({ name: l.region || l.country, count: l.count }))}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: AXIS }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 9, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 11, background: PANEL, border: '1px solid rgba(255,255,255,.15)', color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="count" fill="#D7E5E9" maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-[220px] flex items-center justify-center text-[11px]" style={{ color: AXIS }}>No location data</div>}
          </div>

          <div className="p-4 flex items-center" style={{ background: PANEL }}>
            <div className="w-full">
              <p className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: ORANGE }}>Budget Source</p>
              {budgetLine.length > 0 ? (
                <div className="flex items-center gap-6">
                  <PieChart width={160} height={160}>
                    <Pie data={budgetLine} cx="50%" cy="50%" innerRadius={44} outerRadius={72} dataKey="value" paddingAngle={3}>
                      {budgetLine.map((_, i) => <Cell key={i} fill={BUDGET_COLORS[i % BUDGET_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => fmtC(v)} contentStyle={{ fontSize: 11, background: PANEL, border: '1px solid rgba(255,255,255,.15)', color: '#fff' }} />
                  </PieChart>
                  <div className="space-y-2">
                    {budgetLine.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: BUDGET_COLORS[i % BUDGET_COLORS.length] }} />
                        <span className="text-[11px] font-semibold text-white">{d.name}</span>
                        <span className="text-[10px]" style={{ color: AXIS }}>{fmtC(d.value)}</span>
                      </div>
                    ))}
                    <p className="text-[10px] pt-2 mt-1" style={{ color: AXIS, borderTop: `1px solid ${LINE}` }}>
                      Total: <strong className="text-white">{fmtC(budgetLineTotal)}</strong>
                    </p>
                  </div>
                </div>
              ) : <div className="h-[160px] flex items-center justify-center text-[11px]" style={{ color: AXIS }}>No payroll data</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
