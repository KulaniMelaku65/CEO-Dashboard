const router = require('express').Router()
const db = require('../db')
const requireAuth = require('../middleware/auth')
const { requireKpiRole, requireOwnDepartment } = require('../middleware/requireKpiRole')
const { evaluateRag, baseType } = require('../services/kpi-rag-engine')
const { rollupDepartment, rollupGroup } = require('../services/kpi-rollup-engine')
const { reminderState } = require('../services/kpi-reminder')

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

// GET /api/kpi/dictionary?department=kpi-hr
router.get('/dictionary', (req, res) => {
  const { department } = req.query
  const rows = department
    ? db.prepare('SELECT * FROM kpi_dictionary WHERE department_id = ? AND is_active = 1 ORDER BY sort_order').all(department)
    : db.prepare('SELECT * FROM kpi_dictionary WHERE is_active = 1 ORDER BY department_id, sort_order').all()
  res.json(rows)
})

// PUT /api/kpi/dictionary/:id — CFO/CoS/finance_admin only
router.put('/dictionary/:id', requireKpiRole('approver', 'finance_admin'), (req, res) => {
  const id = Number(req.params.id)
  const kpi = db.prepare('SELECT * FROM kpi_dictionary WHERE id = ?').get(id)
  if (!kpi) return res.status(404).json({ error: 'KPI not found.' })
  const { targetValue, targetNote, ragRuleJson, weight, isActive } = req.body || {}
  db.prepare(`
    UPDATE kpi_dictionary SET
      target_value = ?, target_note = ?, rag_rule_json = ?, weight = ?, is_active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    targetValue != null ? targetValue : kpi.target_value,
    targetNote != null ? targetNote : kpi.target_note,
    ragRuleJson !== undefined ? ragRuleJson : kpi.rag_rule_json,
    weight != null ? weight : kpi.weight,
    isActive != null ? (isActive ? 1 : 0) : kpi.is_active,
    id
  )
  logAudit.run('dictionary', String(id), 'update', req.user.id, JSON.stringify(req.body))
  res.json(db.prepare('SELECT * FROM kpi_dictionary WHERE id = ?').get(id))
})

// GET /api/kpi/submissions?department=kpi-hr&period=2026-08 — pre-filled current rows
router.get('/submissions', (req, res) => {
  const { department, period } = req.query
  if (!department || !period) return res.status(400).json({ error: 'department and period are required.' })
  const kpis = db.prepare('SELECT * FROM kpi_dictionary WHERE department_id = ? AND is_active = 1 ORDER BY sort_order').all(department)
  const subs = new Map(
    db.prepare('SELECT * FROM kpi_submissions WHERE department_id = ? AND period = ?').all(department, period)
      .map(s => [s.kpi_id, s])
  )
  res.json(kpis.map(k => ({
    kpi: k,
    phasedTarget: phasedTarget(k, period),
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
