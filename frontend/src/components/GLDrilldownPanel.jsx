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
export default function GLDrilldownPanel({ colSpan, label, accounts, asOf, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!accounts?.length) return
    setLoading(true); setError(''); setData(null)
    glDrilldown.get(accounts, asOf)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load GL entries.')))
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [accounts, asOf])

  const entries = data?.entries || []
  const shown = entries.slice(0, MAX_ROWS)

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="mx-5 my-2 rounded-xl border border-border overflow-hidden" style={{ background: 'rgba(0,0,0,0.18)' }}>
          <div className="flex items-start justify-between px-4 py-3 border-b border-border/50">
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
            <button onClick={onClose} className="text-muted hover:text-navy text-base leading-none px-1.5 flex-shrink-0">×</button>
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
                {entries.length > MAX_ROWS ? `Showing most recent ${MAX_ROWS} of ${entries.length} entries` : `${entries.length} entries`}
              </p>
              <p className="text-xs font-extrabold text-navy">Total: ETB {fmtAmt(data.total)}</p>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}
