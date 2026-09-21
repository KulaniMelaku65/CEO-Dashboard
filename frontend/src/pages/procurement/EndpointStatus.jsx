import { getReportStatus, STATUS_TONE_COLORS } from './reportConfig.js'
import { Panel, Notice, PageHeader } from './shared.jsx'

// Page for a report whose Business Central endpoint exists in the registry but can't show
// data yet — either it answers with zero rows (the two purchase-requisition feeds) or it
// isn't published at all (audit trail). The report definition is real; there just isn't
// anything to chart, and the page says exactly why rather than showing empty charts.
export default function EndpointStatus({ data, report }) {
  const proc = data?.procurement
  const ep = proc?.endpoints?.[report.endpoint]
  const status = getReportStatus(report, proc)
  const tone = STATUS_TONE_COLORS[status.tone]

  return (
    <div className="space-y-4">
      <PageHeader category={report.category} title={report.title} subtitle={report.metric} asOf={data?.asOf} />

      <Panel>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-[11px] font-bold px-3 py-1 rounded-full" style={{ background: tone.bg, color: tone.fg }}>{status.label}</span>
          <span className="text-xs text-muted">Source: <strong className="text-navy">{report.source}</strong></span>
        </div>

        {!proc && (
          <p className="text-xs text-muted leading-relaxed">
            Procurement data is only pulled for the latest snapshot. Switch the date picker back to <strong>Latest</strong> to see this feed's status.
          </p>
        )}

        {proc && ep && ep.ok && ep.rows === 0 && (
          <div className="space-y-2 text-xs text-muted leading-relaxed">
            <p>
              The <strong className="text-navy">{ep.name}</strong> endpoint is published and answering, but Business Central returned <strong className="text-navy">0 rows</strong> for it.
              Either there are no records behind it yet, or the endpoint's source filters every record out.
            </p>
            <p>
              Because no rows came back, the field names aren't visible, so this report can't be laid out honestly ({report.chartType.toLowerCase()} of {report.metric.toLowerCase()}).
              Once the feed returns data, the next sync will pick it up and this page can be built from the real fields.
            </p>
          </div>
        )}

        {proc && ep && !ep.ok && (
          <div className="space-y-2 text-xs text-muted leading-relaxed">
            <p><strong className="text-navy">{ep.name}</strong> could not be read: {ep.error}</p>
            <p>
              To bring this report online, publish an OData web service for it in Business Central with <em>exactly</em> that service name, the same way
              the other <code>KFT_*</code> feeds were published. Once it answers, the next sync will pull it and this page can be built from its real fields.
            </p>
          </div>
        )}
      </Panel>

      <Notice tone="info" title="What this report will show">
        {report.metric} as a {report.chartType.toLowerCase()}, for {report.audience}.
      </Notice>
    </div>
  )
}
