import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  NAVY, TEAL, ORANGE, DTEAL, BLUE, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtMoney, fmtInt, fmtDay, fmtMonth, monthAxis, truncateLabel,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData,
} from './shared.jsx'

function Body({ proc, data }) {
  const c = proc.commitments
  const dimNames = data?.dimensionNames || {}
  const buName = code => (code ? dimNames[code] || code : '(none)')

  return (
    <div className="space-y-4">
      <Notice tone="info" title="What this endpoint contains">
        Every row here is a <strong>payment-voucher (PV) commitment</strong> booked against a SAFEE programme budget
        ({c.byBudget.map(b => b.budget).join(' and ')}), {fmtDay(c.dateFrom)} to {fmtDay(c.dateTo)}. These are budget-commitment ledger entries, not open
        purchase orders — open POs (nothing received or invoiced yet) are on the PO Summary and PO Variance pages. ETB is the booked local amount; USD is
        the budget-currency equivalent.
      </Notice>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Committed (ETB)" value={fmtMoney(c.totals.lcy)} accent={DTEAL} />
        <Kpi label="Committed (USD budget)" value={fmtMoney(c.totals.usd, 'USD')} accent={NAVY} />
        <Kpi label="Commitment entries" value={fmtInt(c.entries)} accent={BLUE} />
        <Kpi label="Avg entry (ETB)" value={fmtMoney(c.entries ? c.totals.lcy / c.entries : 0)} accent={ORANGE} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Committed by month (ETB)" subtitle="By commitment date">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={c.byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis {...monthAxis('m')} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={v => fmtMoney(v, '').trim()} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={fmtMonth} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} entries`, 'Committed']} />
              <Bar dataKey="lcy" fill={ORANGE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Committed by business unit (ETB)" subtitle="Top 10">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={c.byBU.slice(0, 10).map(b => ({ ...b, name: buName(b.bu) }))} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => fmtMoney(v, '').trim()} />
              <YAxis type="category" dataKey="name" width={150} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => truncateLabel(v, 22)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} entries`, 'Committed']} />
              <Bar dataKey="lcy" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="By budget" subtitle="Programme budgets carrying these commitments">
          <DrillTable
            rows={c.byBudget}
            columns={[
              { key: 'budget', label: 'Budget', align: 'left' },
              { key: 'n', label: 'Entries' },
              { key: 'lcy', label: 'Committed (ETB)', format: v => Math.round(v).toLocaleString() },
              { key: 'usd', label: 'Committed (USD)', format: v => Math.round(v).toLocaleString() },
            ]}
          />
        </Panel>
        <Panel title="Largest source documents" subtitle="Top 25 by ETB committed">
          <DrillTable
            maxHeight={320}
            rows={c.topDocs}
            columns={[
              { key: 'doc', label: 'Source document', align: 'left' },
              { key: 'n', label: 'Entries' },
              { key: 'lcy', label: 'ETB', format: v => Math.round(v).toLocaleString() },
              { key: 'usd', label: 'USD', format: v => Math.round(v).toLocaleString() },
            ]}
          />
        </Panel>
      </div>
    </div>
  )
}

export default function Commitments({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="Commitments" title="PO Commitments not Invoiced" subtitle="Committed amounts from the commitment ledger" asOf={data?.asOf} />
      <ProcData data={data} need="commitments">{proc => <Body proc={proc} data={data} />}</ProcData>
    </div>
  )
}
