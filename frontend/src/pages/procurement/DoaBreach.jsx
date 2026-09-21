import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  NAVY, TEAL, ORANGE, RED, DTEAL, BLUE, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  fmtMoney, fmtInt, fmtDay, truncateLabel, sumBy, groupBy, daysBetween,
  Kpi, Panel, Notice, PageHeader, DrillTable, ProcData, ForeignNote,
} from './shared.jsx'

function Body({ proc }) {
  const [pendingOnly, setPendingOnly] = useState(false)
  const asOf = proc.asOfDate || new Date().toISOString().slice(0, 10)
  const all = proc.po.rows
  const etb = useMemo(() => all.filter(r => r.cur === 'ETB'), [all])

  // A PO breaches delegation of authority when its value exceeds the approver's purchase
  // approval limit — unless that approver has unlimited approval or is an approval administrator.
  const withFlag = useMemo(() => etb.map(r => ({ ...r, breach: !r.unl && !r.adm && r.amt > (r.lim || 0) })), [etb])
  const breaches = withFlag.filter(r => r.breach)
  const pending = withFlag.filter(r => r.st === 'Pending Approval')

  const approvers = useMemo(() => {
    const m = new Map()
    withFlag.forEach(r => {
      const a = m.get(r.ap) || { ap: r.ap, n: 0, total: 0, max: 0, lim: r.lim, unl: r.unl, adm: r.adm, pending: 0, breaches: 0 }
      a.n++; a.total += r.amt; a.max = Math.max(a.max, r.amt)
      if (r.st === 'Pending Approval') a.pending++
      if (r.breach) a.breaches++
      m.set(r.ap, a)
    })
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [withFlag])

  const limitsConfigured = approvers.filter(a => a.lim > 0 || a.unl).length
  const allZero = approvers.length > 0 && approvers.every(a => !a.lim && !a.unl)
  const byBand = groupBy(withFlag, r => (r.amt >= 5e6 ? '5M+' : r.amt >= 1e6 ? '1M-5M' : r.amt >= 250e3 ? '250K-1M' : r.amt >= 50e3 ? '50K-250K' : '<50K'), r => r.amt)
  const BAND_ORDER = ['<50K', '50K-250K', '250K-1M', '1M-5M', '5M+']
  const bandData = BAND_ORDER.map(k => byBand.find(b => b.key === k) || { key: k, n: 0, total: 0 })

  const listRows = [...(pendingOnly ? pending : withFlag)].sort((a, b) => b.amt - a.amt).slice(0, 40)

  return (
    <div className="space-y-4">
      {allZero && (
        <Notice tone="warn" title="Approval limits are not configured in Business Central — treat these flags as a setup gap, not confirmed breaches">
          All <strong>{approvers.length}</strong> approvers show a purchase approval limit of <strong>0</strong> and none has unlimited approval, so a strict
          check flags every PO except those handled by an approval administrator ({fmtInt(withFlag.filter(r => r.adm).length)} POs). Fill in each user's
          purchase amount approval limit in Business Central's User Setup and this report will start separating genuine breaches from normal approvals.
        </Notice>
      )}
      {all.every(r => r.ap === r.asg) && (
        <Notice tone="info" title="Approver and assigned user are identical on every PO">
          This endpoint returns the same user as both the assigned user and the approver for all {fmtInt(all.length)} POs, so it shows who is <em>set up</em> to approve a PO,
          not who actually approved it. A true segregation-of-duties check (creator ≠ approver) needs the approval-entry history.
        </Notice>
      )}
      <ForeignNote rows={all} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Purchase orders" value={fmtInt(withFlag.length)} sub={fmtMoney(sumBy(withFlag, r => r.amt))} accent={NAVY} />
        <Kpi label="Above approver's limit" value={fmtInt(breaches.length)} sub={fmtMoney(sumBy(breaches, r => r.amt))} accent={RED} />
        <Kpi label="Approvers with a limit set" value={`${limitsConfigured} of ${approvers.length}`} sub="Limit > 0 or unlimited" accent={limitsConfigured ? DTEAL : ORANGE} />
        <Kpi
          label="Pending approval"
          value={fmtInt(pending.length)}
          sub={fmtMoney(sumBy(pending, r => r.amt))}
          accent={ORANGE}
          onClick={() => setPendingOnly(p => !p)}
          selected={pendingOnly}
        />
        <Kpi label="Approval administrators" value={fmtInt(approvers.filter(a => a.adm).length)} sub={`${fmtInt(withFlag.filter(r => r.adm).length)} POs`} accent={BLUE} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="POs by value band" subtitle="How much of the order book sits at each approval-relevant size">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={bandData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="key" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, name, p) => (name === 'n' ? [`${fmtInt(v)} POs · ${fmtMoney(p.payload.total)}`, 'POs'] : [v, name])} />
              <Bar dataKey="n" name="n" fill={TEAL} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Approvers by value approved" subtitle="Top 10">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={approvers.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => fmtMoney(v, '').trim()} />
              <YAxis type="category" dataKey="ap" width={110} interval={0} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.n} POs`, 'Value']} />
              <Bar dataKey="total" fill={ORANGE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Approvers" subtitle="Approval limit as configured in Business Central">
        <DrillTable
          maxHeight={360}
          rows={approvers}
          columns={[
            { key: 'ap', label: 'Approver', align: 'left' },
            { key: 'n', label: 'POs' },
            { key: 'total', label: 'Total value', format: v => Math.round(v).toLocaleString() },
            { key: 'max', label: 'Largest PO', format: v => Math.round(v).toLocaleString() },
            { key: 'lim', label: 'Approval limit', format: (v, r) => (r.unl ? 'Unlimited' : v ? Math.round(v).toLocaleString() : 'Not set'), color: r => (!r.unl && !r.lim ? ORANGE : '#FFFFFF') },
            { key: 'adm', label: 'Administrator', format: v => (v ? 'Yes' : '—') },
            { key: 'pending', label: 'Pending' },
            { key: 'breaches', label: 'Above limit', color: r => (r.breaches ? RED : '#FFFFFF') },
          ]}
        />
      </Panel>

      <Panel
        title={pendingOnly ? 'POs pending approval' : 'Largest purchase orders'}
        subtitle={`${fmtInt(pendingOnly ? pending.length : withFlag.length)} POs · showing the 40 largest`}
        right={pendingOnly && <button onClick={() => setPendingOnly(false)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border text-muted hover:text-navy">Show all</button>}
      >
        <DrillTable
          maxHeight={420}
          rows={listRows}
          columns={[
            { key: 'no', label: 'PO', align: 'left' },
            { key: 'v', label: 'Vendor', align: 'left', format: (v, r) => truncateLabel(v || r.vn, 30) },
            { key: 'ap', label: 'Approver' },
            { key: 'st', label: 'Status', color: r => (r.st === 'Pending Approval' ? ORANGE : '#FFFFFF') },
            { key: 'od', label: 'Ordered', format: fmtDay },
            { key: 'age', label: 'Days open', format: (_v, r) => (r.od ? daysBetween(r.od, asOf) : '—') },
            { key: 'amt', label: 'Amount (ETB)', format: v => Math.round(v).toLocaleString() },
            { key: 'breach', label: 'Vs limit', format: (v, r) => (r.adm ? 'Admin' : v ? 'Above' : 'Within'), color: r => (r.breach ? RED : '#FFFFFF') },
          ]}
        />
      </Panel>
    </div>
  )
}

export default function DoaBreach({ data }) {
  return (
    <div className="space-y-4">
      <PageHeader category="Compliance" title="Procurement DOA Breach Report" subtitle="Purchase orders against approvers' delegation-of-authority limits" asOf={data?.asOf} />
      <ProcData data={data} need="doa">{proc => <Body proc={proc} />}</ProcData>
    </div>
  )
}
