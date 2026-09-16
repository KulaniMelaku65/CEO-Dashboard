// Shared "not yet connected" shell for every Procurement sub-tab. One component
// renders all 15 report pages (see reportConfig.js + index.js) rather than 15 nearly
// identical files — once a report's BC source is confirmed reachable, that one report
// gets its own real chart component and is pulled out of this shared shell.
function Pill({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-bg text-muted">
      <span className="uppercase tracking-wider text-muted/70">{label}</span>
      <span className="text-navy">{value}</span>
    </span>
  )
}

export default function ReportPlaceholder({ report }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted mb-1">{report.category}</p>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">{report.title}</h2>
        <p className="text-xs text-muted font-medium">{report.metric}</p>
      </div>

      <div className="bg-white rounded-2xl border border-border p-8 shadow-card flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-bg flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B7C93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
          </svg>
        </div>
        <p className="text-navy font-bold text-sm">Not yet connected to Business Central</p>
        <p className="text-muted text-xs leading-relaxed max-w-md">
          This report needs a live OData feed for <strong className="text-navy">{report.source}</strong> before it can
          show real figures. Once that's confirmed and exposed, this page gets wired up the same way every other
          page on this dashboard was — no change needed to navigation or access permissions.
        </p>
        <div className="flex flex-wrap gap-2 justify-center mt-1">
          <Pill label="Chart" value={report.chartType} />
          <Pill label="Audience" value={report.audience} />
          <Pill label="Source" value={report.source} />
        </div>
      </div>
    </div>
  )
}
