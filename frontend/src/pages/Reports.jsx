import { fmtETB } from '../lib/fmt.js'

const trendArrow = t => t === 'up' ? '↑' : t === 'down' ? '↓' : '→'
const trendColor = t => t === 'up' ? '#2EBD85' : t === 'down' ? '#E5544B' : '#6B7C93'

export default function Reports({ data }) {
  const r = data.reports || {}
  const ratios     = r.ratios     || []
  const pl         = r.pl         || []
  const management = r.management || []

  const noData = !ratios.length && !pl.length && !management.length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Reports & Ratios</h2>
        <p className="text-xs text-muted font-medium">Key financial ratios, P&L statement, and management report</p>
      </div>

      {noData && (
        <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted text-sm">
          No report data available yet. Sync from Business Central to populate.
        </div>
      )}

      {/* Key ratios */}
      {ratios.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ratios.map(ratio => (
            <div key={ratio.label} className="bg-white rounded-2xl border border-border p-5 shadow-card">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{ratio.label}</p>
              <p className="text-2xl font-extrabold text-navy">{ratio.value}</p>
              {ratio.trend && (
                <p className="text-xs font-semibold mt-1" style={{ color: trendColor(ratio.trend) }}>
                  {trendArrow(ratio.trend)} {ratio.trend === 'up' ? 'Improving' : ratio.trend === 'down' ? 'Declining' : 'Stable'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* P&L */}
      {pl.length > 0 && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Profit & Loss Statement</h3>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {pl.map((row, i) => {
                const isHeader = row.type === 'header'
                const isTotal  = row.type === 'total'
                return (
                  <tr
                    key={`${row.name}-${i}`}
                    className={isHeader ? 'bg-navy/5' : isTotal ? 'bg-navy/10' : i % 2 ? 'bg-bg/50' : ''}
                  >
                    <td className={`px-5 py-3 ${isHeader ? 'text-[10px] uppercase tracking-wider text-muted font-bold' : isTotal ? 'font-extrabold text-navy' : 'text-navy pl-8 font-medium'}`}>
                      {row.name}
                    </td>
                    <td className={`px-5 py-3 text-right ${isTotal ? 'font-extrabold text-navy' : 'text-navy font-semibold'}`}>
                      {row.value != null ? `ETB ${fmtETB(row.value, 2)}` : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Management report */}
      {management.length > 0 && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Management Report</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-bg">
                  {['Metric', 'This Month', 'Last Month', 'YTD', 'vs Budget'].map((h, i) => (
                    <th key={h} className={`py-3 px-5 text-[10px] font-bold text-muted uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {management.map((row, i) => {
                  const vs  = parseFloat(row.vsBudget)
                  const col = isNaN(vs) ? '#6B7C93' : vs >= 0 ? '#2EBD85' : '#E5544B'
                  return (
                    <tr key={row.metric} className={i % 2 ? 'bg-bg/50' : ''}>
                      <td className="px-5 py-3 font-bold text-navy">{row.metric}</td>
                      <td className="px-5 py-3 text-right font-semibold text-navy">{row.month}</td>
                      <td className="px-5 py-3 text-right text-muted font-medium">{row.last}</td>
                      <td className="px-5 py-3 text-right font-semibold text-navy">{row.ytd}</td>
                      <td className="px-5 py-3 text-right font-bold" style={{ color: col }}>{row.vsBudget}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
