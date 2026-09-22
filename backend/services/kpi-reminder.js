const db = require('../db')

// Working-day-5 deadline, Mon–Fri only. This is a plain-calendar approximation, NOT the full
// Ethiopian public-holiday calendar the PRD specifies (§5) — no holiday-calendar data source
// exists anywhere in this codebase to build the real one against. Flagged here rather than
// silently guessing at holiday dates.
function addWorkingDays(date, n) {
  const d = new Date(date)
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return d
}

function workingDay5(period) { // period = 'YYYY-MM' — WD5 of the FOLLOWING month (reporting month's close)
  const [y, m] = period.split('-').map(Number)
  const firstOfNextMonth = new Date(Date.UTC(y, m, 1)) // JS months are 0-indexed; m is next month here
  return addWorkingDays(new Date(firstOfNextMonth.getTime() - 86400000), 5) // start counting from last day of reporting month
}

function departmentsMissingSubmission(period) {
  const departments = db.prepare('SELECT id, name FROM kpi_departments ORDER BY sort_order').all()
  const submitted = new Set(
    db.prepare(
      `SELECT DISTINCT department_id FROM kpi_submissions
       WHERE period = ? AND status IN ('submitted','approved')`
    ).all(period).map(r => r.department_id)
  )
  return departments.filter(d => !submitted.has(d.id))
}

// End of the current reporting cycle (PRD: "H2 2026 (Jul-Dec), extensible to future
// periods") — configurable the same way other cycle-boundary env vars in this codebase
// are (e.g. BC_FY_START), rather than hardcoding a date with no way to roll it forward.
const CYCLE_END = process.env.KPI_CYCLE_END || '2026-12-31'

// Due date for one KPI's current period, based on its reporting frequency. Monthly KPIs
// are due the same WD5 as the whole department's submission; Quarterly ones are due at
// the WD5 following the quarter that contains `period`; H1/H2 ones are due at the WD5
// following the calendar half (Jan-Jun / Jul-Dec) that contains `period`; Yearly ones are
// due at the end of the reporting cycle regardless of which month is currently selected.
function nextDeadlineForFrequency(frequency, period) {
  if (frequency === 'Yearly') return CYCLE_END
  if (frequency === 'Quarterly') {
    const [y, m] = period.split('-').map(Number) // m is 1-indexed
    const quarterEndMonth = Math.ceil(m / 3) * 3 // 3, 6, 9, or 12
    const quarterEndPeriod = `${y}-${String(quarterEndMonth).padStart(2, '0')}`
    return workingDay5(quarterEndPeriod).toISOString().slice(0, 10)
  }
  if (frequency === 'H1/H2') {
    const [y, m] = period.split('-').map(Number) // m is 1-indexed
    const halfEndMonth = m <= 6 ? 6 : 12
    const halfEndPeriod = `${y}-${String(halfEndMonth).padStart(2, '0')}`
    return workingDay5(halfEndPeriod).toISOString().slice(0, 10)
  }
  return workingDay5(period).toISOString().slice(0, 10) // Monthly (default)
}

function reminderState(period) {
  const deadline = workingDay5(period)
  const now = new Date()
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000)
  return {
    period,
    deadline: deadline.toISOString().slice(0, 10),
    daysLeft,
    overdue: daysLeft < 0,
    departmentsMissing: departmentsMissingSubmission(period).map(d => ({ id: d.id, name: d.name })),
  }
}

module.exports = { reminderState, departmentsMissingSubmission, workingDay5, nextDeadlineForFrequency }
