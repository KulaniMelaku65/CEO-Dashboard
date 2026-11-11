import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import {
  NAVY, TEAL, ORANGE, RED, GREEN, DTEAL, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtMoney, fmtInt, fmtDay, fmtMonth, monthAxis, truncateLabel, legendFormatter,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData,
} from './shared.jsx'

const utilColor = p => (!p ? '#6B7780' : p > 100 ? RED : p >= 80 ? ORANGE : GREEN)

function BudgetCard({ b, selected, onClick }) {
  const pct = b.utilizationPct
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-border shadow-card p-4 text-left transition-transform"
      style={{ boxShadow: selected ? `0 0 0 2px ${NAVY}` : undefined, transform: selected ? 'scale(1.01)' : 'none' }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-widest font-bold text-muted">Budget {b.name}</p>
        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: 'var(--tone-muted-bg)', color: 'var(--tbl-fg)' }}>{b.currency}</span>
      </div>
      <p className="text-ink font-black text-xl tabular-nums leading-none">{fmtMoney(b.committed, b.currency)}</p>
      <p className="text-[11px] text-muted mt-1">committed of {fmtMoney(b.allocated, b.currency)} allocated</p>
      <div className="h-2 rounded-full mt-3 overflow-hidden" style={{ background: 'var(--tone-muted-bg)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct || 0, 100)}%`, background: utilColor(pct) }} />
      </div>
      <p className="text-[11px] font-bold mt-1.5" style={{ color: utilColor(pct) }}>{pct == null ? '—' : `${pct.toFixed(1)}% utilised`}</p>
      <p className="text-[10px] text-muted mt-0.5">{fmtDay(b.dateFrom)} – {fmtDay(b.dateTo)}</p>
    </button>
  )
}

function Body({ proc, data }) {
  const budgets = proc.budget.budgets
  const [sel, setSel] = useState(budgets[0]?.name)
  const b = budgets.find(x => x.name === sel) || budgets[0]
  const dimNames = data?.dimensionNames || {}
  const unitName = u => (b.currency === 'USD' ? u : dimNames[u] || u)
  const noCommitments = b.committed === 0

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Each budget is shown in its own currency — they are never added together">
        Budgets 10.x are the SAFEE programme budgets, held in <strong>USD</strong> (their commitment entries carry a matching ETB amount at roughly 126 ETB/USD).
        Budget 20.1 has no FX on its allocation rows and is shown as <strong>ETB</strong> (local currency). "Actual" here means <strong>amounts committed</strong>
        {' '}against the budget — the endpoint holds allocations and commitments only, no posted invoices.
      </Notice>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {budgets.map(x => <BudgetCard key={x.name} b={x} selected={x.name === b.name} onClick={() => setSel(x.name)} />)}
      </div>

      {noCommitments && (
        <Notice tone="warn" title={`No commitments are recorded against budget ${b.name}`}>
          Its {fmtInt(b.entries)} entries are all allocations, so utilisation shows 0%. Commitment tracking in Business Central appears to be used for the
          programme budgets only — this is a data-coverage gap, not necessarily zero spending.
        </Notice>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Allocated" value={fmtMoney(b.allocated, b.currency)} accent={DTEAL} />
        <Kpi label="Committed" value={fmtMoney(b.committed, b.currency)} sub={b.currency === 'USD' ? `= ${fmtMoney(b.committedLcy)} local` : undefined} accent={ORANGE} />
        <Kpi label="Remaining" value={fmtMoney(b.allocated - b.committed, b.currency)} accent={NAVY} />
        <Kpi label="Utilisation" value={b.utilizationPct == null ? '—' : `${b.utilizationPct.toFixed(1)}%`} accent={utilColor(b.utilizationPct)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title={`Allocated vs committed by month — budget ${b.name}`} subtitle={b.currency}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={b.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis {...monthAxis('m')} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={v => fmtMoney(v, '').trim()} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={fmtMonth} formatter={(v, n) => [fmtMoney(v, b.currency), n]} />
              <Legend iconType="circle" iconSize={8} formatter={legendFormatter} />
              <Bar dataKey="allocated" name="Allocated" fill={TEAL} radius={[3, 3, 0, 0]} />
              <Bar dataKey="committed" name="Committed" fill={ORANGE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title={`By ${b.dimLabel.toLowerCase()}`} subtitle="Top 15 by allocation">
          <DrillTable
            maxHeight={280}
            rows={b.byDim.map(d => ({ ...d, name: unitName(d.unit), pct: d.allocated ? (d.committed / d.allocated) * 100 : null }))}
            columns={[
              { key: 'name', label: b.dimLabel, align: 'left', format: v => truncateLabel(v, 26) },
              { key: 'allocated', label: 'Allocated', format: v => Math.round(v).toLocaleString() },
              { key: 'committed', label: 'Committed', format: v => Math.round(v).toLocaleString() },
              { key: 'pct', label: 'Used', format: v => (v == null ? '—' : `${v.toFixed(0)}%`), color: r => utilColor(r.pct) },
            ]}
          />
        </Panel>
      </div>
    </div>
  )
}

export default function ProcBudget({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="Budget" title="Budget vs Actual Procurement Spend" subtitle="Allocations against commitments, per budget" asOf={data?.asOf} />
      {/* No Filter by Period here — each budget (10.x/20.1) already defines its own
          span, not a calendar year, so a month/quarter filter wouldn't mean anything. */}
      <ProcData data={data} need="budget" noPeriodFilter>{proc => <Body proc={proc} data={data} />}</ProcData>
    </div>
  )
}
