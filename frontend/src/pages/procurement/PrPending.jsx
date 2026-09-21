import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import {
  NAVY, TEAL, ORANGE, RED, BLUE, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtMoney, fmtInt, fmtDay, truncateLabel, sumBy, groupBy, daysBetween,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData, ForeignNote,
} from './shared.jsx'

const BUCKETS = [
  { label: '0-7 days', max: 7 },
  { label: '8-14 days', max: 14 },
  { label: '15-30 days', max: 30 },
  { label: '31-60 days', max: 60 },
  { label: '60+ days', max: Infinity },
]

function Body({ proc, data }) {
  const dimNames = data?.dimensionNames || {}
  const buName = c => (c ? dimNames[c] || c : '(none)')
  const asOf = proc.asOfDate || new Date().toISOString().slice(0, 10)

  const rows = useMemo(() => proc.pendingPr.rows.map(r => ({ ...r, age: r.d ? Math.max(0, daysBetween(r.d, asOf)) : 0 })), [proc, asOf])
  const etb = rows.filter(r => r.cur === 'ETB')
  const noAmount = rows.filter(r => !r.amt)
  const avgAge = rows.length ? sumBy(rows, r => r.age) / rows.length : 0
  const oldest = rows.reduce((m, r) => Math.max(m, r.age), 0)
  const over14 = rows.filter(r => r.age > 14)

  const byAge = BUCKETS.map(b => {
    const prev = BUCKETS[BUCKETS.indexOf(b) - 1]?.max ?? -1
    return { bucket: b.label, n: rows.filter(r => r.age > prev && r.age <= b.max).length }
  })
  const byUser = groupBy(rows, r => r.u || '(unassigned)').sort((a, b) => b.n - a.n).slice(0, 10)
  const byBU = groupBy(rows, r => buName(r.bu)).sort((a, b) => b.n - a.n).slice(0, 10)

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Who each requisition is waiting on isn't in this feed">
        The feed shows the user a requisition is <strong>assigned to</strong> (its requester) but has no approver field, so it can't show whose approval queue each one is
        sitting in. The charts below are by requester, not by approver.
      </Notice>
      <ForeignNote rows={rows} label="requisitions" />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Pending approval" value={fmtInt(rows.length)} accent={ORANGE} />
        <Kpi label="Value (ETB)" value={fmtMoney(sumBy(etb, r => r.amt))} sub={`${fmtInt(noAmount.length)} with no amount entered`} accent={NAVY} />
        <Kpi label="Average wait" value={`${Math.round(avgAge)} days`} sub={`Oldest ${oldest} days`} accent={BLUE} />
        <Kpi label="Waiting over 14 days" value={fmtInt(over14.length)} sub={fmtMoney(sumBy(over14.filter(r => r.cur === 'ETB'), r => r.amt))} accent={RED} />
        <Kpi label="Requesters" value={fmtInt(new Set(rows.map(r => r.u)).size)} accent={NAVY} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="How long they've been waiting" subtitle="Days since document date">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byAge} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
              <Tooltip {...TOOLTIP_STYLE} formatter={v => [v, 'Requisitions']} />
              <Bar dataKey="n" fill={ORANGE} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="n" position="top" style={{ fill: '#E6F0F3', fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="By requester" subtitle="Pending requisitions per assigned user">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byUser} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="key" width={90} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_STYLE} formatter={v => [v, 'Requisitions']} />
              <Bar dataKey="n" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="By business unit" subtitle="Pending requisitions">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byBU} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="key" width={130} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => truncateLabel(v, 20)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={v => [v, 'Requisitions']} />
              <Bar dataKey="n" fill={BLUE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="All pending requisitions" subtitle={`${fmtInt(rows.length)} awaiting approval · longest wait first`}>
        <DrillTable
          maxHeight={460}
          rows={[...rows].sort((a, b) => b.age - a.age)}
          columns={[
            { key: 'no', label: 'PR', align: 'left' },
            { key: 'v', label: 'Payee', align: 'left', format: v => truncateLabel(v, 28) },
            { key: 'u', label: 'Requester' },
            { key: 'bu', label: 'Business unit', format: v => truncateLabel(buName(v), 18) },
            { key: 'd', label: 'Doc date', format: fmtDay },
            { key: 'age', label: 'Waiting (days)', color: r => (r.age > 30 ? RED : r.age > 14 ? ORANGE : '#FFFFFF') },
            { key: 'desc', label: 'Description', format: v => truncateLabel(v, 32) },
            { key: 'amt', label: 'Amount', format: (v, r) => (v ? `${r.cur} ${Math.round(v).toLocaleString()}` : '—') },
          ]}
        />
      </Panel>
    </div>
  )
}

export default function PrPending({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="PR Tracking" title="Pending PR Approvals" subtitle="Requisitions waiting for approval" asOf={data?.asOf} />
      <ProcData data={data} need="pendingPr">{proc => <Body proc={proc} data={data} />}</ProcData>
    </div>
  )
}
