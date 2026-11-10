// Agentic AI — tool registry (docs/agentic-ai-roadmap.md, layers 1-4).
//
// Each tool is { name, description, parameters (JSON Schema), handler(args, user) }.
// `parameters`/`description` are sent to every provider in that provider's own
// tool-calling format (see routes/ai.js's buildProviderTools) — write them for the model
// to read, not just for humans.
//
// Handlers reuse the exact same functions/queries the REST routes already call, and
// enforce the exact same authorization those routes already enforce — a tool is never
// more permissive than hitting the equivalent REST endpoint directly would be. Most
// read routes in this app only require being logged in (no extra per-resource check);
// KPI department reads are the same. Nothing here is more restrictive than that by
// design — see the roadmap doc's "known gap" note on page-level access not being
// enforced server-side yet.
const db = require('../db');
const { rollupGroup, rollupDepartment } = require('./kpi-rollup-engine');

function getLatestSnapshot() {
  const row = db.prepare('SELECT data FROM snapshots ORDER BY snapshot_date DESC LIMIT 1').get();
  return row ? JSON.parse(row.data) : null;
}

const currentPeriod = () => new Date().toISOString().slice(0, 7); // 'YYYY-MM'

const KPI_DEPARTMENT_IDS = () => db.prepare('SELECT id, name FROM kpi_departments').all();

// rollupGroup()/rollupDepartment() return every individual KPI row with its FULL
// dictionary metadata (created_at, rag_rule_json, pending_action, ...) — the right shape
// for the Group KPI Dashboard page itself, but 15-40x more than a tool result needs
// (one department's full rollup alone is ~40KB of JSON). These re-shape the SAME
// already-computed status/rag_status fields (never recomputing RAG logic — see this
// file's own top comment) into a compact summary: counts by status, plus each KPI's own
// name/status so "which ones are red" is still answerable without the full dictionary
// row. A null rag_status is reported as "not_reported", never silently dropped or
// treated as a red/poor result — distinguishing "no one has submitted this yet" from
// "submitted and failing" matters for an honest answer (and is a named requirement in
// docs/Kifiya_Agentic_AI_Product_Concept.docx).
const summarizeDeptRollup = (dept) => ({
  departmentId: dept.departmentId,
  departmentName: dept.department?.name,
  period: dept.period,
  status: dept.status ?? 'not_reported',
  kpis: dept.rows.map(r => ({
    name: r.kpi.name,
    status: r.submission?.rag_status ?? 'not_reported',
    actual: r.submission?.actual_value ?? null,
    target: r.kpi.target_note || r.kpi.target_value,
  }))
});

// Company-wide overview needs even less than one department's own detail — just each
// department's rolled-up status and how many of its KPIs fall into each status, not
// every individual KPI's name/target/actual (that's what get_kpi_department is for).
const statusCounts = (rows) => rows.reduce((acc, r) => {
  const s = r.submission?.rag_status ?? 'not_reported';
  acc[s] = (acc[s] || 0) + 1;
  return acc;
}, {});
const summarizeDeptStatus = (dept) => ({
  departmentId: dept.departmentId,
  departmentName: dept.department?.name,
  status: dept.status ?? 'not_reported',
  kpiCount: dept.rows.length,
  statusCounts: statusCounts(dept.rows),
});

// Common question words stripped before employee-name matching — same idea as
// ChatBot.jsx's NAME_STOPWORDS (kept smaller here since this tool is only ever called
// with a name/number the model has already extracted from the user's question).
const extractNameTokens = (query) => String(query || '')
  .toLowerCase()
  .replace(/[^a-z\s]/g, ' ')
  .split(/\s+/)
  .filter(w => w.length > 2);

const TOOLS = [
  {
    name: 'get_kpi_overview',
    description: "The Group KPI Dashboard's company-wide RAG (Red/Amber/Green) rollup — every department's rating against target for a given month.",
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Month to roll up, as YYYY-MM. Defaults to the current month.' }
      }
    },
    handler: async ({ period }) => {
      const p = period || currentPeriod();
      const result = rollupGroup(p);
      return { period: result.period, status: result.status ?? 'not_reported', departments: result.departments.map(summarizeDeptStatus) };
    }
  },
  {
    name: 'get_kpi_department',
    description: "One department's KPI roll-up and individual KPI rows (targets, actuals, RAG status) for a given month.",
    parameters: {
      type: 'object',
      properties: {
        departmentId: { type: 'string', description: `One of: ${KPI_DEPARTMENT_IDS().map(d => d.id).join(', ')}` },
        period: { type: 'string', description: 'Month, as YYYY-MM. Defaults to the current month.' }
      },
      required: ['departmentId']
    },
    handler: async ({ departmentId, period }) => {
      const valid = KPI_DEPARTMENT_IDS().some(d => d.id === departmentId);
      if (!valid) return { error: `Unknown departmentId "${departmentId}". Valid ids: ${KPI_DEPARTMENT_IDS().map(d => d.id).join(', ')}` };
      return summarizeDeptRollup(rollupDepartment(departmentId, period || currentPeriod()));
    }
  },
  {
    name: 'get_corporate_budget_summary',
    description: 'Corporate (General Finance) budget vs. actual — by business unit and by month, from the latest synced snapshot.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const snap = getLatestSnapshot();
      if (!snap?.corporateBudget) return { error: 'No corporate budget data in the latest snapshot yet.' };
      const { byUnit, monthly, utilizationYTD } = snap.corporateBudget;
      return { asOf: snap.asOf, byUnit, monthly, utilizationYTD };
    }
  },
  {
    name: 'get_balance_sheet_summary',
    description: "The Balance Sheet's live totals (assets, liabilities, equity, ratios) as of the latest sync, or a specific prior month if given.",
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'A specific prior month to look up, matching the dashboard\'s own labels, e.g. "March 2026". Omit for the current live totals.' }
      }
    },
    handler: async ({ period }) => {
      const snap = getLatestSnapshot();
      if (!snap?.balanceSheet) return { error: 'No balance sheet data in the latest snapshot yet.' };
      const bs = snap.balanceSheet;
      if (!period) {
        const { totalAssets, totalLiabilities, equity, currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities, ratios, asOf } = bs;
        return { asOf, totalAssets, totalLiabilities, equity, currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities, ratios };
      }
      const month = (bs.monthly || []).find(m => m.label === period);
      if (!month) return { error: `No balance sheet figures for "${period}". Available months: ${(bs.monthly || []).map(m => m.label).join(', ')}` };
      const { totalAssets, totalLiabilities, equity, currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities, asOf } = month;
      return { asOf, totalAssets, totalLiabilities, equity, currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities };
    }
  },
  {
    name: 'get_cashflow_summary',
    description: 'Current live cashflow — collections, operating/capex outflows, and the Direct Method Cash Flow Statement headline figures, from the latest synced snapshot. (Historical year/month lookups are not available to this tool yet — only the current period.)',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const snap = getLatestSnapshot();
      if (!snap?.cashflow) return { error: 'No cashflow data in the latest snapshot yet.' };
      const { flows, monthlyCollections, directStatement } = snap.cashflow;
      return {
        asOf: snap.asOf,
        flows,
        monthlyCollections,
        directStatement: directStatement ? {
          netCashOperating: directStatement.netCashOperating,
          netCashInvesting: directStatement.netCashInvesting,
          netCashFinancing: directStatement.netCashFinancing,
          totalChange: directStatement.totalChange,
          actualEndingCash: directStatement.actualEndingCash,
        } : null
      };
    }
  },
  {
    name: 'find_employee',
    description: "Looks up an employee by name or employee number against the live active roster, including their current monthly cost if on payroll. Use this instead of guessing when a question names a specific person.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A name (full or partial) or an employee number.' }
      },
      required: ['query']
    },
    handler: async ({ query }) => {
      const snap = getLatestSnapshot();
      const roster = snap?.hr?.activeRoster || [];
      if (!roster.length) return { error: 'No employee roster in the latest snapshot yet.' };

      const q = String(query || '').toLowerCase();
      let matches = roster.filter(r => (r.employeeNo || '').toLowerCase() && q.includes((r.employeeNo || '').toLowerCase()));
      if (!matches.length) {
        const tokens = extractNameTokens(query);
        if (tokens.length) {
          const nameOf = r => (r.name || '').toLowerCase();
          matches = roster.filter(r => tokens.every(t => nameOf(r).includes(t)));
          if (!matches.length) matches = roster.filter(r => tokens.some(t => nameOf(r).includes(t)));
        }
      }
      matches = matches.slice(0, 5);
      if (!matches.length) return { matches: [], note: 'No employee matched that name/number.' };

      const payrollByNo = {};
      (snap?.hrReview?.employeePayroll || []).forEach(p => { (payrollByNo[p.employeeNo] ||= []).push(p); });
      return {
        matches: matches.map(m => {
          const recs = payrollByNo[m.employeeNo] || [];
          const sumLatestMonth = (key) => {
            const months = [...new Set(recs.flatMap(r => Object.keys(r[key] || {})))].sort();
            const latest = months[months.length - 1];
            if (!latest) return null;
            return { month: latest, amount: recs.reduce((s, r) => s + (r[key]?.[latest] || 0), 0) };
          };
          return {
            employeeNo: m.employeeNo, name: m.name, jobTitle: m.jobTitle,
            businessUnit: m.buCode, section: m.sectionName || m.sectionCode,
            virtualCompany: m.vc, employeeType: m.type, status: m.status,
            latestMonthlyCost: sumLatestMonth('monthTotals'),
          };
        })
      };
    }
  },
];

const logCall = db.prepare(`
  INSERT INTO ai_agent_log (user_id, tool_name, params_json, result_summary, ok, error)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Runs a named tool by whatever arguments the model supplied, logging the call either
// way. Never throws — a failed/unknown tool call comes back as { error } so the model
// can recover (ask the user, try something else) instead of the whole chat request
// failing. `result_summary` is a short, non-sensitive shape description, not the actual
// figures — see ai_agent_log's own comment in db.js for why.
async function runTool(name, args, user) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) {
    logCall.run(user?.id || null, name, JSON.stringify(args || {}), null, 0, 'Unknown tool');
    return { error: `Unknown tool "${name}".` };
  }
  try {
    const result = await tool.handler(args || {}, user);
    const summary = result?.error
      ? `error: ${result.error}`
      : Array.isArray(result) ? `array(${result.length})` : `object(${Object.keys(result || {}).join(',')})`;
    logCall.run(user?.id || null, name, JSON.stringify(args || {}), summary, result?.error ? 0 : 1, result?.error || null);
    return result;
  } catch (e) {
    console.error(`[ai-tools] ${name} failed:`, e.message);
    logCall.run(user?.id || null, name, JSON.stringify(args || {}), null, 0, e.message);
    return { error: 'Tool call failed — try a different question or be more specific.' };
  }
}

module.exports = { TOOLS, runTool };
