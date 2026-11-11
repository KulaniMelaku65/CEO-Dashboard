import { useMemo, useState } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  NAVY, TEAL, ORANGE, DTEAL, BLUE, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtMoney, fmtInt, fmtDay, fmtMonth, monthAxis, truncateLabel, sumBy, groupBy,
  Kpi, Panel, PageHeader, DrillTable, ProcData, ForeignNote,
} from './shared.jsx'

const STATUS_COLORS = { Released: TEAL, Open: BLUE, 'Pending Approval': ORANGE }

function Body({ proc, data }) {
  const [status, setStatus] = useState(null)
  const [search, setSearch] = useState('')
  const dimNames = data?.dimensionNames || {}
  const buName = c => (c ? dimNames[c] || c : '(none)')

  const all = proc.po.rows
  const etbAll = useMemo(() => all.filter(r => r.cur === 'ETB'), [all])
  const etb = useMemo(() => (status ? etbAll.filter(r => r.st === status) : etbAll), [etbAll, status])

  const total = sumBy(etb, r => r.amt)
  const totalVat = sumBy(etb, r => r.vat)
  const vendors = new Set(etb.map(r => r.vn)).size
  const pending = etbAll.filter(r => r.st === 'Pending Approval')

  const byStatus = groupBy(etbAll, r => r.st, r => r.amt).sort((a, b) => b.total - a.total)
  const byMonth = groupBy(etb.filter(r => r.od), r => r.od.slice(0, 7), r => r.amt).sort((a, b) => a.key.localeCompare(b.key))
  const byVendor = groupBy(etb, r => r.v || r.vn, r => r.amt).sort((a, b) => b.total - a.total).slice(0, 10)
  const byBU = groupBy(etb, r => r.bu, r => r.amt).sort((a, b) => b.total - a.total).slice(0, 10)

  const q = search.trim().toLowerCase()
  const tableRows = etb
    .filter(r => !q || r.no.toLowerCase().includes(q) || (r.v || '').toLowerCase().includes(q))
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 50)

  return (
    <div className="space-y-4">
      <ForeignNote rows={all} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Purchase orders" value={fmtInt(etb.length)} sub={status ? `${status} only` : 'ETB orders'} accent={NAVY} />
        <Kpi label="Order value (ex-VAT)" value={fmtMoney(total)} accent={DTEAL} />
        <Kpi label="Order value (incl. VAT)" value={fmtMoney(totalVat)} sub={`VAT ${fmtMoney(totalVat - total)}`} accent={NAVY} />
        <Kpi label="Average PO" value={fmtMoney(etb.length ? total / etb.length : 0)} accent={BLUE} />
        <Kpi label="Vendors" value={fmtInt(vendors)} accent={NAVY} />
        <Kpi
          label="Pending approval"
          value={fmtInt(pending.length)}
          sub={fmtMoney(sumBy(pending, r => r.amt))}
          accent={ORANGE}
          onClick={() => setStatus(s => (s === 'Pending Approval' ? null : 'Pending Approval'))}
          selected={status === 'Pending Approval'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Order value by status" subtitle="Click a bar to filter the whole page to that status">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={byStatus} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="key" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={v => fmtMoney(v, '').trim()} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} POs`, 'Value']} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} onClick={d => setStatus(s => (s === d.key ? null : d.key))} style={{ cursor: 'pointer' }}>
                {byStatus.map(s => <Cell key={s.key} fill={STATUS_COLORS[s.key] || ORANGE} fillOpacity={!status || status === s.key ? 1 : 0.3} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Order value by month" subtitle="By PO order date">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={byMonth} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis {...monthAxis('key')} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={v => fmtMoney(v, '').trim()} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={fmtMonth} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} POs`, 'Value']} />
              <Bar dataKey="total" fill={ORANGE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Top vendors by order value" subtitle={status ? `${status} POs` : 'All ETB POs'}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byVendor} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => fmtMoney(v, '').trim()} />
              <YAxis type="category" dataKey="key" width={150} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => truncateLabel(v, 22)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} POs`, 'Value']} />
              <Bar dataKey="total" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Top business units by order value" subtitle="Business unit names resolved from the dimension list">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byBU.map(b => ({ ...b, name: buName(b.key) }))} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => fmtMoney(v, '').trim()} />
              <YAxis type="category" dataKey="name" width={150} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => truncateLabel(v, 22)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} POs`, 'Value']} />
              <Bar dataKey="total" fill={BLUE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel
        title={`Largest purchase orders${status ? ` — ${status}` : ''}`}
        subtitle={`Top ${tableRows.length} of ${fmtInt(etb.length)} by value`}
        right={
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search PO or vendor"
            className="text-xs border border-border rounded-xl px-3 py-2 text-ink outline-none focus:border-navy w-48 bg-transparent"
          />
        }
      >
        <DrillTable
          maxHeight={420}
          rows={tableRows}
          emptyLabel="No purchase orders match."
          columns={[
            { key: 'no', label: 'PO', align: 'left' },
            { key: 'v', label: 'Vendor', align: 'left', format: (v, r) => truncateLabel(v || r.vn, 34) },
            { key: 'st', label: 'Status', color: r => STATUS_COLORS[r.st] || '#FFF' },
            { key: 'od', label: 'Ordered', format: fmtDay },
            { key: 'dd', label: 'Due', format: fmtDay },
            { key: 'bu', label: 'Business unit', format: v => truncateLabel(buName(v), 22) },
            { key: 'amt', label: 'Amount (ETB)', format: v => Math.round(v).toLocaleString() },
            { key: 'vat', label: 'Incl. VAT', format: v => Math.round(v).toLocaleString() },
          ]}
        />
      </Panel>
    </div>
  )
}

export default function PoSummary({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="PO Tracking" title="Purchase Order Summary" subtitle="POs by vendor, business unit and status" asOf={data?.asOf} />
      <ProcData data={data} need="poSummary">{proc => <Body proc={proc} data={data} />}</ProcData>
    </div>
  )
}
