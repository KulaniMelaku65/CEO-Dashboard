// Generic browser-side CSV download — no library needed for something this small.
function escapeCSV(value) {
  const s = value == null ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCSV(filename, rows, columns) {
  const header = columns.map(c => escapeCSV(c.label)).join(',')
  const lines  = rows.map(row => columns.map(c => escapeCSV(row[c.key])).join(','))
  const csv    = [header, ...lines].join('\r\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }) // BOM so Excel doesn't mangle non-ASCII names
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// "Individual Consultant" reads as "Consultant" elsewhere on these pages — matched here
// for consistency. Budget Source labels match the Corporate/Programme rename everywhere else.
const EMPLOYMENT_TYPE_LABELS = { 'Individual Consultant': 'Consultant' }
const BUDGET_SOURCE_LABELS   = { KIFIYA: 'Corporate', SAFEE: 'Programme' }

export const EMPLOYEE_EXPORT_COLUMNS = [
  { key: 'employeeId',     label: 'Employee ID' },
  { key: 'employeeName',   label: 'Employee Name' },
  { key: 'jobTitle',       label: 'Job Title' },
  { key: 'businessUnit',   label: 'Business Unit' },
  { key: 'virtualCompany', label: 'Virtual Company' },
  { key: 'employmentType', label: 'Employment Type' },
  { key: 'budgetSource',   label: 'Budget Source' },
  { key: 'monthlyCost',    label: 'Monthly Cost' },
  { key: 'month',          label: 'Month' },
  { key: 'year',           label: 'Year' }
]

// One row per employee (per payroll source, if paid from more than one — e.g. a
// Permanent staffer who is also an Individual Consultant genuinely needs two rows,
// since Budget Source is a single value per row) for whichever month is currently
// effective on the page — current-state snapshot, not full history. Monthly Cost is
// gross earning + pension for that month, the same "CTC"/"Cost" definition used
// everywhere else on these pages (e.g. the CTC KPI, Monthly Cost to Company).
//
// activeRoster (optional) backstops active employees with no payroll record at all for
// this month (new hires, payroll not run yet, etc.) — shown at 0 rather than silently
// omitted, matching each page's own "active roster" fallback for its drill-down table.
// Field names vary by caller (buName vs buCode+deptDisplayNames, virtualCompany vs vc,
// employeeType vs type) since PeopleHRSummary and HRPageReview build their roster arrays
// slightly differently — read whichever is present.
export function buildEmployeeExportRows(payrollRows, effectiveMonth, activeRoster = [], deptDisplayNames = {}) {
  const [month, year] = (effectiveMonth || '').split(' ')
  const paidEmpNos = new Set()

  const paidRows = (payrollRows || [])
    .map(r => ({
      r,
      cost: (r.monthTotals?.[effectiveMonth] || 0) + (r.pensionMonthTotals?.[effectiveMonth] || 0)
    }))
    .filter(({ cost }) => cost !== 0)
    .map(({ r, cost }) => {
      paidEmpNos.add(r.employeeNo)
      return {
        employeeId:     r.employeeNo,
        employeeName:   r.name,
        jobTitle:       r.jobTitle || 'Unknown',
        businessUnit:   r.buName || deptDisplayNames[r.buCode] || r.buCode || 'Unknown',
        virtualCompany: r.virtualCompany || 'Unknown',
        employmentType: EMPLOYMENT_TYPE_LABELS[r.employeeType] || r.employeeType || 'Unknown',
        budgetSource:   BUDGET_SOURCE_LABELS[r.payrollSource]  || r.payrollSource || 'Unknown',
        monthlyCost:    Math.round(cost),
        month:          month || '',
        year:           year  || ''
      }
    })

  const unpaidRows = (activeRoster || [])
    .filter(r => r.employeeNo && !paidEmpNos.has(r.employeeNo))
    .map(r => ({
      employeeId:     r.employeeNo,
      employeeName:   r.name,
      jobTitle:       r.jobTitle || 'Unknown',
      businessUnit:   r.buName || deptDisplayNames[r.buCode] || r.buCode || 'Unknown',
      virtualCompany: r.virtualCompany || r.vc || 'Unknown',
      employmentType: EMPLOYMENT_TYPE_LABELS[r.employeeType || r.type] || r.employeeType || r.type || 'Unknown',
      budgetSource:   'Not yet paid',
      monthlyCost:    0,
      month:          month || '',
      year:           year  || ''
    }))

  return [...paidRows, ...unpaidRows].sort((a, b) => a.employeeName.localeCompare(b.employeeName))
}
