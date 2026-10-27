import { useEffect, useState } from 'react'
import { glDrilldown } from '../lib/api.js'

const NAVY = '#02404F'
const RED  = '#E5544B'

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
// GL entries that make up a figure shown on a finance page. Generic over any `accounts`
// list + `asOf` date, so any page can wire a number to this without building its own
// modal; Balance Sheet is the first to do so (see snapshot-builder.js's `accounts` arrays
// on every row/section/grand-total, and /api/gl-drilldown).
//
// `open`/`onClose` are controlled by the caller. `label` is shown as the modal title (the
// figure's own name, e.g. "Trade Creditors" or "Total Assets"). `accounts` is the account
// number list behind it. `asOf` (YYYY-MM-DD) scopes entries to postingDate <= asOf —
// omit for today.
export default function GLDrilldownModal({ open, onClose, label, accounts, asOf }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!open || !accounts?.length) return
    setLoading(true); setError(''); setData(null)
    glDrilldown.get(accounts, asOf)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load GL entries.')))
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, accounts, asOf])

  if (!open) return null

  const entries = data?.entries || []
  const shown = entries.slice(0, MAX_ROWS)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10 px-4" style={{ background: 'rgba(2,64,79,0.55)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-extrabold text-navy">{label}</h3>
            <p className="text-[11px] text-muted mt-0.5">
              General ledger entries{accounts?.length ? ` · ${accounts.length} account${accounts.length !== 1 ? 's' : ''}` : ''}
              {data?.asOf && ` · through ${fmtDate(data.asOf)}`}
            </p>
            <p className="text-[10px] text-muted mt-1">
              <span className="text-navy font-semibold">Black</span> = debit / increase to the account ·{' '}
              <span className="font-semibold" style={{ color: RED }}>Red in parentheses</span> = credit / decrease to the account
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-navy text-xl leading-none px-2 -mt-1">×</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted px-6 py-10 text-center">Loading entries from Business Central…</p>
          ) : error ? (
            <p className="text-sm font-bold px-6 py-10 text-center" style={{ color: RED }}>{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted px-6 py-10 text-center">No GL entries found for this figure.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white border-b border-border">
                <tr>
                  <th className="text-left px-6 py-2 font-extrabold text-muted uppercase tracking-wider">Date</th>
                  <th className="text-left px-3 py-2 font-extrabold text-muted uppercase tracking-wider">Account</th>
                  <th className="text-left px-3 py-2 font-extrabold text-muted uppercase tracking-wider">Description</th>
                  <th className="text-left px-3 py-2 font-extrabold text-muted uppercase tracking-wider">Document</th>
                  <th className="text-right px-6 py-2 font-extrabold text-muted uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-bg/40">
                    <td className="px-6 py-2 text-navy whitespace-nowrap">{fmtDate(e.postingDate)}</td>
                    <td className="px-3 py-2 text-navy whitespace-nowrap">{e.accountNo}{e.accountName ? ` — ${e.accountName}` : ''}</td>
                    <td className="px-3 py-2 text-navy">{e.description || '—'}</td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">{e.documentNo || '—'}</td>
                    <td className={`px-6 py-2 text-right font-semibold whitespace-nowrap ${e.amount < 0 ? 'text-red-600' : 'text-navy'}`}>
                      {e.amount < 0 ? '(' : ''}ETB {fmtAmt(e.amount)}{e.amount < 0 ? ')' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !error && entries.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border" style={{ background: NAVY + '08' }}>
            <p className="text-[11px] text-muted">
              {entries.length > MAX_ROWS ? `Showing most recent ${MAX_ROWS} of ${entries.length} entries` : `${entries.length} entries`}
            </p>
            <p className="text-sm font-extrabold text-navy">
              Total: ETB {fmtAmt(data.total)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
