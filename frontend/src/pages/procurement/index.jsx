import ReportPlaceholder from './ReportPlaceholder.jsx'
import EndpointStatus from './EndpointStatus.jsx'
import KpiSummary from './KpiSummary.jsx'
import SpendTotal from './SpendTotal.jsx'
import PoSummary from './PoSummary.jsx'
import PoAging from './PoAging.jsx'
import PoVariance from './PoVariance.jsx'
import ProcBudget from './ProcBudget.jsx'
import Commitments from './Commitments.jsx'
import DoaBreach from './DoaBreach.jsx'
import PrSummary from './PrSummary.jsx'
import PrPending from './PrPending.jsx'
import OffContract from './OffContract.jsx'
import VendorPerformance from './VendorPerformance.jsx'
import { PROCUREMENT_REPORTS } from './reportConfig.js'

// Report id → its real page. Reports with a live feed get their own component; the
// cycle-time feed (connected, 0 rows) and the audit trail (endpoint not published) get
// the status page; anything with no feed at all is still a placeholder.
const REAL_PAGES = {
  'procurement-kpis':           KpiSummary,
  'procurement-spend-total':    SpendTotal,
  'procurement-po-summary':     PoSummary,
  'procurement-po-aging':       PoAging,
  'procurement-po-variance':    PoVariance,
  'procurement-budget':         ProcBudget,
  'procurement-commitments':    Commitments,
  'procurement-compliance-doa': DoaBreach,
  'procurement-pr-summary':     PrSummary,
  'procurement-pr-pending':     PrPending,
  'procurement-vendor-performance': VendorPerformance,
  'procurement-compliance-outside-contract': OffContract,
}
const STATUS_PAGES = new Set(['procurement-audit-trail', 'procurement-cycle-time'])

// One page component per report id — spread into App.jsx's PAGE_COMPONENTS map instead of
// 15 individual imports there.
export const PROCUREMENT_PAGE_COMPONENTS = Object.fromEntries(
  PROCUREMENT_REPORTS.map(report => [
    report.id,
    REAL_PAGES[report.id]
      ?? (STATUS_PAGES.has(report.id)
        ? (props) => <EndpointStatus {...props} report={report} />
        : () => <ReportPlaceholder report={report} />),
  ])
)
