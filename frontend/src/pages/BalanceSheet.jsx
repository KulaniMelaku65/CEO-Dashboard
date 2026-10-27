import { useState, useEffect } from 'react'
import { fmtETB, fmtDate } from '../lib/fmt.js'
import { pageFilterSettings } from '../lib/api.js'
import PeriodFilterBar, { usePeriodSelection } from '../components/PeriodFilterBar.jsx'
import GLDrilldownPanel from '../components/GLDrilldownPanel.jsx'

const NAVY   = '#02404F'
const TEAL   = '#1FB6A6'
const ORANGE = '#EB7D23'
const GREEN  = '#22C55E'

// Same KPI card language as P&L by Business Line / Financial Performance — a colored
// left accent bar + navy value text (readable on the card in both light and dark mode,
// since "text-navy" is a class index.css's .dark-app remaps, unlike a hardcoded inline
// white) — instead of the plain white-card-with-colored-value-text this page had before,
// which also only worked by coincidence in dark mode (default-colored value text was
// literally inline white-on-white in light mode whenever no accent was passed).
// `delta` is a signed ETB-millions figure (already computed by the caller as current −
// prior) shown as a small vs-prior line with an ▲/▼ arrow — only passed in when a
// Compare To baseline is active, matching how BusinessLinePL.jsx shows "vs budget"/"vs
// prior" deltas.
function StatCard({ label, value, sub, accent, delta, deltaLabel }) {
  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-4 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: accent || NAVY }} />
      <div className="pl-2">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-1">{label}</p>
        <p className="text-xl font-extrabold text-navy leading-none mb-1">{value}</p>
        {sub && <p className="text-[10px] text-muted">{sub}</p>}
        {delta != null && (
          <p className="text-[10px] font-semibold mt-1" style={{ color: delta >= 0 ? '#2EBD85' : '#E5544B' }}>
            {delta >= 0 ? '▲' : '▼'} ETB {fmtETB(Math.abs(delta))} vs {deltaLabel}
          </p>
        )}
      </div>
    </div>
  )
}

// A Total card that expands into its own Non-Current/Current sub-cards on click — same
// StatCard look, just clickable with a chevron, so it reads as a drilldown rather than a
// dead card. `open` is lifted to the parent so the caller decides the default state.
function ExpandableStatCard({ label, value, sub, accent, open, onToggle, delta, deltaLabel }) {
  return (
    <button
      onClick={onToggle}
      className="bg-white rounded-2xl border border-border shadow-card p-4 relative overflow-hidden text-left hover:border-navy/30 transition-colors cursor-pointer w-full"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: accent || NAVY }} />
      <div className="pl-2">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-1 flex items-center gap-1.5">
          <span className="text-[9px]">{open ? '▾' : '▸'}</span>
          {label}
        </p>
        <p className="text-xl font-extrabold text-navy leading-none mb-1">{value}</p>
        {sub && <p className="text-[10px] text-muted">{sub}</p>}
        {delta != null && (
          <p className="text-[10px] font-semibold mt-1" style={{ color: delta >= 0 ? '#2EBD85' : '#E5544B' }}>
            {delta >= 0 ? '▲' : '▼'} ETB {fmtETB(Math.abs(delta))} vs {deltaLabel}
          </p>
        )}
      </div>
    </button>
  )
}

// Format a raw ETB number (not in millions) with commas and 0 decimals
function fmtRaw(n) {
  if (n == null) return '—'
  return Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function SectionHeader({ label, total, color, expanded, onToggle, showCompare }) {
  return (
    <tr
      className="cursor-pointer select-none"
      style={{ background: color + '18' }}
      onClick={onToggle}
    >
      <td className="px-5 py-3 font-extrabold text-sm" style={{ color }}>
        <span className="mr-2 text-xs">{expanded ? '▼' : '▶'}</span>
        {label}
      </td>
      <td className="px-5 py-3 text-right font-extrabold text-sm" style={{ color }}>
        ETB {fmtRaw(total)}
      </td>
      {showCompare && <td />}
    </tr>
  )
}

// A plain (non-red/green) compare-period cell — a real financial statement's "prior
// period" column is just the other period's figure side by side, not a judgment call
// about whether the change is good or bad (the KPI cards above already do that).
function CompareCell({ value }) {
  return (
    <td className="px-5 py-2 text-right text-[13px] text-muted align-middle">
      {value == null ? '—' : `${value < 0 ? '(' : ''}ETB ${fmtRaw(value)}${value < 0 ? ')' : ''}`}
    </td>
  )
}

// `onDrill`, when passed along with a non-empty `accounts` list, makes the row clickable
// to toggle the GL drilldown panel open directly beneath it, in place — same
// click-a-number-to-see-the-ledger behavior BC itself has. Only available when the
// statement is showing live (today's) figures — see the caption above the table.
// `drillOpen`/`asOf`/`colSpan` are only used when the row is actually clickable.
function AccountRow({ name, balance, accounts, onDrill, compareValue, showCompare, drillOpen, asOf, colSpan }) {
  const clickable = onDrill && accounts?.length > 0
  return (
    <>
      <tr
        className={`border-b border-border/40 hover:bg-bg/40 ${clickable ? 'cursor-pointer' : ''}`}
        onClick={clickable ? () => onDrill(name, accounts) : undefined}
      >
        <td className="px-5 py-2 pl-12 text-[13px] font-medium text-navy">{name}</td>
        <td className={`px-5 py-2 text-right text-[13px] font-semibold ${balance < 0 ? 'text-red-600' : 'text-navy'} ${clickable ? 'underline decoration-dotted underline-offset-2' : ''}`}>
          {balance < 0 ? '(' : ''}ETB {fmtRaw(balance)}{balance < 0 ? ')' : ''}
        </td>
        {showCompare && <CompareCell value={compareValue} />}
      </tr>
      {drillOpen && <GLDrilldownPanel colSpan={colSpan} label={name} accounts={accounts} asOf={asOf} onClose={() => onDrill(name, accounts)} />}
    </>
  )
}

function SubtotalRow({ label, total, light, accounts, onDrill, compareValue, showCompare, drillOpen, asOf, colSpan }) {
  const clickable = onDrill && accounts?.length > 0
  return (
    <>
      <tr
        className={clickable ? 'cursor-pointer hover:bg-white/5' : ''}
        style={{ background: light ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)' }}
        onClick={clickable ? () => onDrill(label, accounts) : undefined}
      >
        <td className="px-5 py-2.5 pl-9 text-[13px] font-bold text-navy">{label}</td>
        <td className={`px-5 py-2.5 text-right text-[13px] font-bold text-navy border-t border-border ${clickable ? 'underline decoration-dotted underline-offset-2' : ''}`}>
          ETB {fmtRaw(total)}
        </td>
        {showCompare && <CompareCell value={compareValue} />}
      </tr>
      {drillOpen && <GLDrilldownPanel colSpan={colSpan} label={label} accounts={accounts} asOf={asOf} onClose={() => onDrill(label, accounts)} />}
    </>
  )
}

function GrandTotalRow({ label, total, accent, accounts, onDrill, compareValue, showCompare, drillOpen, asOf, colSpan }) {
  const color = accent || '#FFFFFF'
  const clickable = onDrill && accounts?.length > 0
  return (
    <>
      <tr
        className={clickable ? 'cursor-pointer hover:brightness-110' : ''}
        style={{ background: (accent || NAVY) + '12' }}
        onClick={clickable ? () => onDrill(label, accounts) : undefined}
      >
        <td className="px-5 py-3 font-extrabold text-sm" style={{ color }}>{label}</td>
        <td className={`px-5 py-3 text-right font-extrabold text-sm border-t-2 ${clickable ? 'underline decoration-dotted underline-offset-2' : ''}`} style={{ color, borderColor: color }}>
          ETB {fmtRaw(total)}
        </td>
        {showCompare && <CompareCell value={compareValue} />}
      </tr>
      {drillOpen && <GLDrilldownPanel colSpan={colSpan} label={label} accounts={accounts} asOf={asOf} onClose={() => onDrill(label, accounts)} />}
    </>
  )
}

function BsSection({ label, section, color, defaultExpanded = true, onDrill, compareRows, showCompare, drillKey, asOf, colSpan }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const rows = section?.rows || []
  const total = section?.total ?? 0
  const compareByName = {}
  ;(compareRows || []).forEach(r => { compareByName[r.name] = r.balance })

  return (
    <>
      <SectionHeader label={label} total={total} color={color} expanded={expanded} onToggle={() => setExpanded(e => !e)} showCompare={showCompare} />
      {expanded && rows.map((r, i) => (
        <AccountRow key={i} name={r.name} balance={r.balance} accounts={r.accounts} onDrill={onDrill}
          compareValue={compareByName[r.name]} showCompare={showCompare}
          drillOpen={drillKey === r.name} asOf={asOf} colSpan={colSpan} />
      ))}
    </>
  )
}

export default function BalanceSheet({ data }) {
  const liveBs = data?.balanceSheet || null
  // Trailing 24 months, point-in-time, computed automatically from BC's own dated GL
  // ledger at every sync (see snapshot-builder.js) — not dependent on a historical sync
  // snapshot happening to exist for the exact date picked. 24 (not 12) so a recent
  // month's Compare To can reach the same month a year earlier for YoY comparison.
  const monthly = liveBs?.monthly || []
  const mData = monthly.map(m => ({ label: m.label }))
  const sel = usePeriodSelection(mData)

  // Admin-controlled: Admin → "Period Filter — Pages" decides which pages show this bar
  // at all (off by default everywhere). Balance Sheet works fine without it (just shows
  // today's live figures, as before this existed).
  const [filterEnabled, setFilterEnabled] = useState(false)
  useEffect(() => {
    pageFilterSettings.list()
      .then(r => r.ok ? r.json() : [])
      .then(ids => setFilterEnabled(ids.includes('balance-sheet')))
      .catch(() => {})
  }, [])

  // Drilldown expand state for the Total Assets / Total Liabilities KPI cards —
  // collapsed by default so the top row stays compact.
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [liabOpen, setLiabOpen]     = useState(false)

  // GL drilldown panel — toggled by clicking any row/section/grand-total in the
  // statement table below (every one of them carries the GL account numbers it's built
  // from). Expands in place directly under whichever row was clicked, one at a time —
  // clicking the same row again closes it, clicking a different one switches to that.
  const [drillKey, setDrillKey] = useState(null) // the open row's own label, or null
  const toggleDrill = (label) => setDrillKey(cur => cur === label ? null : label)

  if (!liveBs) {
    return (
      <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted text-sm">
        No balance sheet data available yet. Sync from Business Central to populate.
      </div>
    )
  }

  // Balance Sheet is a point-in-time statement, not a flow — so "selected period" means
  // "as of the end of that period" rather than summed across it. A quarter or an
  // arbitrary multi-month selection resolves to its latest month; YTD/no selection keeps
  // today's precise live figures (not the monthly array's approximation, which also feeds
  // ratios/ a 12-month cap — the live figures have neither limitation).
  const latestOf = (idxs) => idxs && idxs.length ? monthly[Math.max(...idxs)] : null
  const periodBs = sel.selMonths.length > 0 ? latestOf(sel.selMonths) : null
  const bs = periodBs || liveBs
  const priorBs = latestOf(sel.priorMonths)

  const delta = (curr, prior) => (curr == null || prior == null) ? null : +(curr - prior).toFixed(1)

  const { ratios, totalAssets, totalLiabilities, equity, currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities } = bs
  const showCompare = !!priorBs

  // Statement rows: live account-level detail (with GL-drilldown account lists) when no
  // historical period is selected; the selected month's own per-account breakdown
  // (sectionsRows, added to snapshot-builder.js's monthly computation) otherwise — so the
  // statement now follows the same period the KPI cards above it do, instead of always
  // being "today" regardless of the filter. Historical rows don't carry GL account
  // numbers (only scalar balances), so drilldown stays a live-only feature.
  const sumRows = (rows) => (rows || []).reduce((s, r) => s + r.balance, 0)
  const wrapHistorical = (rows) => ({ rows: rows || [], total: sumRows(rows), accounts: [] })
  const sections = periodBs
    ? {
        nonCurrentAssets:      wrapHistorical(periodBs.sectionsRows?.nonCurrentAssets),
        currentAssets:         wrapHistorical(periodBs.sectionsRows?.currentAssets),
        currentLiabilities:    wrapHistorical(periodBs.sectionsRows?.currentLiabilities),
        nonCurrentLiabilities: wrapHistorical(periodBs.sectionsRows?.nonCurrentLiabilities),
        equity:                wrapHistorical(periodBs.sectionsRows?.equity)
      }
    : liveBs.sections
  const hasSections = sections && (sections.nonCurrentAssets?.rows?.length > 0 || sections.currentAssets?.rows?.length > 0)
  const stmtTotalAssets      = (sections?.nonCurrentAssets?.total || 0) + (sections?.currentAssets?.total || 0)
  const stmtTotalLiabilities = (sections?.currentLiabilities?.total || 0) + (sections?.nonCurrentLiabilities?.total || 0)
  const stmtTotalEquity      = sections?.equity?.total || 0

  // Compare column: the prior period's own sectionsRows, same shape regardless of
  // whether the primary column is live or historical.
  const compareOf = (key) => priorBs?.sectionsRows?.[key] || null
  const compareTotalAssets      = priorBs ? sumRows(compareOf('nonCurrentAssets')) + sumRows(compareOf('currentAssets')) : null
  const compareTotalLiabilities = priorBs ? sumRows(compareOf('currentLiabilities')) + sumRows(compareOf('nonCurrentLiabilities')) : null
  const compareTotalEquity      = priorBs ? sumRows(compareOf('equity')) : null
  const stmtColSpan = showCompare ? 3 : 2

  return (
    <div className="space-y-6">
      {/* Header + filter — same layout as Financial Performance: title on the left,
          the period filter inline at the top-right, no separate boxed card around it. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">Balance Sheet</h2>
          <p className="text-xs text-muted font-medium">
            {periodBs
              ? `As of end of ${sel.periodLabel} · source: Business Central`
              : `As of ${fmtDate(liveBs.asOf)} · source: Business Central`}
          </p>
        </div>
        {filterEnabled && monthly.length > 0 && (
          // ml-auto: keeps this group pinned to the right once it wraps onto its own
          // line (e.g. once Clear filters appears and widens it) — matches Financial
          // Performance's header row, where a lone wrapped flex item would otherwise
          // default to the line's left edge under justify-between.
          <div className="flex flex-wrap items-end gap-2.5 ml-auto">
            <PeriodFilterBar sel={sel} mData={mData} />
            {sel.selMonths.length > 0 && (
              <button
                onClick={sel.clearPeriod}
                className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-navy hover:border-navy transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPI cards — Total Assets / Total Liabilities expand into their own Non-Current/
          Current sub-cards directly beneath them (each kept in its own grid column, so
          the two groups stay aligned under their own parent instead of one floating into
          empty space when only one side is expanded). When a Compare To baseline is
          active, every card also shows its vs-prior-period delta. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <ExpandableStatCard label="Total Assets" value={`ETB ${fmtETB(totalAssets || bs.totalAssetsImplied)}`}
            sub="Fixed + current assets — click to break down" accent={NAVY}
            open={assetsOpen} onToggle={() => setAssetsOpen(o => !o)}
            delta={priorBs ? delta(totalAssets, priorBs.totalAssets) : null} deltaLabel={sel.priorLabel} />
          {assetsOpen && (
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Non-Current Assets" value={`ETB ${fmtETB(nonCurrentAssets)}`}
                sub="Fixed assets net of depreciation" accent={TEAL}
                delta={priorBs ? delta(nonCurrentAssets, priorBs.nonCurrentAssets) : null} deltaLabel={sel.priorLabel} />
              <StatCard label="Current Assets" value={`ETB ${fmtETB(currentAssets)}`}
                sub="Cash, receivables, inventory" accent={TEAL}
                delta={priorBs ? delta(currentAssets, priorBs.currentAssets) : null} deltaLabel={sel.priorLabel} />
            </div>
          )}
        </div>
        <div className="space-y-4">
          <ExpandableStatCard label="Total Liabilities" value={`ETB ${fmtETB(totalLiabilities)}`}
            sub="Current + non-current — click to break down" accent={ORANGE}
            open={liabOpen} onToggle={() => setLiabOpen(o => !o)}
            delta={priorBs ? delta(totalLiabilities, priorBs.totalLiabilities) : null} deltaLabel={sel.priorLabel} />
          {liabOpen && (
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Current Liabilities" value={`ETB ${fmtETB(currentLiabilities)}`}
                sub="Due within 12 months" accent={ORANGE}
                delta={priorBs ? delta(currentLiabilities, priorBs.currentLiabilities) : null} deltaLabel={sel.priorLabel} />
              <StatCard label="Non-Current Liabilities" value={`ETB ${fmtETB(nonCurrentLiabilities)}`}
                sub="Due beyond 12 months" accent={ORANGE}
                delta={priorBs ? delta(nonCurrentLiabilities, priorBs.nonCurrentLiabilities) : null} deltaLabel={sel.priorLabel} />
            </div>
          )}
        </div>
      </div>

      {/* Ratio cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Current Ratio" value={ratios?.currentRatio ?? '—'} sub="Current Assets / Current Liabilities" />
        <StatCard label="Quick Ratio" value={ratios?.quickRatio ?? '—'} sub="(Current Assets − Inventory) / Current Liabilities" />
        <StatCard label="Debt / Equity" value={ratios?.debtToEquity ?? '—'} sub="Total Liabilities / Equity" />
      </div>

      {/* Full Balance Sheet statement — now follows the same period the KPI cards above
          do (a historical month's own account breakdown when one is selected, GL
          drilldown only available on the live/today view since historical rows don't
          carry GL account numbers), plus a Compare To column when that's active. */}
      {periodBs && (
        <p className="text-[11px] text-muted -mb-2">
          Showing {sel.periodLabel}'s own figures below — GL drilldown (click any figure)
          is only available on the live view; clear the period filter to use it.
        </p>
      )}
      {hasSections ? (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Balance Sheet Statement</h3>
            <p className="text-[10px] text-muted mt-0.5">
              {periodBs ? `As of end of ${sel.periodLabel}` : `As of ${fmtDate(liveBs.asOf)}`}
              {showCompare && ` vs ${sel.priorLabel}`} · click a section header to expand / collapse
              {!periodBs && ' · click any figure to see its GL entries'}
            </p>
          </div>
          <table className="w-full text-sm">
            {showCompare && (
              <thead>
                <tr className="border-b border-border">
                  <td className="px-5 py-1.5" />
                  <td className="px-5 py-1.5 text-right text-[10px] font-extrabold text-muted uppercase tracking-wider">
                    {periodBs ? sel.periodLabel : 'Live'}
                  </td>
                  <td className="px-5 py-1.5 text-right text-[10px] font-extrabold text-muted uppercase tracking-wider">{sel.priorLabel}</td>
                </tr>
              </thead>
            )}
            <tbody>
              {/* ── ASSETS ──────────────────────────────── */}
              <tr style={{ background: NAVY + '10' }}>
                <td colSpan={showCompare ? 3 : 2} className="px-5 py-2 text-[11px] font-extrabold tracking-widest uppercase" style={{ color: '#FFFFFF' }}>
                  ASSETS
                </td>
              </tr>

              <BsSection label="Non-Current Assets" section={sections.nonCurrentAssets} color={TEAL} onDrill={toggleDrill}
                compareRows={compareOf('nonCurrentAssets')} showCompare={showCompare} drillKey={drillKey} asOf={liveBs.asOf} colSpan={stmtColSpan} />
              <SubtotalRow label="Total Non-Current Assets" total={sections.nonCurrentAssets?.total} accounts={sections.nonCurrentAssets?.accounts} onDrill={toggleDrill}
                compareValue={priorBs ? sumRows(compareOf('nonCurrentAssets')) : null} showCompare={showCompare}
                drillOpen={drillKey === 'Total Non-Current Assets'} asOf={liveBs.asOf} colSpan={stmtColSpan} />

              <BsSection label="Current Assets" section={sections.currentAssets} color={TEAL} defaultExpanded={false} onDrill={toggleDrill}
                compareRows={compareOf('currentAssets')} showCompare={showCompare} drillKey={drillKey} asOf={liveBs.asOf} colSpan={stmtColSpan} />
              <SubtotalRow label="Total Current Assets" total={sections.currentAssets?.total} light accounts={sections.currentAssets?.accounts} onDrill={toggleDrill}
                compareValue={priorBs ? sumRows(compareOf('currentAssets')) : null} showCompare={showCompare}
                drillOpen={drillKey === 'Total Current Assets'} asOf={liveBs.asOf} colSpan={stmtColSpan} />

              <GrandTotalRow label="TOTAL ASSETS" total={stmtTotalAssets} accent="#FFFFFF" accounts={sections.totalAssetsAccounts} onDrill={toggleDrill}
                compareValue={compareTotalAssets} showCompare={showCompare}
                drillOpen={drillKey === 'TOTAL ASSETS'} asOf={liveBs.asOf} colSpan={stmtColSpan} />

              {/* ── LIABILITIES ───────────────────────── */}
              <tr><td colSpan={stmtColSpan} className="py-2" /></tr>
              <tr style={{ background: ORANGE + '10' }}>
                <td colSpan={stmtColSpan} className="px-5 py-2 text-[11px] font-extrabold tracking-widest uppercase" style={{ color: ORANGE }}>
                  LIABILITIES
                </td>
              </tr>

              <BsSection label="Current Liabilities" section={sections.currentLiabilities} color={ORANGE} onDrill={toggleDrill}
                compareRows={compareOf('currentLiabilities')} showCompare={showCompare} drillKey={drillKey} asOf={liveBs.asOf} colSpan={stmtColSpan} />
              <SubtotalRow label="Total Current Liabilities" total={sections.currentLiabilities?.total} light accounts={sections.currentLiabilities?.accounts} onDrill={toggleDrill}
                compareValue={priorBs ? sumRows(compareOf('currentLiabilities')) : null} showCompare={showCompare}
                drillOpen={drillKey === 'Total Current Liabilities'} asOf={liveBs.asOf} colSpan={stmtColSpan} />

              <BsSection label="Non-Current Liabilities" section={sections.nonCurrentLiabilities} color={ORANGE} defaultExpanded={false} onDrill={toggleDrill}
                compareRows={compareOf('nonCurrentLiabilities')} showCompare={showCompare} drillKey={drillKey} asOf={liveBs.asOf} colSpan={stmtColSpan} />
              <SubtotalRow label="Total Non-Current Liabilities" total={sections.nonCurrentLiabilities?.total} accounts={sections.nonCurrentLiabilities?.accounts} onDrill={toggleDrill}
                compareValue={priorBs ? sumRows(compareOf('nonCurrentLiabilities')) : null} showCompare={showCompare}
                drillOpen={drillKey === 'Total Non-Current Liabilities'} asOf={liveBs.asOf} colSpan={stmtColSpan} />

              <GrandTotalRow label="TOTAL LIABILITIES" total={stmtTotalLiabilities} accent={ORANGE} accounts={sections.totalLiabilitiesAccounts} onDrill={toggleDrill}
                compareValue={compareTotalLiabilities} showCompare={showCompare}
                drillOpen={drillKey === 'TOTAL LIABILITIES'} asOf={liveBs.asOf} colSpan={stmtColSpan} />

              {/* ── EQUITY ────────────────────────────── */}
              <tr><td colSpan={stmtColSpan} className="py-2" /></tr>
              <tr style={{ background: GREEN + '10' }}>
                <td colSpan={stmtColSpan} className="px-5 py-2 text-[11px] font-extrabold tracking-widest uppercase" style={{ color: GREEN }}>
                  EQUITY
                </td>
              </tr>

              <BsSection label="Equity" section={sections.equity} color={GREEN} onDrill={toggleDrill}
                compareRows={compareOf('equity')} showCompare={showCompare} drillKey={drillKey} asOf={liveBs.asOf} colSpan={stmtColSpan} />
              <GrandTotalRow label="TOTAL EQUITY" total={stmtTotalEquity} accent={GREEN} accounts={sections.equity?.accounts} onDrill={toggleDrill}
                compareValue={compareTotalEquity} showCompare={showCompare}
                drillOpen={drillKey === 'TOTAL EQUITY'} asOf={liveBs.asOf} colSpan={stmtColSpan} />

              {/* ── CHECK ─────────────────────────────── */}
              <tr><td colSpan={stmtColSpan} className="py-2" /></tr>
              <GrandTotalRow label="TOTAL LIABILITIES + EQUITY" total={stmtTotalLiabilities + stmtTotalEquity} accent="#FFFFFF"
                accounts={[...new Set([...(sections.totalLiabilitiesAccounts || []), ...(sections.equity?.accounts || [])])]} onDrill={toggleDrill}
                compareValue={showCompare ? compareTotalLiabilities + compareTotalEquity : null} showCompare={showCompare}
                drillOpen={drillKey === 'TOTAL LIABILITIES + EQUITY'} asOf={liveBs.asOf} colSpan={stmtColSpan} />
            </tbody>
          </table>
        </div>
      ) : (
        /* Fallback summary when sections aren't available */
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Balance Sheet Summary</h3>
            <p className="text-[10px] text-muted mt-0.5">As of {fmtDate(liveBs.asOf)}</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-border/40">
                <td className="px-5 py-2.5 font-medium text-navy">Non-Current Assets</td>
                <td className="px-5 py-2.5 text-right font-semibold text-navy">ETB {fmtETB(nonCurrentAssets)}</td>
              </tr>
              <tr className="border-b border-border/40">
                <td className="px-5 py-2.5 font-medium text-navy">Current Assets</td>
                <td className="px-5 py-2.5 text-right font-semibold text-navy">ETB {fmtETB(currentAssets)}</td>
              </tr>
              <tr className="bg-bg/60 border-b border-border/40">
                <td className="px-5 py-2.5 font-extrabold text-navy">Total Assets</td>
                <td className="px-5 py-2.5 text-right font-extrabold text-navy">ETB {fmtETB(totalAssets || bs.totalAssetsImplied)}</td>
              </tr>
              <tr className="border-b border-border/40">
                <td className="px-5 py-2.5 font-medium text-navy">Current Liabilities</td>
                <td className="px-5 py-2.5 text-right font-semibold text-navy">ETB {fmtETB(bs.currentLiabilities)}</td>
              </tr>
              <tr className="bg-bg/60 border-b border-border/40">
                <td className="px-5 py-2.5 font-extrabold text-navy">Total Liabilities</td>
                <td className="px-5 py-2.5 text-right font-extrabold text-navy">ETB {fmtETB(totalLiabilities)}</td>
              </tr>
              <tr className="bg-bg/60">
                <td className="px-5 py-2.5 font-extrabold text-navy">Equity</td>
                <td className="px-5 py-2.5 text-right font-extrabold text-navy">ETB {fmtETB(equity)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
