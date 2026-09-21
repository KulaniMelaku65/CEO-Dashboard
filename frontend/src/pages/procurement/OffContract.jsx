import { BarChart, Bar, Cell, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  NAVY, TEAL, ORANGE, RED, GREEN, DTEAL, BLUE, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtMoney, fmtInt, fmtMonth, monthAxis, truncateLabel, legendFormatter,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData,
} from './shared.jsx'

function Body({ proc, data }) {
  const o = proc.offContract
  const dimNames = data?.dimensionNames || {}
  const buName = c => (c ? dimNames[c] || c : '(none)')
  const t = o.totals
  const noContracts = o.onContractLines === 0

  const split = [
    { name: 'Outside contract', value: t.offContract, fill: ORANGE },
    { name: 'On contract (blanket order)', value: t.onContract, fill: GREEN },
  ].filter(s => s.value > 0)

  // Same vendor name under two vendor numbers is shown as two rows on purpose — it's how
  // Business Central holds them, and it's a duplicate-vendor signal worth seeing.
  const nameCount = new Map()
  o.byVendor.forEach(v => nameCount.set(v.v, (nameCount.get(v.v) || 0) + 1))
  const dupNames = [...nameCount.entries()].filter(([, n]) => n > 1).map(([name]) => name)

  return (
    <div className="space-y-4">
      {noContracts ? (
        <Notice tone="warn" title="No purchase order line references a contract, so 100% of spend counts as outside contract">
          A line is treated as on-contract only when it carries a <strong>blanket order</strong> reference. None of the {fmtInt(o.etbLines)} ETB lines across {fmtInt(o.etbPos)} POs does.
          Either framework agreements aren't held as blanket orders in Business Central, or POs aren't being raised against them — so this is a coverage gap in the data as
          much as a finding about buying behaviour. Below, vendors are ranked by repeat spend as candidates for a framework agreement.
        </Notice>
      ) : (
        <Notice tone="info" title="How on-contract is decided">A PO line is on-contract when it references a blanket order in Business Central.</Notice>
      )}
      {o.foreign?.length > 0 && (
        <Notice tone="info" title={`${o.foreign.reduce((s, f) => s + f.lines, 0)} foreign-currency lines are excluded from the ETB figures`}>
          No exchange rate is available on this feed. Native totals: {o.foreign.map(f => `${f.currency} ${Math.round(f.value).toLocaleString()}`).join(' · ')}.
        </Notice>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Outside contract" value={t.offContractPct == null ? '—' : `${t.offContractPct.toFixed(1)}%`} sub="of ETB PO-line value" accent={t.offContractPct > 50 ? RED : ORANGE} />
        <Kpi label="Outside-contract value" value={fmtMoney(t.offContract)} sub={`${fmtInt(o.etbLines - o.onContractLines)} lines`} accent={DTEAL} />
        <Kpi label="On-contract value" value={fmtMoney(t.onContract)} sub={`${fmtInt(o.onContractLines)} lines`} accent={NAVY} />
        <Kpi label="Vendors" value={fmtInt(o.vendors)} sub="with outside-contract spend" accent={BLUE} />
        <Kpi label="Purchase orders" value={fmtInt(o.etbPos)} sub={`${fmtInt(o.zeroValueLines)} zero-value lines`} accent={NAVY} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Contract coverage" subtitle="Share of ETB PO-line value">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={split} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={split.length > 1 ? 2 : 0} stroke="none">
                {split.map(s => <Cell key={s.name} fill={s.fill} />)}
              </Pie>
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtMoney(v), name]} />
              <Legend iconType="circle" iconSize={8} formatter={legendFormatter} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Outside-contract spend by month" subtitle="By PO order date">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={o.byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis {...monthAxis('m')} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={v => fmtMoney(v, '').trim()} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={fmtMonth} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.lines} lines`, 'Value']} />
              <Bar dataKey="value" fill={ORANGE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="By business unit" subtitle="Top 10">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={o.byBU.slice(0, 10).map(b => ({ ...b, name: buName(b.bu) }))} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => fmtMoney(v, '').trim()} />
              <YAxis type="category" dataKey="name" width={120} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => truncateLabel(v, 18)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.lines} lines`, 'Value']} />
              <Bar dataKey="value" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel
        title="Framework-agreement candidates"
        subtitle={`Top ${o.byVendor.length} vendors by outside-contract value — high spend across many POs is where a contract pays off most`}
      >
        {dupNames.length > 0 && (
          <div className="mb-3">
            <Notice tone="info" title="Same vendor name under more than one vendor number">
              {dupNames.join(', ')} appear{dupNames.length === 1 ? 's' : ''} more than once below with different vendor numbers — possibly duplicate vendor records in Business Central.
            </Notice>
          </div>
        )}
        <DrillTable
          maxHeight={460}
          rows={o.byVendor.map(v => ({ ...v, share: t.offContract ? (v.value / t.offContract) * 100 : 0, avg: v.pos ? v.value / v.pos : 0 }))}
          columns={[
            { key: 'v', label: 'Vendor', align: 'left', format: x => truncateLabel(x, 34) },
            { key: 'vn', label: 'Vendor no.' },
            { key: 'pos', label: 'POs' },
            { key: 'lines', label: 'Lines' },
            { key: 'avg', label: 'Avg per PO', format: x => Math.round(x).toLocaleString() },
            { key: 'value', label: 'Value (ETB)', format: x => Math.round(x).toLocaleString() },
            { key: 'share', label: 'Share', format: x => `${x.toFixed(1)}%` },
          ]}
        />
      </Panel>
    </div>
  )
}

export default function OffContract({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="Compliance" title="Purchases Outside Contract" subtitle="PO lines with no blanket-order (contract) reference" asOf={data?.asOf} />
      <ProcData data={data} need="offContract">{proc => <Body proc={proc} data={data} />}</ProcData>
    </div>
  )
}
