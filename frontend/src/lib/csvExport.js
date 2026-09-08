// Generic browser-side CSV download — no library needed for something this small.
function escapeCSV(value) {
  const s = value == null ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// meta (optional): [{ label, value }] — the filters this export was taken under (Month,
// Year, Business Unit, etc.). Written as its own block above the real header/rows rather
// than repeated on every row, since a single export is always for one fixed set of
// filters — the value is constant for every row either way.
export function downloadCSV(filename, rows, columns, meta = []) {
  const metaLines = meta.map(m => [escapeCSV(m.label), escapeCSV(m.value)].join(','))
  const header = columns.map(c => escapeCSV(c.label)).join(',')
  const lines  = rows.map(row => columns.map(c => escapeCSV(row[c.key])).join(','))
  const csv    = [...metaLines, ...(metaLines.length ? [''] : []), header, ...lines].join('\r\n')

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
  { key: 'department',     label: 'Department' },
  { key: 'virtualCompany', label: 'Virtual Company' },
  { key: 'employmentType', label: 'Employment Type' },
  { key: 'budgetSource',   label: 'Budget Source' },
  { key: 'monthlyCost',    label: 'Monthly Cost' }
]

// One row per employee (per payroll source, if paid from more than one — e.g. a
// Permanent staffer who is also an Individual Consultant genuinely needs two rows,
// since Budget Source is a single value per row) for whichever month is currently
// effective on the page — current-state snapshot, not full history. Monthly Cost is
// gross earning + pension for that month, the same "CTC"/"Cost" definition used
// everywhere else on these pages (e.g. the CTC KPI, Monthly Cost to Company). Department
// is the section/sub-department (e.g. "Digitization"), one level below Business Unit.
//
// activeRoster (optional) backstops active employees with no payroll record at all for
// this month (new hires, payroll not run yet, etc.) — shown at 0 rather than silently
// omitted, matching each page's own "active roster" fallback for its drill-down table.
// Field names vary by caller (buName vs buCode+deptDisplayNames, virtualCompany vs vc,
// employeeType vs type) since PeopleHRSummary and HRPageReview build their roster arrays
// slightly differently — read whichever is present.
export function buildEmployeeExportRows(payrollRows, effectiveMonth, activeRoster = [], deptDisplayNames = {}) {
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
        department:     r.sectionName || r.sectionCode || 'Unknown',
        virtualCompany: r.virtualCompany || 'Unknown',
        employmentType: EMPLOYMENT_TYPE_LABELS[r.employeeType] || r.employeeType || 'Unknown',
        budgetSource:   BUDGET_SOURCE_LABELS[r.payrollSource]  || r.payrollSource || 'Unknown',
        monthlyCost:    Math.round(cost)
      }
    })

  const unpaidRows = (activeRoster || [])
    .filter(r => r.employeeNo && !paidEmpNos.has(r.employeeNo))
    .map(r => ({
      employeeId:     r.employeeNo,
      employeeName:   r.name,
      jobTitle:       r.jobTitle || 'Unknown',
      businessUnit:   r.buName || deptDisplayNames[r.buCode] || r.buCode || 'Unknown',
      department:     r.sectionName || r.sectionCode || 'Unknown',
      virtualCompany: r.virtualCompany || r.vc || 'Unknown',
      employmentType: EMPLOYMENT_TYPE_LABELS[r.employeeType || r.type] || r.employeeType || r.type || 'Unknown',
      budgetSource:   'Not yet paid',
      monthlyCost:    0
    }))

  return [...paidRows, ...unpaidRows].sort((a, b) => a.employeeName.localeCompare(b.employeeName))
}

// The filter/period context an export was taken under — written as a header block above
// the column headers (see downloadCSV) since every value here is constant across the
// whole export, not something that needs repeating on every row.
export function buildExportMeta({ filterBU, filterType, filterVC, filterSource, effectiveMonth, deptDisplayNames = {} }) {
  const [month, year] = (effectiveMonth || '').split(' ')
  return [
    { label: 'Business Unit',   value: filterBU     === 'All' ? 'All' : (deptDisplayNames[filterBU] || filterBU) },
    { label: 'Employment Type', value: filterType   === 'All' ? 'All' : filterType },
    { label: 'Virtual Company', value: filterVC     === 'All' ? 'All' : filterVC },
    { label: 'Budget Source',   value: filterSource === 'All' ? 'All' : (BUDGET_SOURCE_LABELS[filterSource] || filterSource) },
    { label: 'Month', value: month || 'All' },
    { label: 'Year',  value: year  || 'All' }
  ]
}
