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
  const prs = proc.requisitions.rows
  const openPrs = prs.filter(r => r.st === 'Open' && r.d)
  const openPrAge = openPrs.length ? sumBy(openPrs, r => daysBetween(r.d, asOf)) / openPrs.length : 0
  const oc = proc.offContract
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
        <Kpi label="Purchase requisitions" value={fmtInt(prs.length)} sub={`${fmtMoney(sumBy(prs.filter(r => r.cur === 'ETB'), r => r.amt))}`} accent={NAVY} />
        <Kpi label="Pending PR approvals" value={fmtInt(proc.pendingPr.count)} sub={`${fmtMoney(sumBy(proc.pendingPr.rows.filter(r => r.cur === 'ETB'), r => r.amt))}`} accent={ORANGE} />
        <Kpi label="Open PRs — average age" value={`${Math.round(openPrAge)} days`} sub={`${fmtInt(openPrs.length)} open`} accent={BLUE} />
        <Kpi
          label="Outside contract"
          value={oc.totals.offContractPct == null ? '—' : `${oc.totals.offContractPct.toFixed(0)}%`}
          sub={oc.onContractLines === 0 ? 'No PO line references a contract' : `${fmtMoney(oc.totals.offContract)}`}
          accent={oc.totals.offContractPct > 50 ? RED : DTEAL}
        />
      </div>

      <Notice tone="info" title="PO cycle time and PR-to-PO conversion can't be calculated yet">
        <ul className="list-disc pl-4 space-y-0.5">
          {proc.endpoints.cycleTime?.ok && proc.endpoints.cycleTime.rows === 0 && (
            <li>The cycle-time feed (<strong>{proc.endpoints.cycleTime.name}</strong>) is connected but returns 0 rows.</li>
          )}
          {proc.endpoints.cycleTime && !proc.endpoints.cycleTime.ok && (
            <li>The cycle-time feed (<strong>{proc.endpoints.cycleTime.name}</strong>) could not be read: {proc.endpoints.cycleTime.error}</li>
          )}
          <li>
            None of the PO feeds carries a requisition reference, so a requisition can't be matched to the purchase order it became
            ({fmtInt(proc.requisitions.count)} requisitions and {fmtInt(proc.po.rows.length)} POs exist, but nothing joins them).
          </li>
          {proc.variance.totals.linesWithReceipt === 0 && <li>No receipts are posted against any PO, so there's no receipt date to measure the end of the cycle.</li>}
        </ul>
      </Notice>

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
