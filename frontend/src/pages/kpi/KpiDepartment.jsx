import { useEffect, useState } from 'react'
import { kpi } from '../../lib/api.js'
import { NAVY, ROW_BG, ragColor, ragLabel, currentPeriod } from './ragColors.js'
import { KPI_DEPARTMENTS } from './departments.js'

function RagPill({ status }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
      style={{ background: `${ragColor(status)}33`, color: ragColor(status) }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ragColor(status) }} />
      {ragLabel(status)}
    </span>
  )
}

function fmtTarget(row) {
  if (row.kpi.target_note) return row.kpi.target_note
  return row.phasedTarget != null ? String(row.phasedTarget) : '—'
}

export default function KpiDepartment({ departmentId, currentUser, onNavigate }) {
  const [period] = useState(currentPeriod())
  const [rows, setRows] = useState(null)
  const [edits, setEdits] = useState({}) // kpiId -> { actualValue, reasonNote, actionNote }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const deptMeta = KPI_DEPARTMENTS.find(d => d.id === departmentId)

  const load = () => {
    kpi.submissions(departmentId, period)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setRows(data); setEdits({}) })
      .catch(() => setError('Could not load this department\'s KPIs.'))
  }
  useEffect(load, [departmentId, period])

  const role = currentUser?.kpiRole
  const isOwnDeptHead = role === 'dept_head' && currentUser?.kpiDepartmentId === departmentId
  const isApprover = role === 'approver' || role === 'finance_admin'
  const allDraftOrEmpty = rows?.every(r => !r.submission || r.submission.status === 'draft')
  const anySubmitted = rows?.some(r => r.submission?.status === 'submitted')

  const getEdit = (row) => edits[row.kpi.id] ?? {
    actualValue: row.submission?.actual_value ?? '',
    reasonNote: row.submission?.reason_note ?? '',
    actionNote: row.submission?.action_note ?? '',
  }
  // RAG status shown is always the server-cached value from the last save — recomputed by
  // kpi-rag-engine.js on every saveDraft, not guessed client-side while the input is being
  // typed into (avoids a flash of a wrong color before the value is actually saved).
  const setEdit = (kpiId, patch) => setEdits(cur => ({ ...cur, [kpiId]: { ...(cur[kpiId] ?? {}), ...patch } }))

  const saveDraft = async () => {
    setBusy(true); setError(null); setNotice(null)
    const values = Object.entries(edits).map(([kpiId, e]) => ({
      kpiId: Number(kpiId),
      actualValue: e.actualValue === '' ? null : Number(e.actualValue),
      reasonNote: e.reasonNote || null,
      actionNote: e.actionNote || null,
    }))
    const r = await kpi.saveDraft(departmentId, period, values)
    setBusy(false)
    if (!r.ok) { setError('Could not save — try again.'); return }
    setNotice('Draft saved.')
    load()
  }

  const submit = async () => {
    setBusy(true); setError(null); setNotice(null)
    await saveDraft()
    const r = await kpi.submit(departmentId, period)
    setBusy(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || 'Could not submit.')
      return
    }
    setNotice('Submitted for approval.')
    load()
  }

  const decide = async (submissionId, action) => {
    setBusy(true)
    const r = action === 'approve' ? await kpi.approve(submissionId) : await kpi.reject(submissionId)
    setBusy(false)
    if (r.ok) load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button onClick={() => onNavigate?.('kpi-dashboard')} className="text-[11px] font-bold text-muted hover:text-navy mb-1">
            ← Group KPI Dashboard
          </button>
          <h2 className="text-lg font-extrabold text-navy mb-0.5">{deptMeta?.name}</h2>
          <p className="text-xs text-muted font-medium">{period}{isOwnDeptHead ? ' — enter this month\'s actuals below' : ' — read-only'}</p>
        </div>
        {isOwnDeptHead && allDraftOrEmpty && (
          <div className="flex gap-2">
            <button onClick={saveDraft} disabled={busy} className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-navy hover:border-navy transition-colors">
              Save draft
            </button>
            <button onClick={submit} disabled={busy} className="text-[11px] font-bold px-4 py-2 rounded-xl text-white" style={{ background: NAVY }}>
              Submit for approval
            </button>
          </div>
        )}
        {isOwnDeptHead && anySubmitted && (
          <span className="text-[11px] font-bold text-muted">Submitted — waiting on approval</span>
        )}
      </div>

      {error && <p className="text-xs font-semibold" style={{ color: '#E5544B' }}>{error}</p>}
      {notice && <p className="text-xs font-semibold" style={{ color: '#2EBD85' }}>{notice}</p>}

      {rows && (
        <div className="rounded-2xl border border-border shadow-card overflow-x-auto" style={{ background: ROW_BG.even }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: NAVY }}>
                <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">KPI</th>
                <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Target</th>
                <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Actual</th>
                <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Reason / action (if Amber or Red)</th>
                <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Source</th>
                {isApprover && <th className="text-left font-bold text-white/60 uppercase tracking-wider px-4 py-3">Approve</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const e = getEdit(row)
                const status = row.submission?.rag_status ?? null
                const editableRow = isOwnDeptHead && (!row.submission || row.submission.status === 'draft')
                const needsReason = status === 'amber' || status === 'red'
                return (
                  <tr key={row.kpi.id} style={{ background: i % 2 ? ROW_BG.odd : ROW_BG.even }}>
                    <td className="px-4 py-2.5 text-white font-bold whitespace-nowrap">{row.kpi.name}</td>
                    <td className="px-4 py-2.5 text-white/60 whitespace-nowrap">{fmtTarget(row)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {editableRow ? (
                        <input
                          type="number"
                          value={e.actualValue}
                          onChange={ev => setEdit(row.kpi.id, { actualValue: ev.target.value })}
                          className="w-28 bg-transparent border border-white/20 rounded-lg px-2 py-1 text-white text-xs"
                          placeholder="—"
                        />
                      ) : (
                        <span className="text-white font-semibold">{row.submission?.actual_value ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><RagPill status={status} /></td>
                    <td className="px-4 py-2.5 min-w-[220px]">
                      {editableRow ? (
                        <div className="flex flex-col gap-1">
                          <input
                            value={e.reasonNote}
                            onChange={ev => setEdit(row.kpi.id, { reasonNote: ev.target.value })}
                            placeholder={needsReason ? 'Root cause (required)' : 'Root cause'}
                            className="bg-transparent border border-white/20 rounded-lg px-2 py-1 text-white text-[11px] w-full"
                          />
                          <input
                            value={e.actionNote}
                            onChange={ev => setEdit(row.kpi.id, { actionNote: ev.target.value })}
                            placeholder="Action being taken"
                            className="bg-transparent border border-white/20 rounded-lg px-2 py-1 text-white text-[11px] w-full"
                          />
                        </div>
                      ) : (
                        <span className="text-white/60">{row.submission?.reason_note || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-white/50 whitespace-nowrap">{row.kpi.source}</td>
                    {isApprover && (
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {row.submission?.status === 'submitted' ? (
                          <div className="flex gap-1.5">
                            <button onClick={() => decide(row.submission.id, 'approve')} disabled={busy} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(46,189,133,.2)', color: '#2EBD85' }}>Approve</button>
                            <button onClick={() => decide(row.submission.id, 'reject')} disabled={busy} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(229,84,75,.2)', color: '#E5544B' }}>Reject</button>
                          </div>
                        ) : (
                          <span className="text-white/30 text-[10px]">{row.submission?.status || 'not submitted'}</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
