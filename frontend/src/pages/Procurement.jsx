import { PROCUREMENT_REPORTS } from './procurement/reportConfig.js'

// Explicit dark-theme colors rather than relying on light Tailwind classes (bg-bg,
// text-muted, etc.) getting repainted for dark mode — that repaint doesn't reach
// inline hex styles, which is exactly what left another table's header unreadable
// earlier on this dashboard. Matches the same NAVY/ROW_BG pattern used by the
// Financial Performance and Aging drilldown tables.
const NAVY = '#02404F'
const ROW_BG = { even: '#0A3A46', odd: '#0E434D' }

// Landing page for the Procurement module — the 15 actual reports live one level
// down in the sidebar (see pages.js/Sidebar.jsx's parentId nesting), each currently
// a placeholder until its BC data source is confirmed. This page is just a status
// board so it's obvious at a glance what's planned and what each one needs.
export default function Procurement() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Procurement</h2>
        <p className="text-xs text-muted font-medium">
          {PROCUREMENT_REPORTS.length} reports planned for this module, listed below and in the sidebar. None are
          connected to live Business Central data yet — pending confirmation of the underlying OData sources.
        </p>
      </div>

      <div className="rounded-2xl border border-border shadow-card overflow-x-auto" style={{ background: ROW_BG.even }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: NAVY }}>
              <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Category</th>
              <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Report</th>
              <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Chart Type</th>
              <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Source</th>
              <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {PROCUREMENT_REPORTS.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? ROW_BG.odd : ROW_BG.even }}>
                <td className="px-4 py-2.5 text-white/60 font-semibold whitespace-nowrap">{r.category}</td>
                <td className="px-4 py-2.5 text-white font-bold whitespace-nowrap">{r.title}</td>
                <td className="px-4 py-2.5 text-white/60 whitespace-nowrap">{r.chartType}</td>
                <td className="px-4 py-2.5 text-white/60 whitespace-nowrap">{r.source}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(235,125,35,.2)', color: '#EB7D23' }}>
                    Not connected
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
