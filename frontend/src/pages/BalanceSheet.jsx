import { useState, useEffect, useMemo } from 'react'
import { fmtETB, fmtDate } from '../lib/fmt.js'
import { snapshots } from '../lib/api.js'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

const NAVY   = '#02404F'
const TEAL   = '#1FB6A6'
const ORANGE = '#EB7D23'
const GREEN  = '#22C55E'

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-border">
      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black" style={{ color: accent || '#FFFFFF' }}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

// A Total card that expands into its own Non-Current/Current sub-cards on click — same
// StatCard look, just clickable with a chevron, so it reads as a drilldown rather than a
// dead card. `open` is lifted to the parent so the caller decides the default state.
function ExpandableStatCard({ label, value, sub, accent, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="bg-white rounded-2xl p-4 border border-border text-left hover:border-navy/30 transition-colors cursor-pointer"
    >
      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
        <span className="text-[9px]">{open ? '▾' : '▸'}</span>
        {label}
      </p>
      <p className="text-2xl font-black" style={{ color: accent || '#FFFFFF' }}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
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
  // ── Month/Year filter — page-local (unlike the Topbar's hidden global history
  // browser), matching every other filtered page in the app. Balance Sheet has no
  // historical breakdown baked into the live snapshot (it's a point-in-time figure,
  // not a monthly flow), so a specific month/year re-fetches that date's own stored
  // snapshot from /api/snapshots instead of slicing arrays already in `data`.
  const [filterYear, setFilterYear]   = useState('All')
  const [filterMonth, setFilterMonth] = useState('All')
  const [allDates, setAllDates]       = useState([])
  const [histBs, setHistBs]           = useState(null)
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError]     = useState(false)

  useEffect(() => {
    snapshots.dates()
      .then(r => r.ok ? r.json() : [])
      .then(setAllDates)
      .catch(() => {})
  }, [])

  // year → month index → [dates] (dates come back latest-first from the API)
  const byYear = useMemo(() => {
    const acc = {}
    allDates.forEach(d => {
      const dt = new Date(d + 'T12:00:00')
      const y = dt.getFullYear(), m = dt.getMonth()
      if (!acc[y]) acc[y] = {}
      if (!acc[y][m]) acc[y][m] = []
      acc[y][m].push(d)
    })
    return acc
  }, [allDates])
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a)
  const monthsForYear = filterYear !== 'All' ? Object.keys(byYear[filterYear] || {}).map(Number) : []

  // Resolve the filter to a single target date: latest snapshot in the picked month, or
  // latest in the picked year when only Year is set — then fetch that date's own snapshot.
  const targetDate = filterYear === 'All' ? null
    : filterMonth !== 'All' ? (byYear[filterYear]?.[MONTH_NAMES.indexOf(filterMonth)]?.[0] || null)
    : (byYear[filterYear] ? Object.values(byYear[filterYear]).flat().sort().slice(-1)[0] : null)

  useEffect(() => {
    if (!targetDate) { setHistBs(null); setHistError(false); return }
    setHistLoading(true); setHistError(false)
    snapshots.byDate(targetDate)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setHistBs(d?.balanceSheet || null))
      .catch(() => { setHistBs(null); setHistError(true) })
      .finally(() => setHistLoading(false))
  }, [targetDate])

  const isFiltered = filterYear !== 'All'
  const bs = isFiltered ? histBs : (data?.balanceSheet || null)

  // Drilldown expand state for the Total Assets / Total Liabilities KPI cards —
  // collapsed by default so the top row stays compact.
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [liabOpen, setLiabOpen]     = useState(false)

  const filterBar = (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-card flex flex-wrap gap-4 items-end">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Year</span>
        <select
          value={filterYear}
          onChange={e => { setFilterYear(e.target.value === 'All' ? 'All' : Number(e.target.value)); setFilterMonth('All') }}
          className="text-xs font-bold text-navy border border-border rounded-lg px-3 py-2 outline-none bg-white"
        >
          <option value="All">All (Live)</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Month</span>
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          disabled={filterYear === 'All'}
          className="text-xs font-bold text-navy border border-border rounded-lg px-3 py-2 outline-none bg-white disabled:opacity-40"
        >
          <option value="All">All (latest in year)</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={name} disabled={!monthsForYear.includes(i)}>{name}</option>
          ))}
        </select>
      </div>
      {isFiltered && (
        <button
          onClick={() => { setFilterYear('All'); setFilterMonth('All') }}
          className="text-xs font-bold text-muted hover:text-navy px-3 py-2"
        >
          Clear filter
        </button>
      )}
    </div>
  )

  if (histLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">Balance Sheet</h2>
          <p className="text-xs text-muted font-medium">Loading {filterMonth !== 'All' ? `${filterMonth} ` : ''}{filterYear}…</p>
        </div>
        {filterBar}
      </div>
    )
  }

  if (!bs) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">Balance Sheet</h2>
        </div>
        {filterBar}
        <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted text-sm">
          {isFiltered
            ? (histError ? 'Could not load that snapshot.' : `No snapshot available for ${filterMonth !== 'All' ? filterMonth + ' ' : ''}${filterYear}.`)
            : 'No balance sheet data available yet. Sync from Business Central to populate.'}
        </div>
      </div>
    )
  }

  const { sections, ratios, totalAssets, totalLiabilities, equity, currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities } = bs
  const hasSections = sections && (sections.nonCurrentAssets?.rows?.length > 0 || sections.currentAssets?.rows?.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Balance Sheet</h2>
        <p className="text-xs text-muted font-medium">
          As of {fmtDate(bs.asOf)} · source: Business Central
          {isFiltered && ` · closest snapshot to ${filterMonth !== 'All' ? filterMonth + ' ' : ''}${filterYear}`}
        </p>
      </div>

      {filterBar}

      {/* KPI cards — Total Assets / Total Liabilities expand into their Non-Current/Current
          breakdown on click instead of always showing all four at once. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ExpandableStatCard label="Total Assets" value={`ETB ${fmtETB(totalAssets || bs.totalAssetsImplied)}`}
          sub="Fixed + current assets — click to break down" accent="#FFFFFF"
          open={assetsOpen} onToggle={() => setAssetsOpen(o => !o)} />
        <ExpandableStatCard label="Total Liabilities" value={`ETB ${fmtETB(totalLiabilities)}`}
          sub="Current + non-current — click to break down" accent={ORANGE}
          open={liabOpen} onToggle={() => setLiabOpen(o => !o)} />
      </div>
      {assetsOpen && (
        <div className="grid grid-cols-2 gap-4 pl-4 md:pl-8 md:w-1/2">
          <StatCard label="Non-Current Assets" value={`ETB ${fmtETB(nonCurrentAssets)}`}
            sub="Fixed assets net of depreciation" accent={TEAL} />
          <StatCard label="Current Assets" value={`ETB ${fmtETB(currentAssets)}`}
            sub="Cash, receivables, inventory" accent={TEAL} />
        </div>
      )}
      {liabOpen && (
        <div className="grid grid-cols-2 gap-4 pl-4 md:pl-8 md:ml-auto md:w-1/2">
          <StatCard label="Current Liabilities" value={`ETB ${fmtETB(currentLiabilities)}`}
            sub="Due within 12 months" accent={ORANGE} />
          <StatCard label="Non-Current Liabilities" value={`ETB ${fmtETB(nonCurrentLiabilities)}`}
            sub="Due beyond 12 months" accent={ORANGE} />
        </div>
      )}

      {/* Ratio cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Current Ratio" value={ratios?.currentRatio ?? '—'} sub="Current Assets / Current Liabilities" />
        <StatCard label="Quick Ratio" value={ratios?.quickRatio ?? '—'} sub="(Current Assets − Inventory) / Current Liabilities" />
        <StatCard label="Debt / Equity" value={ratios?.debtToEquity ?? '—'} sub="Total Liabilities / Equity" />
      </div>

      {/* Full Balance Sheet statement */}
      {hasSections ? (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Balance Sheet Statement</h3>
            <p className="text-[10px] text-muted mt-0.5">As of {fmtDate(bs.asOf)} · click a section header to expand / collapse</p>
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
            <p className="text-[10px] text-muted mt-0.5">As of {fmtDate(bs.asOf)}</p>
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
