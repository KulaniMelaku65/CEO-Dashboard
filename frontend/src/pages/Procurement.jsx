import { PROCUREMENT_REPORTS, getReportStatus, STATUS_TONE_COLORS } from './procurement/reportConfig.js'

// Explicit dark-theme colors rather than relying on light Tailwind classes (bg-bg,
// text-muted, etc.) getting repainted for dark mode — that repaint doesn't reach
// inline hex styles, which is exactly what left another table's header unreadable
// earlier on this dashboard. Matches the same NAVY/ROW_BG pattern used by the
// Financial Performance and Aging drilldown tables.
const NAVY = '#0F5565'
const ROW_BG = { even: 'var(--tbl-row-even)', odd: 'var(--tbl-row-odd)' }

// Landing page for the Procurement module — the 15 reports live one level down in the
// sidebar (see lib/pages.js's parentId nesting). The Status column is read live from the
// snapshot's per-endpoint status, so it always reflects what Business Central actually
// returned on the last sync: live, connected-but-empty, missing, or no feed yet.
export default function Procurement({ data }) {
  const proc = data?.procurement
  const statuses = PROCUREMENT_REPORTS.map(r => getReportStatus(r, proc))
  const live = statuses.filter(s => s.tone === 'green').length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-ink mb-0.5">Procurement</h2>
        <p className="text-xs text-muted font-medium">
          {proc
            ? `${live} of ${PROCUREMENT_REPORTS.length} reports are live from Business Central; the rest are waiting on a feed, or the feed is empty.`
            : `${PROCUREMENT_REPORTS.length} reports planned. Live status is only available on the latest snapshot.`}
          {' '}Each report is listed in the sidebar under Procurement.
        </p>
      </div>

      <div className="rounded-2xl border border-border shadow-card overflow-x-auto" style={{ background: ROW_BG.even }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--tbl-head-bg)', borderBottom: '1px solid var(--tbl-line)' }}>
              <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Category</th>
              <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Report</th>
              <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Chart Type</th>
              <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Source</th>
              <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {PROCUREMENT_REPORTS.map((r, i) => {
              const tone = STATUS_TONE_COLORS[statuses[i].tone]
              return (
                <tr key={r.id} style={{ background: i % 2 ? ROW_BG.odd : ROW_BG.even }}>
                  <td className="px-4 py-2.5 text-muted font-semibold whitespace-nowrap">{r.category}</td>
                  <td className="px-4 py-2.5 text-ink font-bold whitespace-nowrap">{r.title}</td>
                  <td className="px-4 py-2.5 text-muted whitespace-nowrap">{r.chartType}</td>
                  <td className="px-4 py-2.5 text-muted whitespace-nowrap">{r.source}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: tone.bg, color: tone.fg }}>
                      {statuses[i].label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
