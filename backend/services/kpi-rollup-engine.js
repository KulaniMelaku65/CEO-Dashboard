const db = require('../db')
const { worstRag } = require('./kpi-rag-engine')

// PRD §4.6, all three explicitly "Decided":
//  - count-based by default (configurable red/amber trigger counts)
//  - CFO-switchable per-KPI / per-department weights
//  - no double-counting: a shared_key'd KPI counts once in the group total, not once per
//    department that references it
const DEFAULT_SETTINGS = {
  mode: 'count', // 'count' | 'weighted'
  department: { redIfRedCount: 1, amberIfAmberCount: 1 }, // 1 Red KPI -> dept is Red, etc.
  group: { redIfRedCount: 1, amberIfAmberCount: 1 },
}

function getSettings() {
  const row = db.prepare('SELECT value_json FROM kpi_settings WHERE key = ?').get('rollup')
  if (!row) return DEFAULT_SETTINGS
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value_json) } } catch { return DEFAULT_SETTINGS }
}

function countBasedStatus(statuses, thresholds) {
  const reds = statuses.filter(s => s === 'red').length
  const ambers = statuses.filter(s => s === 'amber').length
  if (reds >= thresholds.redIfRedCount) return 'red'
  if (ambers >= thresholds.amberIfAmberCount) return 'amber'
  if (statuses.some(s => s == null)) return null // not fully reported yet
  return 'green'
}

function weightedStatus(items) { // items: [{ status, weight }]
  const reported = items.filter(i => i.status != null)
  if (reported.length === 0) return null
  const totalWeight = reported.reduce((s, i) => s + i.weight, 0) || 1
  const score = reported.reduce((s, i) => {
    const v = i.status === 'green' ? 1 : i.status === 'amber' ? 0.5 : 0
    return s + v * i.weight
  }, 0) / totalWeight
  if (score >= 0.9) return 'green'
  if (score >= 0.6) return 'amber'
  return 'red'
}

/** RAG status + per-KPI rows for one department in one period. */
function rollupDepartment(departmentId, period) {
  const kpis = db.prepare(
    'SELECT * FROM kpi_dictionary WHERE department_id = ? AND is_active = 1 ORDER BY sort_order'
  ).all(departmentId)
  const subsByKpi = new Map(
    db.prepare('SELECT * FROM kpi_submissions WHERE department_id = ? AND period = ?')
      .all(departmentId, period)
      .map(s => [s.kpi_id, s])
  )
  const rows = kpis.map(k => ({ kpi: k, submission: subsByKpi.get(k.id) || null }))
  const settings = getSettings()
  const statuses = rows.map(r => r.submission?.rag_status ?? null)
  const status = settings.mode === 'weighted'
    ? weightedStatus(rows.map(r => ({ status: r.submission?.rag_status ?? null, weight: r.kpi.weight })))
    : countBasedStatus(statuses, settings.department)
  return { departmentId, period, status, rows }
}

/** RAG status across all departments, de-duplicating shared_key'd KPIs (PRD §8). */
function rollupGroup(period) {
  const departments = db.prepare('SELECT * FROM kpi_departments ORDER BY sort_order').all()
  const byDept = departments.map(d => ({ department: d, ...rollupDepartment(d.id, period) }))

  // De-dupe: a shared_key'd KPI's worst status across all departments counts once.
  const sharedWorst = new Map()
  byDept.forEach(d => d.rows.forEach(r => {
    if (!r.kpi.shared_key) return
    const cur = sharedWorst.get(r.kpi.shared_key)
    sharedWorst.set(r.kpi.shared_key, worstRag(cur, r.submission?.rag_status ?? null))
  }))

  const seenShared = new Set()
  const dedupedStatuses = []
  byDept.forEach(d => d.rows.forEach(r => {
    if (r.kpi.shared_key) {
      if (seenShared.has(r.kpi.shared_key)) return
      seenShared.add(r.kpi.shared_key)
      dedupedStatuses.push(sharedWorst.get(r.kpi.shared_key))
    } else {
      dedupedStatuses.push(r.submission?.rag_status ?? null)
    }
  }))

  const settings = getSettings()
  const status = countBasedStatus(dedupedStatuses, settings.group)
  return { period, status, departments: byDept }
}

module.exports = { rollupDepartment, rollupGroup, getSettings }
