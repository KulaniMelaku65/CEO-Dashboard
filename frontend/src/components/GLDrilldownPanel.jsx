import { useEffect, useState } from 'react'
import { glDrilldown } from '../lib/api.js'

const RED = '#E5544B'

function fmtAmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
}
function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const MAX_ROWS = 300

// Click-a-number-to-see-the-ledger drilldown, same behavior BC itself has — opens the raw
// GL entries that make up a figure shown on a finance page. Renders as a table row that
// expands directly beneath the row that was clicked (a fixed-position modal centered over
// the page, tried first, looked disconnected from whatever was actually clicked and stood
// out against the dark theme) — same in-place expand/collapse pattern already used
// elsewhere on this table (BsSection's own chevron rows). Generic over any `accounts`
// list + `asOf` date + table `colSpan`, so any page's table can wire a number to this.
//
// `onClose` closes it (also used as the toggle when the same row is clicked again).
// `label` is shown as the panel title. `accounts` is the account number list behind it.
// `asOf` (YYYY-MM-DD) scopes entries to postingDate <= asOf — omit for today.
// `compareAsOf`/`compareLabel`, when a page has an active Compare To baseline, add a
// Current/Compare toggle so the same account list can be inspected as of either period
// without closing and reopening the panel on a different row.
export default function GLDrilldownPanel({ colSpan, label, accounts, asOf, compareAsOf, compareLabel, onClose }) {
  const [viewAsOf, setViewAsOf] = useState(asOf)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [exporting, setExporting] = useState(false)

  // A different row (different accounts/asOf) was clicked — reset back to the primary
  // period's view rather than carrying over a Compare To selection from the last row.
  useEffect(() => { setViewAsOf(asOf) }, [accounts, asOf])

  useEffect(() => {
    if (!accounts?.length) return
    setLoading(true); setError(''); setData(null)
    glDrilldown.get(accounts, viewAsOf)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load GL entries.')))
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [accounts, viewAsOf])

  const entries = data?.entries || []
  const shown = entries.slice(0, MAX_ROWS)
  const isComparing = !!compareAsOf && compareAsOf !== asOf

  // Exports every loaded entry (not just the MAX_ROWS shown on screen) as a .xlsx
  // workbook — dynamically imported so the ~700KB xlsx library only loads when someone
  // actually clicks Export, not as part of this page's main bundle.
  const exportExcel = async () => {
    if (!entries.length || exporting) return
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const rows = entries.map(e => ({
        Date:            e.postingDate ? e.postingDate.slice(0, 10) : '',
        Account:         e.accountNo,
        'Account Name':  e.accountName || '',
        Description:     e.description || '',
        Document:        e.documentNo || '',
        'Document Type': e.documentType || '',
        Amount:          e.amount,
      }))
      rows.push({ Date: '', Account: '', 'Account Name': '', Description: '', Document: '', 'Document Type': 'Total', Amount: data.total })
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 16 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'GL Entries')
      const safeLabel = String(label || 'GL Entries').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
      XLSX.writeFile(wb, `${safeLabel} - ${viewAsOf || 'latest'}.xlsx`)
    } catch (e) {
      console.error('[gl-export]', e)
    } finally {
      setExporting(false)
    }
  }

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="mx-5 my-2 rounded-xl border border-border overflow-hidden" style={{ background: 'rgba(0,0,0,0.18)' }}>
          <div className="flex items-start justify-between px-4 py-3 border-b border-border/50 gap-3 flex-wrap">
            <div>
              <p className="text-xs font-extrabold text-navy">{label} — general ledger entries</p>
              <p className="text-[10px] text-muted mt-0.5">
                {accounts?.length} account{accounts.length !== 1 ? 's' : ''}
                {data?.asOf && ` · through ${fmtDate(data.asOf)}`}
                {' · '}
                <span className="text-navy font-semibold">Black</span> = debit/increase ·{' '}
                <span className="font-semibold" style={{ color: RED }}>Red in parentheses</span> = credit/decrease
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isComparing && (
                <div className="flex items-center gap-0.5 bg-black/25 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewAsOf(asOf)}
                    className="px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors"
                    style={viewAsOf === asOf ? { background: '#fff', color: '#02404F' } : { color: 'rgba(255,255,255,0.6)' }}
                  >
                    As of {fmtDate(asOf)}
                  </button>
                  <button
                    onClick={() => setViewAsOf(compareAsOf)}
                    className="px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors"
                    style={viewAsOf === compareAsOf ? { background: '#fff', color: '#02404F' } : { color: 'rgba(255,255,255,0.6)' }}
                  >
                    {compareLabel ? `Compare: ${compareLabel}` : `As of ${fmtDate(compareAsOf)}`}
                  </button>
                </div>
              )}
              <button
                onClick={exportExcel}
                disabled={!entries.length || exporting}
                className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-border/60 text-navy hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                {exporting ? 'Exporting…' : '⬇ Export Excel'}
              </button>
              <button onClick={onClose} className="text-muted hover:text-navy text-base leading-none px-1.5 flex-shrink-0">×</button>
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {loading ? (
              <p className="text-xs text-muted px-4 py-6 text-center">Loading entries from Business Central…</p>
            ) : error ? (
              <p className="text-xs font-bold px-4 py-6 text-center" style={{ color: RED }}>{error}</p>
            ) : entries.length === 0 ? (
              <p className="text-xs text-muted px-4 py-6 text-center">No GL entries found for this figure.</p>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0" style={{ background: '#052C36' }}>
                  <tr>
                    <th className="text-left px-4 py-1.5 font-extrabold text-muted uppercase tracking-wider">Date</th>
                    <th className="text-left px-3 py-1.5 font-extrabold text-muted uppercase tracking-wider">Account</th>
                    <th className="text-left px-3 py-1.5 font-extrabold text-muted uppercase tracking-wider">Description</th>
                    <th className="text-left px-3 py-1.5 font-extrabold text-muted uppercase tracking-wider">Document</th>
                    <th className="text-right px-4 py-1.5 font-extrabold text-muted uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e, i) => (
                    <tr key={i} className="border-t border-border/30 hover:bg-white/5">
                      <td className="px-4 py-1.5 text-navy whitespace-nowrap">{fmtDate(e.postingDate)}</td>
                      <td className="px-3 py-1.5 text-navy whitespace-nowrap">{e.accountNo}{e.accountName ? ` — ${e.accountName}` : ''}</td>
                      <td className="px-3 py-1.5 text-navy">{e.description || '—'}</td>
                      <td className="px-3 py-1.5 text-muted whitespace-nowrap">{e.documentNo || '—'}</td>
                      <td className={`px-4 py-1.5 text-right font-semibold whitespace-nowrap ${e.amount < 0 ? 'text-red-500' : 'text-navy'}`}>
                        {e.amount < 0 ? '(' : ''}ETB {fmtAmt(e.amount)}{e.amount < 0 ? ')' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!loading && !error && entries.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border/50" style={{ background: 'rgba(0,0,0,0.12)' }}>
              <p className="text-[10px] text-muted">
                {entries.length > MAX_ROWS ? `Showing most recent ${MAX_ROWS} of ${entries.length} entries — export for the full list` : `${entries.length} entries`}
              </p>
              <p className="text-xs font-extrabold text-navy">Total: ETB {fmtAmt(data.total)}</p>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}
