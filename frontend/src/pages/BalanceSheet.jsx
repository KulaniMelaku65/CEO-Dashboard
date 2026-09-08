import { useState } from 'react'
import { fmtETB, fmtDate } from '../lib/fmt.js'

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
  const bs = data?.balanceSheet || null

  if (!bs) {
    return (
      <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted text-sm">
        No balance sheet data available yet. Sync from Business Central to populate.
      </div>
    )
  }

  const { sections, ratios, totalAssets, totalLiabilities, equity, currentAssets, nonCurrentAssets } = bs
  const hasSections = sections && (sections.nonCurrentAssets?.rows?.length > 0 || sections.currentAssets?.rows?.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Balance Sheet</h2>
        <p className="text-xs text-muted font-medium">As of {fmtDate(bs.asOf)} · source: Business Central</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Assets" value={`ETB ${fmtETB(totalAssets || bs.totalAssetsImplied)}`}
          sub="Fixed + current assets" accent="#FFFFFF" />
        <StatCard label="Non-Current Assets" value={`ETB ${fmtETB(nonCurrentAssets)}`}
          sub="Fixed assets net of depreciation" accent={TEAL} />
        <StatCard label="Current Assets" value={`ETB ${fmtETB(currentAssets)}`}
          sub="Cash, receivables, inventory" accent={TEAL} />
        <StatCard label="Total Liabilities" value={`ETB ${fmtETB(totalLiabilities)}`}
          sub="Current + non-current" accent={ORANGE} />
      </div>

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
