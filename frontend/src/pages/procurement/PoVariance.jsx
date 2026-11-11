import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import {
  NAVY, TEAL, ORANGE, RED, DTEAL, BLUE, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtMoney, fmtInt, truncateLabel,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData,
} from './shared.jsx'

function Body({ proc, data }) {
  const v = proc.variance
  const t = v.totals
  const dimNames = data?.dimensionNames || {}
  const buName = c => (c ? dimNames[c] || c : '(none)')
  const vat = t.outstandingInclVat - t.ordered
  const nothingMoved = t.linesWithReceipt === 0 && t.linesWithInvoice === 0

  // Ordered → Received → Invoiced is the PO / receipt / invoice chain this report is about.
  const chain = [
    { stage: 'Ordered', value: t.ordered, fill: TEAL },
    { stage: 'Received', value: t.received, fill: BLUE },
    { stage: 'Invoiced', value: t.invoiced, fill: ORANGE },
  ]

  return (
    <div className="space-y-4">
      {nothingMoved && (
        <Notice tone="warn" title="No receipts or invoices have been posted against any of these purchase orders">
          Across {fmtInt(v.etbLines)} ETB PO lines, Business Central shows <strong>0</strong> quantity received and <strong>0</strong> quantity invoiced,
          so every line is 100% outstanding and the variance to receipt and invoice equals the full order value. Either goods/services haven't been received
          in the system yet, or receiving is being recorded outside these POs — worth confirming with whoever posts receipts.
        </Notice>
      )}
      {v.foreign?.length > 0 && (
        <Notice tone="info" title={`${v.foreign.reduce((s, f) => s + f.lines, 0)} foreign-currency PO lines are excluded from the ETB totals`}>
          No exchange rate is available on this endpoint. Native ordered totals: {v.foreign.map(f => `${f.currency} ${Math.round(f.ordered).toLocaleString()}`).join(' · ')}.
        </Notice>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Ordered (ex-VAT)" value={fmtMoney(t.ordered)} sub={`${fmtInt(v.etbLines)} lines`} accent={DTEAL} />
        <Kpi label="Received" value={fmtMoney(t.received)} sub={`${fmtInt(t.linesWithReceipt)} lines with receipts`} accent={BLUE} />
        <Kpi label="Invoiced" value={fmtMoney(t.invoiced)} sub={`${fmtInt(t.linesWithInvoice)} lines with invoices`} accent={ORANGE} />
        <Kpi label="Received, not invoiced" value={fmtMoney(t.receivedNotInvoiced)} accent={NAVY} />
        <Kpi label="Outstanding (incl. VAT)" value={fmtMoney(t.outstandingInclVat)} sub={`incl. ${fmtMoney(vat)} VAT`} accent={RED} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="PO → receipt → invoice" subtitle="Ordered value against what has been received and invoiced">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chain} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="stage" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={x => fmtMoney(x, '').trim()} />
              <Tooltip {...TOOLTIP_STYLE} formatter={x => [fmtMoney(x), 'Value']} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chain.map(c => <Cell key={c.stage} fill={c.fill} />)}
                <LabelList dataKey="value" position="top" formatter={x => fmtMoney(x)} style={{ fill: 'var(--tbl-fg)', fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Ordered vs outstanding by business unit" subtitle="Outstanding includes VAT, ordered does not">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={v.byBU.slice(0, 8).map(b => ({ ...b, name: buName(b.bu) }))} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={x => fmtMoney(x, '').trim()} />
              <YAxis type="category" dataKey="name" width={140} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={x => truncateLabel(x, 20)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(x, n) => [fmtMoney(x), n]} />
              <Bar dataKey="ordered" name="Ordered" fill={TEAL} radius={[0, 3, 3, 0]} />
              <Bar dataKey="outstanding" name="Outstanding" fill={ORANGE} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="By vendor" subtitle="Top 15 by ordered value">
          <DrillTable
            maxHeight={360}
            rows={v.byVendor}
            columns={[
              { key: 'v', label: 'Vendor', align: 'left', format: x => truncateLabel(x, 30) },
              { key: 'lines', label: 'Lines' },
              { key: 'ordered', label: 'Ordered', format: x => Math.round(x).toLocaleString() },
              { key: 'outstanding', label: 'Outstanding', format: x => Math.round(x).toLocaleString() },
            ]}
          />
        </Panel>
        <Panel title="Largest PO lines" subtitle="Top 25 by ordered value">
          <DrillTable
            maxHeight={360}
            rows={v.topLines}
            columns={[
              { key: 'po', label: 'PO', align: 'left' },
              { key: 'desc', label: 'Description', align: 'left', format: x => truncateLabel(x, 26) },
              { key: 'qty', label: 'Qty' },
              { key: 'qr', label: 'Recvd' },
              { key: 'qi', label: 'Invcd' },
              { key: 'amt', label: 'Ordered', format: x => Math.round(x).toLocaleString() },
            ]}
          />
        </Panel>
      </div>
    </div>
  )
}

export default function PoVariance({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="PO Tracking" title="PO Variance Analysis" subtitle="PO vs receipt vs invoice" asOf={data?.asOf} />
      <ProcData data={data} need="poVariance">{proc => <Body proc={proc} data={data} />}</ProcData>
    </div>
  )
}
