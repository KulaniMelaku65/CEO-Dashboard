import { useEffect, useState } from 'react'
import { fmtETB, fmtDate } from '../lib/fmt.js'
import { cashflow as cashflowApi } from '../lib/api.js'

const NAVY   = '#02404F'
const TEAL   = '#1FB6A6'
const ORANGE = '#EB7D23'
const GREEN  = '#2EBD85'
const RED    = '#E5544B'

// Signed ETB-millions value, red-in-parentheses for negative (same convention the
// Balance Sheet statement uses) — `value` is already in millions (backend's toM()).
function fmtSigned(value) {
  if (value == null) return { text: '—', color: undefined }
  if (value < 0) return { text: `(ETB ${fmtETB(Math.abs(value))})`, color: RED }
  return { text: `ETB ${fmtETB(value)}`, color: undefined }
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-4 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: accent || NAVY }} />
      <div className="pl-2">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-1">{label}</p>
        <p className="text-xl font-extrabold text-navy leading-none mb-1">{value}</p>
        {sub && <p className="text-[10px] text-muted">{sub}</p>}
      </div>
    </div>
  )
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Filter by Period, top-right in a single line — same placement/box style every other
// Finance page uses (Financial Performance, Balance Sheet, P&L by Business Line,
// Corporate Budget), just two plain Year/Month dropdowns instead of the quarter-tree
// control, since this page's period is a single fiscal statement (one year, optionally
// one month within it) rather than a multi-month/quarter selection. Month only enables
// once a year is picked; clearing either resets back to the live snapshot's YTD.
function YearMonthFilter({ year, month, onYear, onMonth, onClear, years }) {
  return (
    <div className="flex flex-wrap items-end gap-2.5 ml-auto">
      <div className="flex flex-col gap-1" style={{ minWidth: 130 }}>
        <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Year</span>
        <select
          value={year ?? ''}
          onChange={e => onYear(e.target.value ? Number(e.target.value) : null)}
          className="bg-white border border-border rounded-xl px-3 py-2 text-xs font-bold text-navy outline-none focus:border-navy"
        >
          <option value="">Live (current)</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1" style={{ minWidth: 130 }}>
        <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Month</span>
        <select
          value={month ?? ''}
          onChange={e => onMonth(e.target.value ? Number(e.target.value) : null)}
          disabled={!year}
          className="bg-white border border-border rounded-xl px-3 py-2 text-xs font-bold text-navy outline-none focus:border-navy disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <option value="">Full year</option>
          {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </div>
      {(year || month) && (
        <button
          onClick={onClear}
          className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-navy hover:border-navy transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

// One row of the statement, matching BC's own "DIRECT CF" account schedule layout
// exactly (same row order/indentation/bold as BC's own report) — section headers
// (no rowNo, bold) render as a colored uppercase heading, blank rows (no rowNo, no
// description) render as spacing, everything else as a line item or bold subtotal.
function StatementRow({ row }) {
  if (!row.rowNo && !row.description) return <tr><td colSpan={2} className="py-1.5" /></tr>

  if (!row.rowNo) {
    // Section header (CASH FROM OPERATING EXPENSES, INVESTING ACTIVITIES, ...) — same
    // tinted-background + white-text pattern the Balance Sheet statement uses, so it
    // stays readable against both the light-mode white card and the dark-mode navy one.
    return (
      <tr style={{ background: NAVY + '10' }}>
        <td colSpan={2} className="px-5 py-2 text-[11px] font-extrabold tracking-widest uppercase" style={{ color: '#FFFFFF' }}>
          {row.description}
        </td>
      </tr>
    )
  }

  const { text, color } = fmtSigned(row.value)
  const pad = 20 + (row.indentation || 0) * 16

  return (
    <tr className={row.bold ? '' : 'border-b border-border/30 hover:bg-bg/40'} style={row.bold ? { background: 'rgba(255,255,255,0.06)' } : undefined}>
      <td className={`py-2 text-[13px] ${row.bold ? 'font-extrabold text-navy' : 'font-medium text-navy'}`} style={{ paddingLeft: pad }}>
        {row.description}
      </td>
      <td className={`px-5 py-2 text-right text-[13px] ${row.bold ? 'font-extrabold text-navy' : 'font-semibold text-navy'}`} style={color ? { color } : undefined}>
        {text}
      </td>
    </tr>
  )
}

export default function CashFlow({ data }) {
  const liveCf = data?.cashflow?.directStatement

  // Year/Month filter — null/null means "live" (the snapshot's own current-year-to-
  // date statement, data.cashflow.directStatement, no extra fetch needed). Picking a
  // year (optionally + month) fetches that period fresh from /api/cashflow, since the
  // snapshot itself only ever carries the current year.
  const [year, setYear]       = useState(null)
  const [month, setMonth]     = useState(null)
  const [filteredCf, setFilteredCf] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!year) { setFilteredCf(null); setError(''); return }
    let cancelled = false
    setLoading(true); setError('')
    cashflowApi.get(year, month)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || 'Failed to load.'))))
      .then(j => { if (!cancelled) setFilteredCf(j) })
      .catch(e => { if (!cancelled) setError(typeof e.message === 'string' ? e.message : 'Failed to load cash flow for that period.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year, month])

  // Years offered go back to the earliest year BC has any ledger activity for
  // (end of 2024) through the current calendar year.
  const currentYear = new Date().getFullYear()
  const years = []
  for (let y = currentYear; y >= 2024; y--) years.push(y)

  const cf = year ? filteredCf : liveCf
  const rows = cf?.rows || []
  const checkOk = cf?.check != null && Math.abs(cf.check) < 1 // within ETB 1M of reconciling

  return (
    <div className="space-y-6">
      {/* Header + filter — same layout as Financial Performance: title on the left,
          the period filter inline at the top-right, one line, no separate card. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">Cashflow</h2>
          <p className="text-xs text-muted font-medium">
            {cf
              ? <>Direct Method Statement · {fmtDate(cf.periodStart)} – {fmtDate(cf.asOf)} · source: Business Central</>
              : 'Direct Method Statement · source: Business Central'}
          </p>
        </div>
        <YearMonthFilter
          year={year} month={month}
          onYear={y => { setYear(y); setMonth(null) }}
          onMonth={setMonth}
          onClear={() => { setYear(null); setMonth(null) }}
          years={years}
        />
      </div>

      {loading && (
          <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted text-sm">
            Loading cash flow for {month ? `${MONTH_NAMES[month - 1]} ` : ''}{year}…
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-2xl border border-border p-10 text-center text-sm" style={{ color: RED }}>
            {error}
          </div>
        )}

        {!loading && !error && (!cf || rows.length === 0) && (
          <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted text-sm">
            No cash flow data available for this period yet.
          </div>
        )}

        {!loading && !error && cf && rows.length > 0 && (
          <>
            {/* KPI cards — the three activity totals plus the net change they roll up to */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Operating Activities" value={fmtSigned(cf.netCashOperating).text} accent={TEAL} />
              <StatCard label="Investing Activities" value={fmtSigned(cf.netCashInvesting).text} accent={ORANGE} />
              <StatCard label="Financing Activities" value={fmtSigned(cf.netCashFinancing).text} accent={NAVY} />
              <StatCard
                label="Total Change in Cash"
                value={fmtSigned(cf.totalChange).text}
                accent={(cf.totalChange || 0) >= 0 ? GREEN : RED}
                sub="Operating + Investing + Financing"
              />
            </div>

            {/* Opening → calculated closing → actual ending cash, plus BC's own
                reconciliation check between them — surfaced rather than hidden, same
                as BC's own report. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Opening Cash" value={fmtSigned(cf.openingCash).text} accent={NAVY} sub={`As of ${fmtDate(cf.periodStart)}`} />
              <StatCard label="Calculated Closing Cash" value={fmtSigned(cf.calculatedClosingCash).text} accent={NAVY} sub="Opening + Total Change" />
              <StatCard label="Actual Ending Cash (ERP)" value={fmtSigned(cf.actualEndingCash).text} accent={TEAL} sub="Live bank + pettycash balance" />
              <StatCard
                label="Check"
                value={fmtSigned(cf.check).text}
                accent={checkOk ? GREEN : RED}
                sub={checkOk ? 'Reconciles' : 'Calculated vs. actual — does not reconcile'}
              />
            </div>

            {!checkOk && (
              <div className="bg-white rounded-2xl border p-4 flex items-start gap-2.5" style={{ borderColor: RED + '40', background: RED + '08' }}>
                <span className="text-sm" style={{ color: RED }}>ⓘ</span>
                <p className="text-[11px] font-medium text-navy leading-relaxed">
                  <strong>Calculated Closing Cash doesn't match the Actual Ending Cash balance in BC</strong> (ETB {fmtETB(Math.abs(cf.check))} gap) —
                  this is Business Central's own schedule and reconciliation (the DIRECT CF account schedule's own "CHECK" row),
                  not something computed differently here. It points to the Direct Cash Flow schedule's own account-range
                  mapping in BC needing review, since the same gap shows up running the schedule directly in BC.
                </p>
              </div>
            )}

            {/* Full statement, same row order BC's own "DIRECT CF" schedule defines */}
            <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-navy">Cashflow Statement</h3>
                <p className="text-[10px] text-muted mt-0.5">
                  {fmtDate(cf.periodStart)} – {fmtDate(cf.asOf)} · amounts in ETB
                </p>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {rows.map(row => <StatementRow key={row.lineNo} row={row} />)}
                </tbody>
              </table>
            </div>
          </>
        )}
    </div>
  )
}
