const db = require('../db')

// Mirrors requireAdmin.js: re-reads the role fresh from the DB on every request rather than
// trusting the JWT claim, so a revoked/changed role takes effect on the very next request
// instead of waiting out the 8-hour token expiry. Also stashes the fresh row on req.kpiUser
// so downstream handlers/requireOwnDepartment don't need a second query.
function requireKpiRole(...allowedRoles) {
  return function (req, res, next) {
    const row = db.prepare('SELECT kpi_role, kpi_department_id FROM users WHERE id = ?').get(req.user?.id)
    if (!row?.kpi_role || !allowedRoles.includes(row.kpi_role)) {
      return res.status(403).json({ error: 'You do not have access to this KPI action.' })
    }
    req.kpiUser = row
    next()
  }
}

// For write routes scoped to one department (e.g. entering a submission): a dept_head may
// only act on their own department; approver/finance_admin may act on any department.
// Must run after requireKpiRole (needs req.kpiUser). Reads the target department id from
// req.body.departmentId or req.query.department, whichever the route uses.
function requireOwnDepartment(req, res, next) {
  const targetDept = req.body?.departmentId || req.query?.department
  const { kpi_role, kpi_department_id } = req.kpiUser || {}
  if (kpi_role === 'approver' || kpi_role === 'finance_admin') return next()
  if (kpi_role === 'dept_head' && targetDept && targetDept === kpi_department_id) return next()
  return res.status(403).json({ error: 'You can only act on your own department.' })
}

module.exports = { requireKpiRole, requireOwnDepartment }
