import { useState, useEffect } from 'react'
import { fmtETB, fmtDate } from '../lib/fmt.js'
import { pageFilterSettings } from '../lib/api.js'
import PeriodFilterBar, { usePeriodSelection } from '../components/PeriodFilterBar.jsx'

const NAVY   = '#02404F'
const TEAL   = '#1FB6A6'
const ORANGE = '#EB7D23'
const GREEN  = '#22C55E'

// `delta` is a signed ETB-millions figure (already computed by the caller as current −
// prior) shown as a small vs-prior line under `sub` — only passed in when a Compare To
// baseline is active, same "vs Prior" treatment Financial Performance uses elsewhere.
function StatCard({ label, value, sub, accent, delta, deltaLabel }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-border">
      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black" style={{ color: accent || '#FFFFFF' }}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
      {delta != null && (
        <p className="text-[11px] font-bold mt-0.5" style={{ color: delta >= 0 ? '#22C55E' : '#E5544B' }}>
          {delta >= 0 ? '+' : ''}ETB {fmtETB(delta)} vs {deltaLabel}
        </p>
      )}
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
      className="bg-white rounded-2xl p-4 border border-border text-left hover:border-navy/30 transition-colors cursor-pointer w-full"
    >
      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
        <span className="text-[9px]">{open ? '▾' : '▸'}</span>
        {label}
      </p>
      <p className="text-2xl font-black" style={{ color: accent || '#FFFFFF' }}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
      {delta != null && (
        <p className="text-[11px] font-bold mt-0.5" style={{ color: delta >= 0 ? '#22C55E' : '#E5544B' }}>
          {delta >= 0 ? '+' : ''}ETB {fmtETB(delta)} vs {deltaLabel}
        </p>
      )}
    </button>
  )
}

// Format a raw ETB number (not in millions) with commas and 0 decimals
function fmtRaw(n) {
  if (n == null) return '—'
  return Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function SectionHeader({ label, total, color, expanded, onToggle }) {
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
    </tr>
  )
}

function AccountRow({ name, balance }) {
  return (
    <tr className="border-b border-border/40 hover:bg-bg/40">
      <td className="px-5 py-2 pl-12 text-[13px] font-medium text-navy">{name}</td>
      <td className={`px-5 py-2 text-right text-[13px] font-semibold ${balance < 0 ? 'text-red-600' : 'text-navy'}`}>
        {balance < 0 ? '(' : ''}ETB {fmtRaw(balance)}{balance < 0 ? ')' : ''}
      </td>
    </tr>
  )
}

function SubtotalRow({ label, total, light }) {
  return (
    <tr style={{ background: light ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)' }}>
      <td className="px-5 py-2.5 pl-9 text-[13px] font-bold text-navy">{label}</td>
      <td className="px-5 py-2.5 text-right text-[13px] font-bold text-navy border-t border-border">
        ETB {fmtRaw(total)}
      </td>
    </tr>
  )
}

function GrandTotalRow({ label, total, accent }) {
  const color = accent || '#FFFFFF'
  return (
    <tr style={{ background: (accent || NAVY) + '12' }}>
      <td className="px-5 py-3 font-extrabold text-sm" style={{ color }}>{label}</td>
      <td className="px-5 py-3 text-right font-extrabold text-sm border-t-2" style={{ color, borderColor: color }}>
        ETB {fmtRaw(total)}
      </td>
    </tr>
  )
}

function BsSection({ label, section, color, negate = false, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const rows = section?.rows || []
  const total = section?.total ?? 0

  return (
    <>
      <SectionHeader label={label} total={total} color={color} expanded={expanded} onToggle={() => setExpanded(e => !e)} />
      {expanded && rows.map((r, i) => (
        <AccountRow key={i} name={r.name} balance={r.balance} />
      ))}
    </>
  )
}

export default function BalanceSheet({ data }) {
  const liveBs = data?.balanceSheet || null
  // Trailing 12 months, point-in-time, computed automatically from BC's own dated GL
  // ledger at every sync (see snapshot-builder.js) — not dependent on a historical sync
  // snapshot happening to exist for the exact date picked.
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
  // Account-level detail only exists on the live object (the monthly array is scalar
  // totals only) — the statement table below always reads from here regardless of the
  // period filter, see the note rendered just above it.
  const { sections } = liveBs
  const hasSections = sections && (sections.nonCurrentAssets?.rows?.length > 0 || sections.currentAssets?.rows?.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Balance Sheet</h2>
        <p className="text-xs text-muted font-medium">
          {periodBs
            ? `As of end of ${sel.periodLabel} · source: Business Central`
            : `As of ${fmtDate(liveBs.asOf)} · source: Business Central`}
        </p>
      </div>

      {filterEnabled && monthly.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-4 shadow-card flex flex-wrap items-end justify-between gap-3">
          <PeriodFilterBar sel={sel} mData={mData} />
          {sel.selMonths.length > 0 && (
            <button onClick={sel.clearPeriod} className="text-xs font-bold text-muted hover:text-navy px-3 py-2">
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* KPI cards — Total Assets / Total Liabilities expand into their Non-Current/Current
          breakdown on click instead of always showing all four at once. When a Compare To
          baseline is active, each card also shows its vs-prior-period delta. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ExpandableStatCard label="Total Assets" value={`ETB ${fmtETB(totalAssets || bs.totalAssetsImplied)}`}
          sub="Fixed + current assets — click to break down" accent="#FFFFFF"
          open={assetsOpen} onToggle={() => setAssetsOpen(o => !o)}
          delta={priorBs ? delta(totalAssets, priorBs.totalAssets) : null} deltaLabel={sel.priorLabel} />
        <ExpandableStatCard label="Total Liabilities" value={`ETB ${fmtETB(totalLiabilities)}`}
          sub="Current + non-current — click to break down" accent={ORANGE}
          open={liabOpen} onToggle={() => setLiabOpen(o => !o)}
          delta={priorBs ? delta(totalLiabilities, priorBs.totalLiabilities) : null} deltaLabel={sel.priorLabel} />
      </div>
      {assetsOpen && (
        <div className="grid grid-cols-2 gap-4 pl-4 md:pl-8 md:w-1/2">
          <StatCard label="Non-Current Assets" value={`ETB ${fmtETB(nonCurrentAssets)}`}
            sub="Fixed assets net of depreciation" accent={TEAL}
            delta={priorBs ? delta(nonCurrentAssets, priorBs.nonCurrentAssets) : null} deltaLabel={sel.priorLabel} />
          <StatCard label="Current Assets" value={`ETB ${fmtETB(currentAssets)}`}
            sub="Cash, receivables, inventory" accent={TEAL}
            delta={priorBs ? delta(currentAssets, priorBs.currentAssets) : null} deltaLabel={sel.priorLabel} />
        </div>
      )}
      {liabOpen && (
        <div className="grid grid-cols-2 gap-4 pl-4 md:pl-8 md:ml-auto md:w-1/2">
          <StatCard label="Current Liabilities" value={`ETB ${fmtETB(currentLiabilities)}`}
            sub="Due within 12 months" accent={ORANGE}
            delta={priorBs ? delta(currentLiabilities, priorBs.currentLiabilities) : null} deltaLabel={sel.priorLabel} />
          <StatCard label="Non-Current Liabilities" value={`ETB ${fmtETB(nonCurrentLiabilities)}`}
            sub="Due beyond 12 months" accent={ORANGE}
            delta={priorBs ? delta(nonCurrentLiabilities, priorBs.nonCurrentLiabilities) : null} deltaLabel={sel.priorLabel} />
        </div>
      )}

      {/* Ratio cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Current Ratio" value={ratios?.currentRatio ?? '—'} sub="Current Assets / Current Liabilities" />
        <StatCard label="Quick Ratio" value={ratios?.quickRatio ?? '—'} sub="(Current Assets − Inventory) / Current Liabilities" />
        <StatCard label="Debt / Equity" value={ratios?.debtToEquity ?? '—'} sub="Total Liabilities / Equity" />
      </div>

      {/* Full Balance Sheet statement — always today's live account-level detail; the
          period filter above only re-points the KPI cards, since reconstructing every
          individual account's balance for every past month (rather than just the section
          totals already computed) is a much larger computation than this page needs. */}
      {periodBs && (
        <p className="text-[11px] text-muted -mb-2">
          Account-level detail below always shows today's live figures — the KPI cards above reflect {sel.periodLabel}.
        </p>
      )}
      {hasSections ? (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Balance Sheet Statement</h3>
            <p className="text-[10px] text-muted mt-0.5">As of {fmtDate(liveBs.asOf)} · click a section header to expand / collapse</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {/* ── ASSETS ──────────────────────────────── */}
              <tr style={{ background: NAVY + '10' }}>
                <td colSpan={2} className="px-5 py-2 text-[11px] font-extrabold tracking-widest uppercase" style={{ color: '#FFFFFF' }}>
                  ASSETS
                </td>
              </tr>

              <BsSection label="Non-Current Assets" section={sections.nonCurrentAssets} color={TEAL} />
              <SubtotalRow label="Total Non-Current Assets" total={sections.nonCurrentAssets?.total} />

              <BsSection label="Current Assets" section={sections.currentAssets} color={TEAL} defaultExpanded={false} />
              <SubtotalRow label="Total Current Assets" total={sections.currentAssets?.total} light />

              <GrandTotalRow label="TOTAL ASSETS" total={sections.totalAssets} accent="#FFFFFF" />

              {/* ── LIABILITIES ───────────────────────── */}
              <tr><td colSpan={2} className="py-2" /></tr>
              <tr style={{ background: ORANGE + '10' }}>
                <td colSpan={2} className="px-5 py-2 text-[11px] font-extrabold tracking-widest uppercase" style={{ color: ORANGE }}>
                  LIABILITIES
                </td>
              </tr>

              <BsSection label="Current Liabilities" section={sections.currentLiabilities} color={ORANGE} />
              <SubtotalRow label="Total Current Liabilities" total={sections.currentLiabilities?.total} light />

              <BsSection label="Non-Current Liabilities" section={sections.nonCurrentLiabilities} color={ORANGE} defaultExpanded={false} />
              <SubtotalRow label="Total Non-Current Liabilities" total={sections.nonCurrentLiabilities?.total} />

              <GrandTotalRow label="TOTAL LIABILITIES" total={sections.totalLiabilities} accent={ORANGE} />

              {/* ── EQUITY ────────────────────────────── */}
              <tr><td colSpan={2} className="py-2" /></tr>
              <tr style={{ background: GREEN + '10' }}>
                <td colSpan={2} className="px-5 py-2 text-[11px] font-extrabold tracking-widest uppercase" style={{ color: GREEN }}>
                  EQUITY
                </td>
              </tr>

              <BsSection label="Equity" section={sections.equity} color={GREEN} />
              <GrandTotalRow label="TOTAL EQUITY" total={sections.totalEquity} accent={GREEN} />

              {/* ── CHECK ─────────────────────────────── */}
              <tr><td colSpan={2} className="py-2" /></tr>
              <GrandTotalRow label="TOTAL LIABILITIES + EQUITY" total={sections.totalLiabEquity} accent="#FFFFFF" />
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
