import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import {
  NAVY, TEAL, ORANGE, RED, GREEN, DTEAL, BLUE, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtInt, fmtDay, fmtMonth, monthAxis, truncateLabel, sumBy, legendFormatter,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData,
} from './shared.jsx'

const dayNum = d => Math.round(new Date(d + 'T12:00:00').getTime() / 86400000)
const pct = (n, d) => (d ? (n / d) * 100 : 0)
const median = arr => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const MIN_RECEIPTS = 3

function Body({ proc }) {
  const vd = proc.vendorDelivery
  const [picked, setPicked] = useState(null)

  // A receipt is "on time" when it was posted on or before the expected receipt date; the
  // days-late figure is posting − expected, so a negative number means received early.
  const rows = useMemo(() => vd.rows
    .filter(r => r.pd && r.exp)
    .map(r => ({ ...r, late: dayNum(r.pd) - dayNum(r.exp), beforeOrder: r.od ? dayNum(r.pd) < dayNum(r.od) : false })), [vd])
  const lateRows = rows.filter(r => r.late > 0)
  const onTime = rows.length - lateRows.length
  const beforeOrder = rows.filter(r => r.beforeOrder)
  const expIsOrder = rows.filter(r => r.exp === r.od).length

  const spendByVendor = useMemo(() => {
    const m = new Map()
    proc.spend.rows.forEach(r => m.set(r.vn, (m.get(r.vn) || 0) + r.amt))
    return m
  }, [proc])

  const vendors = useMemo(() => {
    const m = new Map()
    rows.forEach(r => {
      const v = m.get(r.vn) || { vn: r.vn, v: r.v || r.vn, receipts: 0, late: 0, lateDays: 0, worst: 0 }
      v.receipts++
      if (r.late > 0) { v.late++; v.lateDays += r.late; v.worst = Math.max(v.worst, r.late) }
      m.set(r.vn, v)
    })
    return [...m.values()].map(v => ({
      ...v,
      onTimePct: pct(v.receipts - v.late, v.receipts),
      avgLate: v.late ? v.lateDays / v.late : 0,
      spend: spendByVendor.get(v.vn) || 0,
    })).sort((a, b) => b.receipts - a.receipts)
  }, [rows, spendByVendor])

  const scored = vendors.filter(v => v.receipts >= MIN_RECEIPTS)
  const byMonth = useMemo(() => {
    const months = [...new Set(rows.map(r => r.pd.slice(0, 7)))].sort()
    return months.map(m => {
      const rs = rows.filter(r => r.pd.slice(0, 7) === m)
      return { m, 'On time': rs.filter(r => r.late <= 0).length, Late: rs.filter(r => r.late > 0).length }
    })
  }, [rows])
  const worstVendors = vendors.filter(v => v.late > 0).sort((a, b) => b.late - a.late).slice(0, 10)

  // Radar: the selected vendor against the median scored vendor, three measures that can be
  // computed from these feeds. Volume and spend are shown relative to the largest vendor so
  // all axes share a 0-100 scale; "quality" isn't here because no feed carries returns/rejections.
  const chosen = scored.find(v => v.vn === picked) || scored[0]
  const maxReceipts = Math.max(...scored.map(v => v.receipts), 1)
  const maxSpend = Math.max(...scored.map(v => v.spend), 1)
  const radarData = chosen ? [
    { axis: 'On-time %', vendor: chosen.onTimePct, typical: median(scored.map(v => v.onTimePct)) },
    { axis: 'Receipt volume (vs busiest)', vendor: pct(chosen.receipts, maxReceipts), typical: median(scored.map(v => pct(v.receipts, maxReceipts))) },
    { axis: 'Spend (vs largest)', vendor: pct(chosen.spend, maxSpend), typical: median(scored.map(v => pct(v.spend, maxSpend))) },
  ] : []

  const lateAvg = lateRows.length ? sumBy(lateRows, r => r.late) / lateRows.length : 0

  return (
    <div className="space-y-4">
      <Notice tone="info" title="How on-time delivery is measured here">
        A receipt counts as on time when it was posted on or before its <strong>expected receipt date</strong>. The promised and requested receipt dates are blank on{' '}
        <strong>{fmtInt(vd.count - vd.withPromisedDate)}</strong> of {fmtInt(vd.count)} receipts, so the expected date is the only target available.
      </Notice>
      {(pct(beforeOrder.length, rows.length) > 10 || pct(expIsOrder, rows.length) > 50) && (
        <Notice tone="warn" title="Treat the overall on-time rate with caution — it mostly reflects when receipts are booked, not vendor lead times">
          The expected date equals the order date on <strong>{pct(expIsOrder, rows.length).toFixed(0)}%</strong> of receipts, and{' '}
          <strong>{fmtInt(beforeOrder.length)}</strong> receipts ({pct(beforeOrder.length, rows.length).toFixed(0)}%) were posted <em>before</em> their own order date — so many purchases
          are being receipted at the point of purchase (typically services), and none of the receipts is linked to a PO number. The <strong>{fmtInt(lateRows.length)} genuinely late
          receipts</strong> below are the reliable signal. There is no returns or rejection data in any feed, so a quality score can't be calculated.
        </Notice>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Receipts analysed" value={fmtInt(rows.length)} sub={`${fmtInt(vendors.length)} vendors`} accent={NAVY} />
        <Kpi label="Posted on/before expected" value={`${pct(onTime, rows.length).toFixed(1)}%`} sub="see caution above" accent={DTEAL} />
        <Kpi label="Late receipts" value={fmtInt(lateRows.length)} sub={`${pct(lateRows.length, rows.length).toFixed(1)}% of receipts`} accent={RED} />
        <Kpi label="Average days late" value={lateRows.length ? `${lateAvg.toFixed(1)} days` : '—'} sub={`Worst ${Math.max(0, ...lateRows.map(r => r.late))} days`} accent={ORANGE} />
        <Kpi label="Vendors with a late receipt" value={fmtInt(vendors.filter(v => v.late > 0).length)} sub={`of ${fmtInt(vendors.length)} vendors`} accent={BLUE} />
        <Kpi label="Posted before order date" value={fmtInt(beforeOrder.length)} sub={`${pct(beforeOrder.length, rows.length).toFixed(0)}% of receipts`} accent={NAVY} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Receipts by month" subtitle="By posting date · on time vs late">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis {...monthAxis('m')} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={fmtMonth} />
              <Legend iconType="circle" iconSize={8} formatter={legendFormatter} />
              <Bar dataKey="On time" stackId="a" fill={TEAL} />
              <Bar dataKey="Late" stackId="a" fill={RED} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Vendors with the most late receipts" subtitle="Top 10 by number of receipts posted after the expected date">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={worstVendors} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="v" width={150} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={x => truncateLabel(x, 22)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(x, _n, p) => [`${x} late of ${p.payload.receipts} receipts · avg ${p.payload.avgLate.toFixed(1)} days late`, 'Late']} />
              <Bar dataKey="late" fill={RED} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {chosen && (
        <Panel
          title="Vendor scorecard"
          subtitle={`Vendors with at least ${MIN_RECEIPTS} receipts (${fmtInt(scored.length)} of ${fmtInt(vendors.length)}) · spend is invoiced ETB from the spend feed`}
          right={
            <select
              value={chosen.vn}
              onChange={e => setPicked(e.target.value)}
              className="text-xs border border-border rounded-xl px-3 py-2 text-ink outline-none focus:border-navy bg-transparent max-w-[260px]"
            >
              {scored.map(v => <option key={v.vn} value={v.vn} style={{ color: '#0F5565' }}>{truncateLabel(v.v, 34)}</option>)}
            </select>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <p className="text-[11px] text-muted mb-1">
                <strong className="text-ink">{chosen.v}</strong> vs the median scored vendor — pick another vendor above.
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} outerRadius="70%">
                  <PolarGrid stroke="var(--chart-grid)" />
                  <PolarAngleAxis dataKey="axis" tick={{ ...AXIS_TICK, fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: '#6B7780' }} axisLine={false} />
                  <Radar name={truncateLabel(chosen.v, 22)} dataKey="vendor" stroke={ORANGE} fill={ORANGE} fillOpacity={0.35} />
                  <Radar name="Median vendor" dataKey="typical" stroke={TEAL} fill={TEAL} fillOpacity={0.2} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={x => `${Number(x).toFixed(0)}`} />
                  <Legend iconType="circle" iconSize={8} formatter={legendFormatter} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="lg:col-span-3">
              <DrillTable
                maxHeight={330}
                rows={scored}
                columns={[
                  { key: 'v', label: 'Vendor', align: 'left', format: x => truncateLabel(x, 26) },
                  { key: 'receipts', label: 'Receipts' },
                  { key: 'onTimePct', label: 'On time', format: x => `${x.toFixed(0)}%`, color: r => (r.onTimePct < 85 ? RED : r.onTimePct < 95 ? ORANGE : GREEN) },
                  { key: 'late', label: 'Late', color: r => (r.late ? RED : 'var(--tbl-fg)') },
                  { key: 'avgLate', label: 'Avg days late', format: (x, r) => (r.late ? x.toFixed(1) : '—') },
                  { key: 'spend', label: 'Spend (ETB)', format: x => (x ? Math.round(x).toLocaleString() : '—') },
                ]}
              />
            </div>
          </div>
        </Panel>
      )}

      <Panel title="Late receipts" subtitle={`${fmtInt(lateRows.length)} receipts posted after the expected date · longest delay first`}>
        <DrillTable
          maxHeight={380}
          rows={[...lateRows].sort((a, b) => b.late - a.late).slice(0, 50)}
          emptyLabel="No late receipts."
          columns={[
            { key: 'no', label: 'Receipt', align: 'left' },
            { key: 'v', label: 'Vendor', align: 'left', format: (x, r) => truncateLabel(x || r.vn, 34) },
            { key: 'od', label: 'Ordered', format: fmtDay },
            { key: 'exp', label: 'Expected', format: fmtDay },
            { key: 'pd', label: 'Posted', format: fmtDay },
            { key: 'late', label: 'Days late', color: r => (r.late > 14 ? RED : ORANGE) },
          ]}
        />
      </Panel>
    </div>
  )
}

export default function VendorPerformance({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="Vendor Performance" title="Vendor Performance Dashboard" subtitle="Delivery timeliness and spend by vendor" asOf={data?.asOf} />
      <ProcData data={data} need="vendorDelivery">{proc => <Body proc={proc} />}</ProcData>
    </div>
  )
}
