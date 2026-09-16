// Registry for every planned Procurement report — one entry per sub-tab under the
// Procurement page. None of these are wired to live data yet: the underlying BC
// tables (PurchTable, ReqTable, VendPerformance, etc.) aren't confirmed as exposed
// via OData the way KFT_AR_Aging/KFT_AP_Aging were before the Aging page was built.
// Each entry here drives both the sidebar label (via pages.js) and the placeholder
// page's content (via ReportPlaceholder.jsx), so wiring up real data later is just
// swapping ReportPlaceholder for a real chart in the matching page component —
// nothing about the registry, routing, or per-user access grants needs to change.
export const PROCUREMENT_REPORTS = [
  { id: 'procurement-kpis',                      category: 'Procurement KPIs',   title: 'Procurement KPI Summary',            metric: 'PO cycle time, PR-to-PO conversion',   chartType: 'KPI cards, trend line',   audience: 'Procurement Manager / CFO / CEO', source: 'PurchTable, ReqTable' },
  { id: 'procurement-spend-total',               category: 'Spend Analysis',     title: 'Total Procurement Spend',            metric: 'Spend by BU, vendor, category',        chartType: 'Treemap / pie',            audience: 'Procurement Manager / CFO / CEO', source: 'VendTable' },
  { id: 'procurement-spend-forecast',            category: 'Spend Analysis',     title: 'Procurement Spend Forecast',         metric: 'Forecasted monthly spend',             chartType: 'Line chart',                audience: 'Procurement Manager / CFO / CEO', source: 'PurchForecast' },
  { id: 'procurement-pr-summary',                category: 'PR Tracking',        title: 'Purchase Requisition Summary',       metric: 'PR by status, requester, project',     chartType: 'Matrix table',              audience: 'Procurement Manager / CFO / CEO', source: 'ReqTable' },
  { id: 'procurement-pr-pending',                category: 'PR Tracking',        title: 'Pending PR Approvals',               metric: 'PR approval pending count',            chartType: 'Bar chart',                 audience: 'Procurement Manager / CFO / CEO', source: 'ReqTable' },
  { id: 'procurement-po-summary',                category: 'PO Tracking',        title: 'Purchase Order Summary',             metric: 'POs by vendor, project, status',       chartType: 'Column chart',              audience: 'Procurement Manager / CFO / CEO', source: 'PurchTable' },
  { id: 'procurement-po-aging',                  category: 'PO Tracking',        title: 'PO Aging Report',                    metric: 'Open POs by aging',                    chartType: 'Stacked bar',               audience: 'Procurement Manager / CFO / CEO', source: 'PurchTable' },
  { id: 'procurement-po-variance',               category: 'PO Tracking',        title: 'PO Variance Analysis',               metric: 'PO vs Invoice vs Receipt variances',   chartType: 'Waterfall',                 audience: 'Procurement Manager / CFO / CEO', source: 'PurchLine' },
  { id: 'procurement-vendor-performance',        category: 'Vendor Performance', title: 'Vendor Performance Dashboard',       metric: 'On-time delivery, quality, spend',     chartType: 'Radar chart',               audience: 'Procurement Manager / CFO / CEO', source: 'VendPerformance' },
  { id: 'procurement-budget',                    category: 'Budget',             title: 'Budget vs Actual Procurement Spend', metric: 'Budget utilization',                   chartType: 'Bar chart variance',        audience: 'Procurement Manager / CFO / CEO', source: 'ProcBudget' },
  { id: 'procurement-commitments',               category: 'Commitments',        title: 'PO Commitments not Invoiced',        metric: 'Committed vs realized',                chartType: 'Column chart',              audience: 'Procurement Manager / CFO / CEO', source: 'PurchTable' },
  { id: 'procurement-compliance-outside-contract',category: 'Compliance',        title: 'Purchases Outside Contract',         metric: '% of off-contract spend',              chartType: 'Pie chart',                 audience: 'CFO / CEO',                       source: 'PurchCompliance' },
  { id: 'procurement-compliance-doa',            category: 'Compliance',         title: 'Procurement DOA Breach Report',      metric: 'POs exceeding limits',                 chartType: 'Table',                     audience: 'CFO / CEO',                       source: 'PurchApproval' },
  { id: 'procurement-audit-trail',               category: 'Audit',              title: 'Procurement Audit Trail',            metric: 'User, date, transaction log',          chartType: 'Table',                     audience: 'CFO / CEO',                       source: 'AuditTrail' },
  { id: 'procurement-cycle-time',                category: 'Efficiency',         title: 'Procurement Cycle Time',             metric: 'Avg time PR→PO→Receipt',    chartType: 'Line chart',                audience: 'Procurement Manager / CFO / CEO', source: 'ProcurementCycle' },
]
