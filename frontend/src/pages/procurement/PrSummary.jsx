import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import {
  NAVY, TEAL, ORANGE, RED, DTEAL, BLUE, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtMoney, fmtInt, fmtDay, fmtMonth, monthAxis, truncateLabel, sumBy, groupBy, daysBetween, legendFormatter,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData, ForeignNote,
} from './shared.jsx'

const STATUSES = [['Open', BLUE], ['Pending Approval', ORANGE], ['Released', TEAL], ['Cancel', RED]]
const STATUS_COLOR = Object.fromEntries(STATUSES)

function Body({ proc, data }) {
  const [status, setStatus] = useState(null)
  const [search, setSearch] = useState('')
  const dimNames = data?.dimensionNames || {}
  const buName = c => (c ? dimNames[c] || c : '(none)')
  const asOf = proc.asOfDate || new Date().toISOString().slice(0, 10)

  const all = proc.requisitions.rows
  const etbAll = useMemo(() => all.filter(r => r.cur === 'ETB'), [all])
  const scoped = useMemo(() => (status ? all.filter(r => r.st === status) : all), [all, status])
  const scopedEtb = scoped.filter(r => r.cur === 'ETB')

  const count = st => all.filter(r => r.st === st).length
  const noAmount = all.filter(r => !r.amt)
  const open = all.filter(r => r.st === 'Open' && r.d)
  const avgOpenAge = open.length ? sumBy(open, r => daysBetween(r.d, asOf)) / open.length : 0

  // Requester × status matrix
  const matrix = useMemo(() => {
    const m = new Map()
    all.forEach(r => {
      const row = m.get(r.u) || { u: r.u || '(unassigned)', total: 0, value: 0 }
      STATUSES.forEach(([s]) => { row[s] = row[s] || 0 })
      row[r.st] = (row[r.st] || 0) + 1
      row.total++
      if (r.cur === 'ETB') row.value += r.amt
      m.set(r.u, row)
    })
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [all])

  const byMonth = useMemo(() => {
    const months = [...new Set(all.filter(r => r.d).map(r => r.d.slice(0, 7)))].sort()
    return months.map(m => {
      const rs = all.filter(r => r.d && r.d.slice(0, 7) === m)
      const row = { m }
      STATUSES.forEach(([s]) => { row[s] = rs.filter(r => r.st === s).length })
      return row
    })
  }, [all])
  const byBU = groupBy(scopedEtb, r => r.bu, r => r.amt).sort((a, b) => b.total - a.total).slice(0, 10)

  const totalEtb = sumBy(etbAll, r => r.amt)
  const biggest = etbAll.reduce((m, r) => (r.amt > (m?.amt || 0) ? r : m), null)
  const biggestShare = biggest && totalEtb ? (biggest.amt / totalEtb) * 100 : 0
  const placeholder = all.filter(r => /^default supplier$/i.test(r.v))

  const q = search.trim().toLowerCase()
  const tableRows = scoped
    .filter(r => !q || r.no.toLowerCase().includes(q) || r.v.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q) || r.u.toLowerCase().includes(q))
    .sort((a, b) => (b.cur === 'ETB' ? b.amt : 0) - (a.cur === 'ETB' ? a.amt : 0))
    .slice(0, 40)

  return (
    <div className="space-y-4">
      <Notice tone="info" title="What a requisition is here">
        The feed is Business Central's <strong>purchase quotes</strong> (its document type is "Quote"), used as purchase requisitions. Counts include every requisition;
        values are ETB only.
      </Notice>
      {biggestShare > 50 && (
        <Notice tone="warn" title={`One requisition is ${biggestShare.toFixed(0)}% of all requisition value`}>
          <strong>{biggest.no}</strong> ({biggest.v}, {fmtMoney(biggest.amt)}, {biggest.st.toLowerCase()}) — "{truncateLabel(biggest.desc, 70)}". Without it the remaining ETB
          requisitions total {fmtMoney(totalEtb - biggest.amt)}. Worth confirming that amount is right.
        </Notice>
      )}
      {placeholder.length / all.length > 0.2 && (
        <Notice tone="info" title={`${fmtInt(placeholder.length)} of ${fmtInt(all.length)} requisitions are addressed to "Default Supplier"`}>
          That's a placeholder vendor, so vendor-level analysis of requisitions isn't meaningful for those; the real supplier is chosen later.
        </Notice>
      )}
      <ForeignNote rows={all} label="requisitions" />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Requisitions" value={fmtInt(scoped.length)} sub={status ? `${status} only` : `${fmtMoney(sumBy(etbAll, r => r.amt))}`} accent={NAVY} />
        {STATUSES.slice(0, 3).map(([s, c]) => (
          <Kpi
            key={s}
            label={s}
            value={fmtInt(count(s))}
            sub={fmtMoney(sumBy(all.filter(r => r.st === s && r.cur === 'ETB'), r => r.amt))}
            accent={c === TEAL ? DTEAL : c}
            onClick={() => setStatus(cur => (cur === s ? null : s))}
            selected={status === s}
          />
        ))}
        <Kpi label="No amount entered" value={fmtInt(noAmount.length)} sub={`${((noAmount.length / all.length) * 100).toFixed(0)}% of requisitions`} accent={RED} />
        <Kpi label="Open — average age" value={`${Math.round(avgOpenAge)} days`} sub={`${fmtInt(open.length)} open`} accent={BLUE} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Requisitions by month" subtitle="By document date, stacked by status">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis {...monthAxis('m')} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={fmtMonth} />
              <Legend iconType="circle" iconSize={8} formatter={legendFormatter} />
              {STATUSES.map(([s, c]) => <Bar key={s} dataKey={s} stackId="a" fill={c} />)}
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Value by business unit" subtitle={`ETB · ${status ? status : 'all statuses'} · top 10`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byBU.map(b => ({ ...b, name: buName(b.key) }))} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => fmtMoney(v, '').trim()} />
              <YAxis type="category" dataKey="name" width={150} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => truncateLabel(v, 22)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} requisitions`, 'Value']} />
              <Bar dataKey="total" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Requester × status" subtitle="Requisitions per assigned user; value is ETB only. There is no project field on this feed — business unit is the closest dimension.">
        <DrillTable
          maxHeight={360}
          rows={matrix}
          columns={[
            { key: 'u', label: 'Requester', align: 'left' },
            ...STATUSES.map(([s, c]) => ({ key: s, label: s, format: v => (v ? v : '—'), color: r => (r[s] ? c : '#6B7C93') })),
            { key: 'total', label: 'Total' },
            { key: 'value', label: 'Value (ETB)', format: v => Math.round(v).toLocaleString() },
          ]}
        />
      </Panel>

      <Panel
        title={`Largest requisitions${status ? ` — ${status}` : ''}`}
        subtitle={`${fmtInt(scoped.length)} requisitions · showing the 40 largest`}
        right={
          <div className="flex items-center gap-2">
            {status && <button onClick={() => setStatus(null)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border text-muted hover:text-navy">Clear filter</button>}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PR, payee, requester" className="text-xs border border-border rounded-xl px-3 py-2 text-navy outline-none focus:border-navy w-52 bg-transparent" />
          </div>
        }
      >
        <DrillTable
          maxHeight={420}
          rows={tableRows}
          emptyLabel="No requisitions match."
          columns={[
            { key: 'no', label: 'PR', align: 'left' },
            { key: 'v', label: 'Payee', align: 'left', format: v => truncateLabel(v, 22) },
            { key: 'u', label: 'Requester' },
            { key: 'st', label: 'Status', color: r => STATUS_COLOR[r.st] || '#FFFFFF' },
            { key: 'd', label: 'Doc date', format: fmtDay },
            { key: 'bu', label: 'Business unit', format: v => truncateLabel(buName(v), 14) },
            { key: 'desc', label: 'Description', format: v => truncateLabel(v, 20) },
            { key: 'amt', label: 'Amount', format: (v, r) => (v ? `${r.cur} ${Math.round(v).toLocaleString()}` : '—') },
          ]}
        />
      </Panel>
    </div>
  )
}

export default function PrSummary({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="PR Tracking" title="Purchase Requisition Summary" subtitle="Requisitions by status, requester and business unit" asOf={data?.asOf} />
      <ProcData data={data} need="requisitions">{proc => <Body proc={proc} data={data} />}</ProcData>
    </div>
  )
}
