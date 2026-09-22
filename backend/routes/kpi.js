const router = require('express').Router()
const db = require('../db')
const requireAuth = require('../middleware/auth')
const { requireKpiRole, requireOwnDepartment } = require('../middleware/requireKpiRole')
const { evaluateRag, baseType } = require('../services/kpi-rag-engine')
const { rollupDepartment, rollupGroup } = require('../services/kpi-rollup-engine')
const { reminderState, nextDeadlineForFrequency } = require('../services/kpi-reminder')

router.use(requireAuth)

const logAudit = db.prepare(`
  INSERT INTO kpi_audit_log (entity_type, entity_id, action, actor_user_id, detail_json)
  VALUES (?, ?, ?, ?, ?)
`)

// Phased monthly target: an explicit override if the CFO set one for this KPI+period,
// otherwise a straight-line split of the H2 target_value — but ONLY for cumulative-volume
// (T1) KPIs, where the H2 figure genuinely is 6 months of activity added together (e.g.
// "1,101,274 loans disbursed"). Every other type (T2 level/rate, T5 duration, T6 variance,
// T7 compliance ratio) is a point-in-time or ratio metric — "≤5% attrition" or "≥99.5%
// uptime" applies to each month as-is, and dividing it by 6 would silently produce a
// nonsensical monthly target (e.g. 0.83% attrition). PRD §4.4 only asks for phasing so a
// KPI "can be rated every month rather than only at period-end" — it doesn't require every
// type to be split evenly, just T1's.
function phasedTarget(kpi, period) {
  const override = db.prepare(
    'SELECT target_value FROM kpi_monthly_targets WHERE kpi_id = ? AND period = ?'
  ).get(kpi.id, period)
  if (override) return override.target_value
  if (kpi.target_value == null) return null
  return baseType(kpi.type) === 'T1' ? kpi.target_value / 6 : kpi.target_value
}

// GET /api/kpi/departments
router.get('/departments', (_req, res) => {
  res.json(db.prepare('SELECT * FROM kpi_departments ORDER BY sort_order').all())
})

// GET /api/kpi/dictionary?department=kpi-hr — a pending 'add' stays visible (is_active is
// still 0 until approved) so the proposer and any approver can see it's awaiting a decision;
// a pending 'remove' is already visible since it's still is_active = 1 until confirmed.
router.get('/dictionary', (req, res) => {
  const { department } = req.query
  const rows = department
    ? db.prepare("SELECT * FROM kpi_dictionary WHERE department_id = ? AND (is_active = 1 OR pending_action = 'add') ORDER BY sort_order").all(department)
    : db.prepare("SELECT * FROM kpi_dictionary WHERE is_active = 1 OR pending_action = 'add' ORDER BY department_id, sort_order").all()
  res.json(rows)
})

const FREQUENCIES = new Set(['Monthly', 'Quarterly', 'Yearly'])

// A department head manages their own department's KPI *list* (add/remove, description,
// how often it's reported) — but per the PRD, "Set the rules. Define targets, RAG
// thresholds..." is explicitly the Group CFO/Chief of Staff's job (§3.1). So a dept_head's
// writes here are restricted to the structural fields; target_value/rag_rule_json/weight
// only ever change via an approver/finance_admin, on any department.
const DEPT_HEAD_EDITABLE_FIELDS = ['name', 'type', 'targetNote', 'frequency', 'source', 'method']

function canManageDictionaryFor(kpiUser, departmentId) {
  if (kpiUser.kpi_role === 'approver' || kpiUser.kpi_role === 'finance_admin') return true
  return kpiUser.kpi_role === 'dept_head' && kpiUser.kpi_department_id === departmentId
}

// POST /api/kpi/dictionary — propose or add a new KPI. dept_head may only propose one for
// their own department, and it stays invisible/inactive until an approver signs off (see
// POST /dictionary/:id/approve-change); approver/finance_admin adding one goes live
// immediately — they're the approval authority, there's no one else to ask.
router.post('/dictionary', requireKpiRole('dept_head', 'approver', 'finance_admin'), (req, res) => {
  const { departmentId, name, type, targetNote, frequency, source, method, targetValue, weight } = req.body || {}
  if (!departmentId || !name) return res.status(400).json({ error: 'departmentId and name are required.' })
  if (!canManageDictionaryFor(req.kpiUser, departmentId)) {
    return res.status(403).json({ error: 'You can only add KPIs to your own department.' })
  }
  const freq = FREQUENCIES.has(frequency) ? frequency : 'Monthly'
  const isPrivileged = req.kpiUser.kpi_role === 'approver' || req.kpiUser.kpi_role === 'finance_admin'
  const nextSort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM kpi_dictionary WHERE department_id = ?').get(departmentId).n
  const info = db.prepare(`
    INSERT INTO kpi_dictionary (department_id, name, type, target_value, target_note, source, method, weight, frequency, sort_order, is_active, pending_action, requested_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    departmentId, name, type || 'T2',
    isPrivileged && targetValue != null ? targetValue : null,
    targetNote || null, source || null, method || null,
    isPrivileged && weight != null ? weight : 1,
    freq, nextSort,
    isPrivileged ? 1 : 0,
    isPrivileged ? null : 'add',
    isPrivileged ? null : req.user.id
  )
  logAudit.run('dictionary', String(info.lastInsertRowid), isPrivileged ? 'create' : 'propose_add', req.user.id, JSON.stringify(req.body))
  res.status(201).json(db.prepare('SELECT * FROM kpi_dictionary WHERE id = ?').get(info.lastInsertRowid))
})

// PUT /api/kpi/dictionary/:id — dept_head (own department, structural fields only) or
// approver/finance_admin (any department, any field including target/threshold/weight).
router.put('/dictionary/:id', requireKpiRole('dept_head', 'approver', 'finance_admin'), (req, res) => {
  const id = Number(req.params.id)
  const kpiRow = db.prepare('SELECT * FROM kpi_dictionary WHERE id = ?').get(id)
  if (!kpiRow) return res.status(404).json({ error: 'KPI not found.' })
  if (!canManageDictionaryFor(req.kpiUser, kpiRow.department_id)) {
    return res.status(403).json({ error: 'You can only edit your own department\'s KPIs.' })
  }
  const isPrivileged = req.kpiUser.kpi_role === 'approver' || req.kpiUser.kpi_role === 'finance_admin'
  const body = req.body || {}
  // A dept_head's request is silently narrowed to the structural fields rather than
  // rejected outright — lets the same "Edit" form work for both roles on the frontend.
  const patch = isPrivileged ? body : Object.fromEntries(Object.entries(body).filter(([k]) => DEPT_HEAD_EDITABLE_FIELDS.includes(k)))
  const { targetValue, targetNote, ragRuleJson, weight, isActive, name, type, frequency, source, method } = patch
  db.prepare(`
    UPDATE kpi_dictionary SET
      name = ?, type = ?, target_value = ?, target_note = ?, rag_rule_json = ?, weight = ?,
      frequency = ?, source = ?, method = ?, is_active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name != null ? name : kpiRow.name,
    type != null ? type : kpiRow.type,
    targetValue != null ? targetValue : kpiRow.target_value,
    targetNote != null ? targetNote : kpiRow.target_note,
    ragRuleJson !== undefined ? ragRuleJson : kpiRow.rag_rule_json,
    weight != null ? weight : kpiRow.weight,
    FREQUENCIES.has(frequency) ? frequency : kpiRow.frequency,
    source != null ? source : kpiRow.source,
    method != null ? method : kpiRow.method,
    isActive != null ? (isActive ? 1 : 0) : kpiRow.is_active,
    id
  )
  logAudit.run('dictionary', String(id), 'update', req.user.id, JSON.stringify(patch))
  res.json(db.prepare('SELECT * FROM kpi_dictionary WHERE id = ?').get(id))
})

// DELETE /api/kpi/dictionary/:id — remove a KPI, same ownership rule as PUT. A dept_head's
// request just flags it pending_action='remove' (stays active/visible until an approver
// confirms — see POST /dictionary/:id/approve-change); approver/finance_admin removes
// immediately. Always a soft delete (is_active = 0): history must stay intact.
router.delete('/dictionary/:id', requireKpiRole('dept_head', 'approver', 'finance_admin'), (req, res) => {
  const id = Number(req.params.id)
  const kpiRow = db.prepare('SELECT * FROM kpi_dictionary WHERE id = ?').get(id)
  if (!kpiRow) return res.status(404).json({ error: 'KPI not found.' })
  if (!canManageDictionaryFor(req.kpiUser, kpiRow.department_id)) {
    return res.status(403).json({ error: 'You can only remove your own department\'s KPIs.' })
  }
  const isPrivileged = req.kpiUser.kpi_role === 'approver' || req.kpiUser.kpi_role === 'finance_admin'
  if (isPrivileged) {
    db.prepare(`UPDATE kpi_dictionary SET is_active = 0, pending_action = NULL, updated_at = datetime('now') WHERE id = ?`).run(id)
    logAudit.run('dictionary', String(id), 'remove', req.user.id, JSON.stringify({ name: kpiRow.name }))
  } else {
    if (kpiRow.pending_action) return res.status(400).json({ error: 'This KPI already has a pending change awaiting approval.' })
    db.prepare(`UPDATE kpi_dictionary SET pending_action = 'remove', requested_by = ?, updated_at = datetime('now') WHERE id = ?`).run(req.user.id, id)
    logAudit.run('dictionary', String(id), 'propose_remove', req.user.id, JSON.stringify({ name: kpiRow.name }))
  }
  res.json({ ok: true })
})

// POST /api/kpi/dictionary/:id/approve-change | /reject-change — approver/finance_admin
// decides on a department head's proposed add or remove. Approving an 'add' just makes it
// an ordinary active row; approving a 'remove' soft-deletes it the same way a privileged
// user's own delete does. Rejecting either simply clears pending_action, reverting to
// whatever was true before the request (an unapproved add stays invisible; an unapproved
// remove stays active) — nothing is lost, so there's no separate "undo" needed.
function decideDictionaryChange(action) {
  return (req, res) => {
    const id = Number(req.params.id)
    const kpiRow = db.prepare('SELECT * FROM kpi_dictionary WHERE id = ?').get(id)
    if (!kpiRow) return res.status(404).json({ error: 'KPI not found.' })
    if (!kpiRow.pending_action) return res.status(400).json({ error: 'This KPI has no pending change.' })
    if (action === 'approve') {
      const isActive = kpiRow.pending_action === 'add' ? 1 : 0
      db.prepare(`UPDATE kpi_dictionary SET is_active = ?, pending_action = NULL, updated_at = datetime('now') WHERE id = ?`).run(isActive, id)
    } else {
      db.prepare(`UPDATE kpi_dictionary SET pending_action = NULL, updated_at = datetime('now') WHERE id = ?`).run(id)
    }
    logAudit.run('dictionary', String(id), `${action}_${kpiRow.pending_action}`, req.user.id, JSON.stringify({ name: kpiRow.name }))
    res.json({ ok: true })
  }
}
router.post('/dictionary/:id/approve-change', requireKpiRole('approver', 'finance_admin'), decideDictionaryChange('approve'))
router.post('/dictionary/:id/reject-change', requireKpiRole('approver', 'finance_admin'), decideDictionaryChange('reject'))

// GET /api/kpi/submissions?department=kpi-hr&period=2026-08 — pre-filled current rows
router.get('/submissions', (req, res) => {
  const { department, period } = req.query
  if (!department || !period) return res.status(400).json({ error: 'department and period are required.' })
  const kpis = db.prepare("SELECT * FROM kpi_dictionary WHERE department_id = ? AND (is_active = 1 OR pending_action = 'add') ORDER BY sort_order").all(department)
  const subs = new Map(
    db.prepare('SELECT * FROM kpi_submissions WHERE department_id = ? AND period = ?').all(department, period)
      .map(s => [s.kpi_id, s])
  )
  res.json(kpis.map(k => ({
    kpi: k,
    phasedTarget: phasedTarget(k, period),
    deadline: nextDeadlineForFrequency(k.frequency, period),
    submission: subs.get(k.id) || null,
  })))
})

// PUT /api/kpi/submissions — batch upsert draft values, dept-head-of-that-department only
// body: { departmentId, period, values: [{ kpiId, actualValue, reasonNote, actionNote }] }
router.put('/submissions', requireKpiRole('dept_head', 'approver', 'finance_admin'), requireOwnDepartment, (req, res) => {
  const { departmentId, period, values } = req.body || {}
  if (!departmentId || !period || !Array.isArray(values)) {
    return res.status(400).json({ error: 'departmentId, period, and values[] are required.' })
  }
  const kpiById = new Map(
    db.prepare('SELECT * FROM kpi_dictionary WHERE department_id = ?').all(departmentId).map(k => [k.id, k])
  )
  const upsert = db.prepare(`
    INSERT INTO kpi_submissions (kpi_id, period, department_id, actual_value, status, reason_note, action_note, rag_status, updated_at)
    VALUES (@kpiId, @period, @departmentId, @actualValue, 'draft', @reasonNote, @actionNote, @ragStatus, datetime('now'))
    ON CONFLICT(kpi_id, period) DO UPDATE SET
      actual_value = excluded.actual_value,
      reason_note  = excluded.reason_note,
      action_note  = excluded.action_note,
      rag_status   = excluded.rag_status,
      updated_at   = datetime('now')
    WHERE status = 'draft'
  `)
  const tx = db.transaction((rows) => {
    rows.forEach(v => {
      const kpi = kpiById.get(v.kpiId)
      if (!kpi) return
      const rag = evaluateRag(kpi, v.actualValue, phasedTarget(kpi, period))
      upsert.run({
        kpiId: v.kpiId, period, departmentId,
        actualValue: v.actualValue ?? null,
        reasonNote: v.reasonNote ?? null,
        actionNote: v.actionNote ?? null,
        ragStatus: rag,
      })
    })
  })
  tx(values)
  logAudit.run('submission', `${departmentId}:${period}`, 'save_draft', req.user.id, JSON.stringify({ count: values.length }))
  res.json({ ok: true })
})

// POST /api/kpi/submissions/submit — locks a department+period for approval
router.post('/submissions/submit', requireKpiRole('dept_head', 'approver', 'finance_admin'), requireOwnDepartment, (req, res) => {
  const { departmentId, period } = req.body || {}
  if (!departmentId || !period) return res.status(400).json({ error: 'departmentId and period are required.' })

  // Amber/Red requires a reason (PRD §4.5) before submission can complete.
  const rows = db.prepare('SELECT * FROM kpi_submissions WHERE department_id = ? AND period = ?').all(departmentId, period)
  const missingReason = rows.find(r => (r.rag_status === 'amber' || r.rag_status === 'red') && !r.reason_note)
  if (missingReason) {
    return res.status(400).json({ error: 'Every Amber or Red KPI needs a reason and action note before submitting.', kpiId: missingReason.kpi_id })
  }

  db.prepare(`
    UPDATE kpi_submissions SET status = 'submitted', submitted_by = ?, submitted_at = datetime('now')
    WHERE department_id = ? AND period = ? AND status = 'draft'
  `).run(req.user.id, departmentId, period)
  logAudit.run('submission', `${departmentId}:${period}`, 'submit', req.user.id, null)
  res.json({ ok: true })
})

// POST /api/kpi/submissions/:id/approve | /reject — approver/finance_admin only
function decide(action, dbStatus) {
  return (req, res) => {
    const id = Number(req.params.id)
    const sub = db.prepare('SELECT * FROM kpi_submissions WHERE id = ?').get(id)
    if (!sub) return res.status(404).json({ error: 'Submission not found.' })
    db.prepare(`
      UPDATE kpi_submissions SET status = ?, approved_by = ?, approved_at = datetime('now') WHERE id = ?
    `).run(dbStatus, req.user.id, id)
    logAudit.run('submission', String(id), action, req.user.id, null)
    res.json({ ok: true })
  }
}
router.post('/submissions/:id/approve', requireKpiRole('approver', 'finance_admin'), decide('approve', 'approved'))
// Rejecting reopens the row for editing — sets status back to 'draft' (rather than a
// terminal 'rejected') so the department head can revise and resubmit; the audit log still
// records the rejection event itself with a full timestamp.
router.post('/submissions/:id/reject', requireKpiRole('approver', 'finance_admin'), decide('reject', 'draft'))

// POST /api/kpi/submissions/:id/reopen — un-approve an already-approved figure so the
// department head can revise it. Distinct from reject (which implies "this was wrong"):
// reopen just means "let's take another look", and — unlike decide()/reject — leaves
// approved_by/approved_at untouched so the record of who last approved it isn't lost.
router.post('/submissions/:id/reopen', requireKpiRole('approver', 'finance_admin'), (req, res) => {
  const id = Number(req.params.id)
  const sub = db.prepare('SELECT * FROM kpi_submissions WHERE id = ?').get(id)
  if (!sub) return res.status(404).json({ error: 'Submission not found.' })
  db.prepare(`UPDATE kpi_submissions SET status = 'draft', updated_at = datetime('now') WHERE id = ?`).run(id)
  logAudit.run('submission', String(id), 'reopen', req.user.id, null)
  res.json({ ok: true })
})

// GET /api/kpi/overview?period=2026-08 — computed group RAG grid
router.get('/overview', (req, res) => {
  const period = req.query.period || new Date().toISOString().slice(0, 7)
  res.json(rollupGroup(period))
})

// GET /api/kpi/department/:id?period= — one department's roll-up + rows
router.get('/department/:id', (req, res) => {
  const period = req.query.period || new Date().toISOString().slice(0, 7)
  res.json(rollupDepartment(req.params.id, period))
})

// GET /api/kpi/reminders?period=
router.get('/reminders', (req, res) => {
  const period = req.query.period || new Date().toISOString().slice(0, 7)
  res.json(reminderState(period))
})

// GET /api/kpi/audit?entity=&id= — finance_admin/auditor only
router.get('/audit', requireKpiRole('finance_admin', 'auditor', 'approver'), (req, res) => {
  const { entity, id } = req.query
  let rows
  if (entity && id) {
    rows = db.prepare('SELECT * FROM kpi_audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC').all(entity, id)
  } else {
    rows = db.prepare('SELECT * FROM kpi_audit_log ORDER BY created_at DESC LIMIT 200').all()
  }
  res.json(rows)
})

module.exports = router
