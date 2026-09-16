import ReportPlaceholder from './ReportPlaceholder.jsx'
import { PROCUREMENT_REPORTS } from './reportConfig.js'

// One page component per report id, all backed by the same ReportPlaceholder shell —
// spread into App.jsx's PAGE_COMPONENTS map instead of 15 individual imports there.
export const PROCUREMENT_PAGE_COMPONENTS = Object.fromEntries(
  PROCUREMENT_REPORTS.map(report => [report.id, () => <ReportPlaceholder report={report} />])
)
