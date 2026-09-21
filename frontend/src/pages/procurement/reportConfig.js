// Registry for every Procurement report — one entry per sub-tab under the Procurement
// page. `endpoint` is the key into snapshot.procurement.endpoints (see
// backend/services/procurement-builder.js) for reports backed by a Business Central OData
// feed; null means no feed exists yet, so that sub-tab is still a placeholder. `derived`
// marks a report computed from other feeds rather than reading one of its own.
// This one list drives the sidebar (via lib/pages.js), the landing-page status table, and
// which component renders each page (procurement/index.jsx).
export const PROCUREMENT_REPORTS = [
  { id: 'procurement-kpis',                       category: 'Procurement KPIs',   title: 'Procurement KPI Summary',            metric: 'PO cycle time, PR-to-PO conversion',   chartType: 'KPI cards, trend line',   audience: 'Procurement Manager / CFO / CEO', source: 'Derived from the PO, spend, budget and DOA feeds', derived: true },
  { id: 'procurement-spend-total',                category: 'Spend Analysis',     title: 'Total Procurement Spend',            metric: 'Spend by BU, vendor, category',        chartType: 'Treemap / pie',            audience: 'Procurement Manager / CFO / CEO', source: 'KFT_Procrument_Spend',       endpoint: 'spend' },
  { id: 'procurement-spend-forecast',             category: 'Spend Analysis',     title: 'Procurement Spend Forecast',         metric: 'Forecasted monthly spend',             chartType: 'Line chart',                audience: 'Procurement Manager / CFO / CEO', source: 'PurchForecast',              endpoint: null },
  { id: 'procurement-pr-summary',                 category: 'PR Tracking',        title: 'Purchase Requisition Summary',       metric: 'PR by status, requester, project',     chartType: 'Matrix table',              audience: 'Procurement Manager / CFO / CEO', source: 'KFT_Purchase_Requisitions',  endpoint: 'requisitions' },
  { id: 'procurement-pr-pending',                 category: 'PR Tracking',        title: 'Pending PR Approvals',               metric: 'PR approval pending count',            chartType: 'Bar chart',                 audience: 'Procurement Manager / CFO / CEO', source: 'KFT_Pending_PR_Approvals',   endpoint: 'pendingPr' },
  { id: 'procurement-po-summary',                 category: 'PO Tracking',        title: 'Purchase Order Summary',             metric: 'POs by vendor, project, status',       chartType: 'Column chart',              audience: 'Procurement Manager / CFO / CEO', source: 'KFT_PO_Summary',             endpoint: 'poSummary' },
  { id: 'procurement-po-aging',                   category: 'PO Tracking',        title: 'PO Aging Report',                    metric: 'Open POs by aging',                    chartType: 'Stacked bar',               audience: 'Procurement Manager / CFO / CEO', source: 'KFT_PO_Aging',               endpoint: 'poAging' },
  { id: 'procurement-po-variance',                category: 'PO Tracking',        title: 'PO Variance Analysis',               metric: 'PO vs Invoice vs Receipt variances',   chartType: 'Waterfall',                 audience: 'Procurement Manager / CFO / CEO', source: 'KFT_PO_Variance',            endpoint: 'poVariance' },
  { id: 'procurement-vendor-performance',         category: 'Vendor Performance', title: 'Vendor Performance Dashboard',       metric: 'On-time delivery, quality, spend',     chartType: 'Radar chart',               audience: 'Procurement Manager / CFO / CEO', source: 'KFT_Vendor_Delivery_Performance', endpoint: 'vendorDelivery' },
  { id: 'procurement-budget',                     category: 'Budget',             title: 'Budget vs Actual Procurement Spend', metric: 'Budget utilization',                   chartType: 'Bar chart variance',        audience: 'Procurement Manager / CFO / CEO', source: 'KFT_Procrument_Budget',      endpoint: 'budget' },
  { id: 'procurement-commitments',                category: 'Commitments',        title: 'PO Commitments not Invoiced',        metric: 'Committed vs realized',                chartType: 'Column chart',              audience: 'Procurement Manager / CFO / CEO', source: 'KFT_PO_Commitments',         endpoint: 'commitments' },
  { id: 'procurement-compliance-outside-contract',category: 'Compliance',         title: 'Purchases Outside Contract',         metric: '% of off-contract spend',              chartType: 'Pie chart',                 audience: 'CFO / CEO',                       source: 'KFT_Off_Contact_Purchases',  endpoint: 'offContract' },
  { id: 'procurement-compliance-doa',             category: 'Compliance',         title: 'Procurement DOA Breach Report',      metric: 'POs exceeding limits',                 chartType: 'Table',                     audience: 'CFO / CEO',                       source: 'KFT_Procrument_DOA_Breach',  endpoint: 'doa' },
  { id: 'procurement-audit-trail',                category: 'Audit',              title: 'Procurement Audit Trail',            metric: 'User, date, transaction log',          chartType: 'Table',                     audience: 'CFO / CEO',                       source: 'KFT_Procrument_Audit_Trail', endpoint: 'auditTrail' },
  { id: 'procurement-cycle-time',                 category: 'Efficiency',         title: 'Procurement Cycle Time',             metric: 'Avg time PR→PO→Receipt',    chartType: 'Line chart',                audience: 'Procurement Manager / CFO / CEO', source: 'KFT_Procurement_Cycle_Time', endpoint: 'cycleTime' },
]

// Live status of one report, for the landing-page table and the KPI summary. `tone` maps to a
// colour in the UI: green = live data, amber = connected but empty, red = endpoint failing,
// orange = no endpoint exists yet, muted = can't tell (snapshot has no procurement block).
export function getReportStatus(report, proc) {
  if (!proc) return { label: 'Latest snapshot only', tone: 'muted' }
  if (report.derived) {
    return proc.endpoints?.poSummary?.ok
      ? { label: 'Live (derived)', tone: 'green' }
      : { label: 'Waiting on PO feed', tone: 'orange' }
  }
  if (!report.endpoint) return { label: 'No endpoint yet', tone: 'orange' }
  const ep = proc.endpoints?.[report.endpoint]
  if (!ep) return { label: 'Not in snapshot', tone: 'muted' }
  if (!ep.ok) return { label: /404/.test(ep.error || '') ? 'Endpoint not published (404)' : 'Endpoint error', tone: 'red' }
  if (ep.rows === 0) return { label: 'Connected — 0 rows', tone: 'amber' }
  return { label: `Live · ${ep.rows.toLocaleString()} rows`, tone: 'green' }
}

export const STATUS_TONE_COLORS = {
  green:  { bg: 'rgba(46,189,133,.2)',  fg: '#2EBD85' },
  amber:  { bg: 'rgba(235,125,35,.2)',  fg: '#EB7D23' },
  orange: { bg: 'rgba(235,125,35,.2)',  fg: '#EB7D23' },
  red:    { bg: 'rgba(229,84,75,.2)',   fg: '#E5544B' },
  muted:  { bg: 'rgba(255,255,255,.1)', fg: '#9FB4BD' },
}
