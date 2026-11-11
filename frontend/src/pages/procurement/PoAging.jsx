import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import {
  NAVY, TEAL, ORANGE, RED, DTEAL, BLUE, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtMoney, fmtInt, fmtDay, truncateLabel, sumBy, daysBetween, legendFormatter,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData, ForeignNote,
} from './shared.jsx'

const BUCKETS = [
  { label: '0-30 days', max: 30 },
  { label: '31-60 days', max: 60 },
  { label: '61-90 days', max: 90 },
  { label: '91-180 days', max: 180 },
  { label: '181-365 days', max: 365 },
  { label: '365+ days', max: Infinity },
]
const STATUSES = [['Released', TEAL], ['Open', BLUE], ['Pending Approval', ORANGE]]
const bucketOf = age => BUCKETS.find(b => age <= b.max).label

function Body({ proc, data }) {
  const [bucket, setBucket] = useState(null)
  const dimNames = data?.dimensionNames || {}
  const buName = c => (c ? dimNames[c] || c : '(none)')
  const asOf = proc.asOfDate || new Date().toISOString().slice(0, 10)

  const all = proc.po.rows
  // "Open" = not completely received. In this data that is every PO (nothing has been
  // received yet), which is itself a finding shown in the notice below.
  const open = useMemo(() => all
    .filter(r => r.cur === 'ETB' && !r.rec && r.od)
    .map(r => ({ ...r, age: Math.max(0, daysBetween(r.od, asOf)) }))
    .map(r => ({ ...r, bucket: bucketOf(r.age) })), [all, asOf])

  const byBucket = BUCKETS.map(b => {
    const rows = open.filter(r => r.bucket === b.label)
    const row = { bucket: b.label, n: rows.length, total: sumBy(rows, r => r.amt) }
    STATUSES.forEach(([s]) => { row[s] = sumBy(rows.filter(r => r.st === s), r => r.amt) })
    return row
  })

  const openValue = sumBy(open, r => r.amt)
  const avgAge = open.length ? sumBy(open, r => r.age) / open.length : 0
  const over90 = open.filter(r => r.age > 90)
  const oldest = open.reduce((m, r) => (r.age > m ? r.age : m), 0)
  const pastDue = open.filter(r => r.dd && r.dd < asOf)

  const filtered = bucket ? open.filter(r => r.bucket === bucket) : open
  const buRows = Object.entries(
    filtered.reduce((m, r) => { m[r.bu] = (m[r.bu] || 0) + r.amt; return m }, {})
  ).map(([bu, total]) => ({ name: buName(bu), total })).sort((a, b) => b.total - a.total).slice(0, 10)

  const erdCount = all.filter(r => r.erd).length
  const receivedCount = all.filter(r => r.rec).length

  return (
    <div className="space-y-4">
      <Notice tone="info" title="How ageing is measured here">
        Business Central shows <strong>{fmtInt(receivedCount)}</strong> of {fmtInt(all.length)} POs as completely received, so every PO counts as open. The
        expected-receipt date is filled in on only <strong>{fmtInt(erdCount)}</strong>, so age is counted from the <strong>order date</strong> to {fmtDay(asOf)}.
      </Notice>
      <ForeignNote rows={all} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Open POs" value={fmtInt(open.length)} accent={NAVY} />
        <Kpi label="Open value" value={fmtMoney(openValue)} accent={DTEAL} />
        <Kpi label="Average age" value={`${Math.round(avgAge)} days`} sub={`Oldest ${oldest} days`} accent={BLUE} />
        <Kpi
          label="Older than 90 days"
          value={fmtInt(over90.length)}
          sub={fmtMoney(sumBy(over90, r => r.amt))}
          accent={RED}
        />
        <Kpi label="Past payment due date" value={fmtInt(pastDue.length)} sub={fmtMoney(sumBy(pastDue, r => r.amt))} accent={ORANGE} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Open PO value by age" subtitle="Stacked by status · click a column to filter the table and business-unit chart">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byBucket} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={e => { if (e?.activeLabel) setBucket(b => (b === e.activeLabel ? null : e.activeLabel)) }} style={{ cursor: 'pointer' }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={v => fmtMoney(v, '').trim()} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtMoney(v), name]} />
              <Legend iconType="circle" iconSize={8} formatter={legendFormatter} />
              {STATUSES.map(([s, c]) => <Bar key={s} dataKey={s} stackId="a" fill={c} />)}
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Open value by business unit" subtitle={bucket ? `Only ${bucket}` : 'All ages'}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={buRows} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => fmtMoney(v, '').trim()} />
              <YAxis type="category" dataKey="name" width={150} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => truncateLabel(v, 22)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={v => [fmtMoney(v), 'Open value']} />
              <Bar dataKey="total" fill={ORANGE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel
        title={`Oldest open POs${bucket ? ` — ${bucket}` : ''}`}
        subtitle={`${fmtInt(filtered.length)} POs · showing the 40 oldest`}
        right={bucket && <button onClick={() => setBucket(null)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border text-muted hover:text-ink">Clear filter</button>}
      >
        <DrillTable
          maxHeight={420}
          rows={[...filtered].sort((a, b) => b.age - a.age).slice(0, 40)}
          columns={[
            { key: 'no', label: 'PO', align: 'left' },
            { key: 'v', label: 'Vendor', align: 'left', format: (v, r) => truncateLabel(v || r.vn, 32) },
            { key: 'st', label: 'Status' },
            { key: 'od', label: 'Ordered', format: fmtDay },
            { key: 'age', label: 'Age (days)', color: r => (r.age > 180 ? RED : r.age > 90 ? ORANGE : 'var(--tbl-fg)') },
            { key: 'dd', label: 'Payment due', format: fmtDay },
            { key: 'bu', label: 'Business unit', format: v => truncateLabel(buName(v), 20) },
            { key: 'amt', label: 'Amount (ETB)', format: v => Math.round(v).toLocaleString() },
          ]}
        />
      </Panel>
    </div>
  )
}

export default function PoAging({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="PO Tracking" title="PO Aging Report" subtitle="Open purchase orders by age" asOf={data?.asOf} />
      <ProcData data={data} need="poAging">{proc => <Body proc={proc} data={data} />}</ProcData>
    </div>
  )
}
