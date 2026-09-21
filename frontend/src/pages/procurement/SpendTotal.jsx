import { useMemo, useState } from 'react'
import { BarChart, Bar, Cell, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  NAVY, TEAL, ORANGE, DTEAL, BLUE, SERIES_COLORS, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtMoney, fmtInt, fmtDay, fmtMonth, monthAxis, truncateLabel, sumBy, groupBy, legendFormatter,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData,
} from './shared.jsx'

function Chip({ label, onClear }) {
  return (
    <button onClick={onClear} className="text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5" style={{ background: 'rgba(235,125,35,.2)', color: ORANGE }}>
      {label} <span className="opacity-70">✕</span>
    </button>
  )
}

function Body({ proc, data }) {
  const [month, setMonth] = useState(null)
  const [type, setType] = useState(null)
  const [vendor, setVendor] = useState(null)
  const dimNames = data?.dimensionNames || {}
  const buName = c => (c ? dimNames[c] || c : '(none)')

  const all = proc.spend.rows
  const vName = r => r.v?.trim() || r.vn || '(no vendor)'

  const rows = useMemo(() => all.filter(r =>
    (!month || r.d.slice(0, 7) === month) && (!type || r.t === type) && (!vendor || vName(r) === vendor)
  ), [all, month, type, vendor])

  const total = sumBy(rows, r => r.amt)
  const invoices = new Set(rows.map(r => r.doc)).size
  const vendors = new Set(rows.map(r => r.vn).filter(Boolean)).size
  const unresolved = all.filter(r => r.vn && !r.v?.trim())

  // Each chart ignores its *own* filter so the other options stay visible for switching.
  const monthBase = all.filter(r => (!type || r.t === type) && (!vendor || vName(r) === vendor))
  const byMonth = groupBy(monthBase, r => r.d.slice(0, 7), r => r.amt).sort((a, b) => a.key.localeCompare(b.key))
  const typeBase = all.filter(r => (!month || r.d.slice(0, 7) === month) && (!vendor || vName(r) === vendor))
  const byType = groupBy(typeBase, r => r.t, r => r.amt).sort((a, b) => b.total - a.total)
  const vendorBase = all.filter(r => (!month || r.d.slice(0, 7) === month) && (!type || r.t === type))
  const byVendor = groupBy(vendorBase, vName, r => r.amt).sort((a, b) => b.total - a.total).slice(0, 10)
  const byBU = groupBy(rows, r => r.bu, r => r.amt).sort((a, b) => b.total - a.total).slice(0, 10)
  const byGroup = groupBy(rows, r => r.pg || '(blank)', r => r.amt).sort((a, b) => b.total - a.total).slice(0, 8)

  const anyFilter = month || type || vendor

  return (
    <div className="space-y-4">
      <Notice tone="info" title="What this covers">
        Posted purchase-invoice lines in ETB, excluding VAT, {fmtDay(all.reduce((m, r) => (r.d < m ? r.d : m), all[0].d))} to {fmtDay(all.reduce((m, r) => (r.d > m ? r.d : m), all[0].d))}.
        Vendor names aren't on this endpoint, so they're matched from the PO vendor list — {fmtInt(unresolved.length)} lines ({fmtMoney(sumBy(unresolved, r => r.amt))}) have
        no match and show the vendor number instead.
      </Notice>

      {anyFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-muted">Filtered to:</span>
          {month && <Chip label={fmtMonth(month)} onClear={() => setMonth(null)} />}
          {type && <Chip label={type} onClear={() => setType(null)} />}
          {vendor && <Chip label={truncateLabel(vendor, 28)} onClear={() => setVendor(null)} />}
          <button onClick={() => { setMonth(null); setType(null); setVendor(null) }} className="text-[11px] font-bold text-muted hover:text-navy underline">Clear all</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total spend" value={fmtMoney(total)} accent={DTEAL} />
        <Kpi label="Invoices" value={fmtInt(invoices)} sub={`${fmtInt(rows.length)} lines`} accent={NAVY} />
        <Kpi label="Vendors" value={fmtInt(vendors)} accent={BLUE} />
        <Kpi label="Average per invoice" value={fmtMoney(invoices ? total / invoices : 0)} accent={ORANGE} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Spend by month" subtitle="Click a month to filter">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis {...monthAxis('key')} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={v => fmtMoney(v, '').trim()} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={fmtMonth} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} lines`, 'Spend']} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} onClick={d => setMonth(m => (m === d.key ? null : d.key))} style={{ cursor: 'pointer' }}>
                {byMonth.map(m => <Cell key={m.key} fill={ORANGE} fillOpacity={!month || month === m.key ? 1 : 0.3} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Spend by category" subtitle="Line type · click a slice to filter">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={byType} dataKey="total" nameKey="key" innerRadius={55} outerRadius={90} paddingAngle={2} onClick={d => setType(t => (t === d.key ? null : d.key))} style={{ cursor: 'pointer' }}>
                {byType.map((t, i) => <Cell key={t.key} fill={SERIES_COLORS[i % SERIES_COLORS.length]} fillOpacity={!type || type === t.key ? 1 : 0.3} stroke="none" />)}
              </Pie>
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtMoney(v), name]} />
              <Legend iconType="circle" iconSize={8} formatter={legendFormatter} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Top vendors" subtitle="Click a bar to filter">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byVendor} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => fmtMoney(v, '').trim()} />
              <YAxis type="category" dataKey="key" width={150} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => truncateLabel(v, 22)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} lines`, 'Spend']} />
              <Bar dataKey="total" radius={[0, 4, 4, 0]} onClick={d => setVendor(v => (v === d.key ? null : d.key))} style={{ cursor: 'pointer' }}>
                {byVendor.map(v => <Cell key={v.key} fill={TEAL} fillOpacity={!vendor || vendor === v.key ? 1 : 0.3} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Spend by business unit" subtitle="Top 10 · business unit names resolved from the dimension list">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byBU.map(b => ({ ...b, name: buName(b.key) }))} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => fmtMoney(v, '').trim()} />
              <YAxis type="category" dataKey="name" width={150} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => truncateLabel(v, 22)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} lines`, 'Spend']} />
              <Bar dataKey="total" fill={BLUE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="By posting group" subtitle="General product posting group on the invoice line">
          <DrillTable
            rows={byGroup}
            columns={[
              { key: 'key', label: 'Group', align: 'left' },
              { key: 'n', label: 'Lines' },
              { key: 'total', label: 'ETB', format: v => Math.round(v).toLocaleString() },
            ]}
          />
        </Panel>
        <div className="xl:col-span-2">
          <Panel title="Largest invoice lines" subtitle={`${fmtInt(rows.length)} lines · showing the 40 largest`}>
            <DrillTable
              maxHeight={340}
              rows={[...rows].sort((a, b) => b.amt - a.amt).slice(0, 40)}
              columns={[
                { key: 'd', label: 'Date', align: 'left', format: fmtDay },
                { key: 'doc', label: 'Invoice' },
                { key: 'v', label: 'Vendor', format: (v, r) => truncateLabel(v?.trim() || r.vn, 20) },
                { key: 'desc', label: 'Description', format: v => truncateLabel(v, 22) },
                { key: 'amt', label: 'ETB', format: v => Math.round(v).toLocaleString() },
              ]}
            />
          </Panel>
        </div>
      </div>
    </div>
  )
}

export default function SpendTotal({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="Spend Analysis" title="Total Procurement Spend" subtitle="Spend by month, category, vendor and business unit" asOf={data?.asOf} />
      <ProcData data={data} need="spend">{proc => <Body proc={proc} data={data} />}</ProcData>
    </div>
  )
}
