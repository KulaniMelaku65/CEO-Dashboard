import { PROCUREMENT_REPORTS, getReportStatus, STATUS_TONE_COLORS } from './reportConfig.js'
import {
  NAVY, TEAL, ORANGE, RED, DTEAL, BLUE,
  fmtMoney, fmtInt, sumBy, daysBetween,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData,
} from './shared.jsx'

function Body({ proc }) {
  const asOf = proc.asOfDate || new Date().toISOString().slice(0, 10)
  const etb = proc.po.rows.filter(r => r.cur === 'ETB')
  const pending = etb.filter(r => r.st === 'Pending Approval')
  const open = etb.filter(r => !r.rec && r.od)
  const avgAge = open.length ? sumBy(open, r => daysBetween(r.od, asOf)) / open.length : 0
  const spend = sumBy(proc.spend.rows, r => r.amt)
  const spendThisYear = sumBy(proc.spend.rows.filter(r => r.d.startsWith(asOf.slice(0, 4))), r => r.amt)
  const c = proc.commitments
  const latestProg = [...proc.budget.budgets].filter(b => b.currency === 'USD').sort((a, b) => b.name.localeCompare(a.name))[0]
  const approvers = new Set(etb.map(r => r.ap))
  const withLimit = new Set(etb.filter(r => r.unl || r.lim > 0).map(r => r.ap))

  const statusRows = PROCUREMENT_REPORTS.filter(r => !r.derived).map(r => {
    const s = getReportStatus(r, proc)
    return { title: r.title, category: r.category, status: s.label, tone: s.tone }
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Kpi label="Purchase orders (ETB)" value={fmtInt(etb.length)} sub={fmtMoney(sumBy(etb, r => r.amt))} accent={DTEAL} />
        <Kpi label="Open POs — average age" value={`${Math.round(avgAge)} days`} sub={`${fmtInt(open.length)} open`} accent={NAVY} />
        <Kpi label="Pending approval" value={fmtInt(pending.length)} sub={fmtMoney(sumBy(pending, r => r.amt))} accent={ORANGE} />
        <Kpi label="Invoiced spend" value={fmtMoney(spend)} sub={`${fmtMoney(spendThisYear)} in ${asOf.slice(0, 4)}`} accent={BLUE} />
        <Kpi label="Committed (programme budgets)" value={fmtMoney(c.totals.lcy)} sub={fmtMoney(c.totals.usd, 'USD')} accent={TEAL} />
        {latestProg && <Kpi label={`Budget ${latestProg.name} utilisation`} value={latestProg.utilizationPct == null ? '—' : `${latestProg.utilizationPct.toFixed(1)}%`} sub={`${fmtMoney(latestProg.committed, 'USD')} of ${fmtMoney(latestProg.allocated, 'USD')}`} accent={NAVY} />}
        <Kpi
          label="Received against POs"
          value={fmtMoney(proc.variance.totals.received)}
          sub={proc.variance.totals.received === 0 && proc.variance.totals.invoiced === 0 ? 'Nothing received or invoiced yet' : `${fmtMoney(proc.variance.totals.invoiced)} invoiced`}
          accent={proc.variance.totals.received === 0 ? RED : DTEAL}
        />
        <Kpi label="Approvers with a limit set" value={`${withLimit.size} of ${approvers.size}`} sub={withLimit.size === 0 ? 'DOA limits missing in Business Central' : 'Limit set or unlimited'} accent={withLimit.size === 0 ? ORANGE : DTEAL} />
      </div>

      {(proc.requisitions.rows === 0 || proc.variance.totals.linesWithReceipt === 0) && (
        <Notice tone="info" title="Two of the headline KPIs in the brief can't be calculated yet">
          <strong>PO cycle time</strong> and <strong>PR-to-PO conversion</strong> need purchase-requisition and goods-receipt records.
          Requisitions returned by Business Central: <strong>{fmtInt(proc.requisitions.rows)}</strong>. PO lines with a receipt posted: <strong>{fmtInt(proc.variance.totals.linesWithReceipt)}</strong>.
          Until both exist there is nothing to time or convert.
        </Notice>
      )}

      <Panel title="Data connections" subtitle="Live status of every Procurement report's Business Central feed">
        <DrillTable
          rows={statusRows}
          columns={[
            { key: 'title', label: 'Report', align: 'left' },
            { key: 'category', label: 'Category' },
            { key: 'status', label: 'Status', format: (v, r) => <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: STATUS_TONE_COLORS[r.tone].bg, color: STATUS_TONE_COLORS[r.tone].fg }}>{v}</span> },
          ]}
        />
      </Panel>
    </div>
  )
}

export default function KpiSummary({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="Procurement KPIs" title="Procurement KPI Summary" subtitle="Headline figures across the connected procurement feeds" asOf={data?.asOf} />
      <ProcData data={data} need="poSummary">{proc => <Body proc={proc} />}</ProcData>
    </div>
  )
}
