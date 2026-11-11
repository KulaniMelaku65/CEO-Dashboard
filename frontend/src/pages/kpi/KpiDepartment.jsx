import { Fragment, useEffect, useState } from 'react'
import { kpi } from '../../lib/api.js'
import { NAVY, ROW_BG, ragColor, ragLabel, currentPeriod } from './ragColors.js'
import { KPI_DEPARTMENTS } from './departments.js'

const FREQUENCIES = ['Monthly', 'Quarterly', 'H1/H2', 'Yearly']
const KPI_TYPES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const METHODS = [['A', 'Automated'], ['S', 'Semi-automated'], ['M', 'Manual']]

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

function fmtDeadline(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const emptyForm = { name: '', type: 'T2', targetNote: '', frequency: 'Monthly', source: '', method: 'M', targetValue: '', weight: '1' }

// Shared form used for both "Add KPI" and "Edit KPI" — a dept_head only ever sees/edits
// the descriptive fields (what the KPI is, how often it's reported); target value and
// weight only appear for approver/finance_admin, since setting targets/thresholds is a
// Group CFO / Chief of Staff privilege per the PRD, not a department head's.
function KpiForm({ initial, isPrivileged, onSave, onCancel, busy, saveLabel }) {
  const [f, setF] = useState(initial)
  const set = (k) => (e) => setF(cur => ({ ...cur, [k]: e.target.value }))
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      <input value={f.name} onChange={set('name')} placeholder="KPI name" className="bg-transparent border border-border rounded-lg px-2 py-1.5 text-ink text-xs col-span-2 md:col-span-1" />
      <select value={f.type} onChange={set('type')} className="bg-white border border-border rounded-lg px-2 py-1.5 text-ink text-xs">
        {KPI_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={f.frequency} onChange={set('frequency')} className="bg-white border border-border rounded-lg px-2 py-1.5 text-ink text-xs">
        {FREQUENCIES.map(fr => <option key={fr} value={fr}>{fr}</option>)}
      </select>
      <input value={f.targetNote} onChange={set('targetNote')} placeholder="Target (e.g. ≤10%, 4 live)" className="bg-transparent border border-border rounded-lg px-2 py-1.5 text-ink text-xs col-span-2 md:col-span-1" />
      <input value={f.source} onChange={set('source')} placeholder="Source (e.g. HRIS)" className="bg-transparent border border-border rounded-lg px-2 py-1.5 text-ink text-xs" />
      <select value={f.method} onChange={set('method')} className="bg-white border border-border rounded-lg px-2 py-1.5 text-ink text-xs">
        {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {isPrivileged && (
        <>
          <input value={f.targetValue} onChange={set('targetValue')} type="number" placeholder="Numeric target (optional)" className="bg-transparent border border-border rounded-lg px-2 py-1.5 text-ink text-xs" />
          <input value={f.weight} onChange={set('weight')} type="number" step="0.1" placeholder="Weight" className="bg-transparent border border-border rounded-lg px-2 py-1.5 text-ink text-xs" />
        </>
      )}
      <div className="flex gap-2 col-span-2 md:col-span-3 mt-1">
        <button
          onClick={() => onSave(f)}
          disabled={busy || !f.name.trim()}
          className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
          style={{ background: NAVY }}
        >
          {saveLabel}
        </button>
        <button onClick={onCancel} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border text-muted">
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function KpiDepartment({ departmentId, currentUser, onNavigate }) {
  const [period] = useState(currentPeriod())
  const [rows, setRows] = useState(null)
  const [edits, setEdits] = useState({}) // kpiId -> { actualValue, reasonNote, actionNote }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [freqFilter, setFreqFilter] = useState('All')
  const [addingKpi, setAddingKpi] = useState(false)
  const [editingKpiId, setEditingKpiId] = useState(null)

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
  const canManageDictionary = isOwnDeptHead || isApprover // add/remove/edit the KPI list itself
  const allDraftOrEmpty = rows?.every(r => !r.submission || r.submission.status === 'draft')
  const anySubmitted = rows?.some(r => r.submission?.status === 'submitted')

  const today = new Date().toISOString().slice(0, 10)
  const visibleRows = (rows || []).filter(r => freqFilter === 'All' || r.kpi.frequency === freqFilter)
  const freqCounts = FREQUENCIES.reduce((m, f) => ({ ...m, [f]: (rows || []).filter(r => r.kpi.frequency === f).length }), {})

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
    const call = action === 'approve' ? kpi.approve : action === 'reject' ? kpi.reject : kpi.reopen
    const r = await call(submissionId)
    setBusy(false)
    if (r.ok) load()
  }

  // Approving/rejecting a dept_head's proposed dictionary add/remove — separate from
  // decide() above, which is for monthly submission approvals.
  const decideDictionaryChange = async (kpiId, action) => {
    setBusy(true); setError(null); setNotice(null)
    const call = action === 'approve' ? kpi.approveDictionaryChange : kpi.rejectDictionaryChange
    const r = await call(kpiId)
    setBusy(false)
    if (!r.ok) { setError('Could not record that decision.'); return }
    setNotice(action === 'approve' ? 'Change approved.' : 'Change rejected.')
    load()
  }

  const addKpi = async (f) => {
    setBusy(true); setError(null)
    const r = await kpi.createDictionaryRow({
      departmentId, name: f.name.trim(), type: f.type, targetNote: f.targetNote || null,
      frequency: f.frequency, source: f.source || null, method: f.method,
      targetValue: f.targetValue === '' ? null : Number(f.targetValue),
      weight: f.weight === '' ? 1 : Number(f.weight),
    })
    setBusy(false)
    if (!r.ok) { setError('Could not add that KPI.'); return }
    setAddingKpi(false)
    setNotice(isApprover ? 'KPI added.' : 'Proposed — awaiting SLT approval.')
    load()
  }

  const saveEdit = async (kpiId, f) => {
    setBusy(true); setError(null)
    const r = await kpi.updateDictionaryRow(kpiId, {
      name: f.name.trim(), type: f.type, targetNote: f.targetNote || null,
      frequency: f.frequency, source: f.source || null, method: f.method,
      ...(isApprover ? { targetValue: f.targetValue === '' ? null : Number(f.targetValue), weight: f.weight === '' ? 1 : Number(f.weight) } : {}),
    })
    setBusy(false)
    if (!r.ok) { setError('Could not save that change.'); return }
    setEditingKpiId(null)
    load()
  }

  const removeKpi = async (row) => {
    const msg = isApprover
      ? `Remove "${row.kpi.name}" from this department's KPIs? Past submissions are kept, but it stops appearing going forward.`
      : `Propose removing "${row.kpi.name}"? This needs SLT approval before it actually disappears.`
    if (!confirm(msg)) return
    setBusy(true); setError(null)
    const r = await kpi.removeDictionaryRow(row.kpi.id)
    setBusy(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || 'Could not remove that KPI.')
      return
    }
    setNotice(isApprover ? 'KPI removed.' : 'Proposed — awaiting SLT approval.')
    load()
  }

  const columnCount = 6 + (isApprover ? 1 : 0) + (canManageDictionary ? 1 : 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button onClick={() => onNavigate?.('kpi-dashboard')} className="text-[11px] font-bold text-muted hover:text-ink mb-1">
            ← Group KPI Dashboard
          </button>
          <h2 className="text-lg font-extrabold text-ink mb-0.5">{deptMeta?.name}</h2>
          <p className="text-xs text-muted font-medium">{period}{isOwnDeptHead ? ' — enter this month\'s actuals below' : ' — read-only'}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageDictionary && (
            <button onClick={() => setAddingKpi(o => !o)} className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-ink hover:border-navy transition-colors">
              {addingKpi ? 'Cancel' : '+ Add KPI'}
            </button>
          )}
          {isOwnDeptHead && allDraftOrEmpty && (
            <div className="flex gap-2">
              <button onClick={saveDraft} disabled={busy} className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-muted hover:text-ink hover:border-navy transition-colors">
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
      </div>

      {/* Reporting-frequency filter — a display/filter attribute only; every KPI still
          lives in the same monthly submission mechanism regardless of this. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {['All', ...FREQUENCIES].map(f => (
          <button
            key={f}
            onClick={() => setFreqFilter(f)}
            className="text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors"
            style={freqFilter === f
              ? { background: NAVY, borderColor: NAVY, color: '#fff' }
              : { borderColor: 'rgba(2,64,79,.25)', color: '#6B7780' }}
          >
            {f}{f !== 'All' && ` (${freqCounts[f] || 0})`}
          </button>
        ))}
      </div>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}
      {notice && <p className="text-xs font-semibold" style={{ color: '#2E7D32' }}>{notice}</p>}

      {addingKpi && (
        <div className="rounded-2xl border border-border p-4" style={{ background: ROW_BG.even }}>
          <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">New KPI</p>
          <KpiForm
            initial={emptyForm}
            isPrivileged={isApprover}
            onSave={addKpi}
            onCancel={() => setAddingKpi(false)}
            busy={busy}
            saveLabel="Add KPI"
          />
        </div>
      )}

      {rows && (
        <div className="rounded-2xl border border-border shadow-card overflow-x-auto" style={{ background: ROW_BG.even }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--tbl-head-bg)', borderBottom: '1px solid var(--tbl-line)' }}>
                <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">KPI</th>
                <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Target</th>
                <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Deadline</th>
                <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Actual</th>
                <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Reason / action (if Amber or Red)</th>
                {isApprover && <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Approve</th>}
                {canManageDictionary && <th className="text-left font-bold text-muted uppercase tracking-wider px-4 py-3">Manage</th>}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr><td colSpan={columnCount} className="px-4 py-6 text-center text-muted">No {freqFilter.toLowerCase()} KPIs.</td></tr>
              )}
              {visibleRows.map((row, i) => {
                const e = getEdit(row)
                const status = row.submission?.rag_status ?? null
                const isPendingAdd = row.kpi.pending_action === 'add'
                const isPendingRemove = row.kpi.pending_action === 'remove'
                const editableRow = isOwnDeptHead && (!row.submission || row.submission.status === 'draft') && !isPendingAdd
                const needsReason = status === 'amber' || status === 'red'
                const isOverdue = row.deadline && row.deadline < today && row.submission?.status !== 'approved'
                const isEditing = editingKpiId === row.kpi.id
                return (
                  <Fragment key={row.kpi.id}>
                    <tr style={{ background: i % 2 ? ROW_BG.odd : ROW_BG.even }}>
                      <td className="px-4 py-2.5 text-ink font-bold whitespace-nowrap">
                        {row.kpi.name}
                        <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-muted" style={{ background: 'var(--tone-muted-bg)' }}>{row.kpi.frequency}</span>
                        {row.kpi.pending_action && (
                          <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(240,180,41,.2)', color: '#F0B429' }}>
                            Pending SLT approval — {isPendingAdd ? 'add' : 'remove'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted whitespace-nowrap">{fmtTarget(row)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: isOverdue ? '#D32F2F' : 'var(--tbl-fg-muted)' }}>{fmtDeadline(row.deadline)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {isPendingAdd ? (
                          <span className="text-muted text-[11px]">—</span>
                        ) : editableRow ? (
                          <input
                            type="number"
                            value={e.actualValue}
                            onChange={ev => setEdit(row.kpi.id, { actualValue: ev.target.value })}
                            className="w-28 bg-transparent border border-border rounded-lg px-2 py-1 text-ink text-xs"
                            placeholder="—"
                          />
                        ) : (
                          <span className="text-ink font-semibold">{row.submission?.actual_value ?? '—'}</span>
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
                              className="bg-transparent border border-border rounded-lg px-2 py-1 text-ink text-[11px] w-full"
                            />
                            <input
                              value={e.actionNote}
                              onChange={ev => setEdit(row.kpi.id, { actionNote: ev.target.value })}
                              placeholder="Action being taken"
                              className="bg-transparent border border-border rounded-lg px-2 py-1 text-ink text-[11px] w-full"
                            />
                          </div>
                        ) : (
                          <span className="text-muted">{row.submission?.reason_note || '—'}</span>
                        )}
                      </td>
                      {isApprover && (
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {row.kpi.pending_action ? (
                            <div className="flex gap-1.5">
                              <button onClick={() => decideDictionaryChange(row.kpi.id, 'approve')} disabled={busy} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(46,189,133,.2)', color: '#2E7D32' }}>
                                Approve {isPendingAdd ? 'add' : 'removal'}
                              </button>
                              <button onClick={() => decideDictionaryChange(row.kpi.id, 'reject')} disabled={busy} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(229,84,75,.2)', color: '#D32F2F' }}>Reject</button>
                            </div>
                          ) : row.submission?.status === 'submitted' ? (
                            <div className="flex gap-1.5">
                              <button onClick={() => decide(row.submission.id, 'approve')} disabled={busy} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(46,189,133,.2)', color: '#2E7D32' }}>Approve</button>
                              <button onClick={() => decide(row.submission.id, 'reject')} disabled={busy} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(229,84,75,.2)', color: '#D32F2F' }}>Reject</button>
                            </div>
                          ) : row.submission?.status === 'approved' ? (
                            <button onClick={() => decide(row.submission.id, 'reopen')} disabled={busy} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(63,167,225,.2)', color: '#3FA7E1' }}>Reopen</button>
                          ) : (
                            <span className="text-muted text-[10px]">{row.submission?.status || 'not submitted'}</span>
                          )}
                        </td>
                      )}
                      {canManageDictionary && (
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex gap-1.5">
                            <button onClick={() => setEditingKpiId(o => o === row.kpi.id ? null : row.kpi.id)} className="text-[10px] font-bold px-2 py-1 rounded-lg border border-border text-muted hover:text-ink">
                              {isEditing ? 'Close' : 'Edit'}
                            </button>
                            <button onClick={() => removeKpi(row)} disabled={busy || isPendingRemove} className="text-[10px] font-bold px-2 py-1 rounded-lg disabled:opacity-40" style={{ background: 'rgba(229,84,75,.15)', color: '#D32F2F' }}>
                              {isPendingRemove ? 'Pending' : 'Remove'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isEditing && (
                      <tr style={{ background: 'var(--tbl-row-sub)' }}>
                        <td colSpan={columnCount} className="px-4 py-3">
                          <KpiForm
                            initial={{
                              name: row.kpi.name, type: row.kpi.type, targetNote: row.kpi.target_note || '',
                              frequency: row.kpi.frequency, source: row.kpi.source || '', method: row.kpi.method || 'M',
                              targetValue: row.kpi.target_value ?? '', weight: row.kpi.weight ?? '1',
                            }}
                            isPrivileged={isApprover}
                            onSave={(f) => saveEdit(row.kpi.id, f)}
                            onCancel={() => setEditingKpiId(null)}
                            busy={busy}
                            saveLabel="Save changes"
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
