import { downloadCSV } from '../lib/csvExport.js'

// variant 'light' = for light page chrome (navy text, matches the "Clear filters" button
// style already used in PeopleOpsFilterBar); 'dark' = for placement on a dark panel.
export default function ExportButton({ rows, columns, filename, meta, label = 'Export', variant = 'light' }) {
  const disabled = !rows || rows.length === 0
  const variantStyle = variant === 'dark'
    ? { borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }
    : { borderColor: '#D7DEE6', color: '#02404F' }
  return (
    <button
      onClick={() => downloadCSV(filename, rows, columns, meta)}
      disabled={disabled}
      title={disabled ? 'No rows to export for the current filters' : `Export ${rows.length} row(s) to CSV`}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:border-navy"
      style={variantStyle}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {label}
    </button>
  )
}
