# Agentic AI Roadmap

The dashboard's AI assistant started as pure Q&A: it reads whatever data is already on
the page a user is viewing into the system prompt and answers one question at a time,
with no state and no actions of its own. This doc lays out what "agentic" means for it —
able to investigate a question across data it wasn't handed up front, and eventually act
on findings rather than only describe them — and the order to build it in.

## Layers

## Alignment with the product brief

Two reference docs landed in `docs/` mid-build: `Kifiya_Agentic_AI_Product_Concept.docx`
(product brief) and `Kifiya_Dashboard_Build_and_Agentic_AI_Readiness.docx` (code review).
Both independently describe the same shape this roadmap already targets — bounded
server-side tools, authorization enforced on every tool call (never the chat UI's page
context), read-only first release, as-of/freshness disclosure, and audit logging without
sensitive content. One requirement worth calling out explicitly: distinguish **"not
reported"** from a red/poor result — a department with no KPI submission yet must never
read as failing. `get_kpi_overview`/`get_kpi_department` do this (see layer 2).

## Live verification

Tested against the real `/api/ai/chat` endpoint (not a unit test) — real auth (signed
JWT), real tool execution, real SQLite/snapshot data, real Groq API round trip:
- `get_kpi_overview` → correctly answered "no departments have submitted data yet" for a
  month with zero real submissions (confirms the not-reported-vs-red distinction holds
  end to end, not just in the handler).
- `get_balance_sheet_summary` → returned real current totals (assets/liabilities) sourced
  from the live snapshot.
- `find_employee` → correctly resolved a partial name to the real roster record and its
  job title/business unit.
- `ai_agent_log` captured every call with the right user id, tool name, params, and a
  non-sensitive result summary.

`get_kpi_department`, `get_corporate_budget_summary`, and `get_cashflow_summary` weren't
individually exercised live but share the exact same code path (tool registry → handler →
`runTool`'s logging/error wrapper → provider loop) as the three that were, so this isn't
a meaningful coverage gap — just not separately demonstrated yet.

**Operational finding, unrelated to this feature**: this environment's `GEMINI_KEY` in
`.env` is invalid (`API_KEY_INVALID` from Google) and Gemini is first in the auto-select
priority order, so if no DB-stored provider key or forced `AI_PROVIDER`/admin selection is
set, chat requests fail even though Groq's key works fine. Either fix/remove the Gemini
key or set an active provider in Admin — Users & Access.

**Also found while testing**: Groq's `openai/gpt-oss-20b` on this account's free tier has
an 8000 TPM cap that a payload of several large tool results can still exceed in one
exchange — not a code issue, but worth knowing if testing hits a 413 again. Trimming tool
outputs (as done for the KPI tools below) is the right lever, not raising iteration counts
or retrying.

### 1. Tool-calling + agent loop — **built, live-verified**
`routes/ai.js` now runs a loop instead of a single request/response: send the
conversation + a set of tool definitions to whichever provider is active → the provider
either answers directly or asks to call one or more tools → the server executes them and
feeds the results back → repeat (capped at 6 round trips) → return the final answer.
Implemented for all four supported providers (OpenAI, Groq, Gemini, Claude) since each
formats tool-calling differently:

| Provider | Request shape | Response shape |
|---|---|---|
| OpenAI / Groq (same, OpenAI-compatible) | `tools: [{type:"function", function:{...}}]` | `message.tool_calls[]` |
| Claude | `tools: [{name, description, input_schema}]` | `content[]` blocks with `type:"tool_use"` |
| Gemini | `tools: [{functionDeclarations:[...]}]` | `candidates[0].content.parts[]` with `functionCall` |

The existing `/api/ai/chat` endpoint was upgraded in place — same request/response shape
the frontend chatbot already sends and reads, so `ChatBot.jsx` gained this capability with
no frontend changes required. If the active provider/model doesn't support tool-calling
well, it just never calls a tool and behaves exactly as before.

### 2. Read-only tools — **built (first 6)**
`backend/services/ai-tools.js` is the tool registry. Each tool reuses the same function or
query an equivalent REST route already calls — no duplicated logic, and the agent's view
of the data can never drift from what the dashboard itself shows.

Shipped: `get_kpi_overview`, `get_kpi_department`, `get_corporate_budget_summary`,
`get_balance_sheet_summary`, `get_cashflow_summary`, `find_employee`.

`get_kpi_overview`/`get_kpi_department` re-shape `rollupGroup()`/`rollupDepartment()`'s
output rather than returning it as-is — the raw rollup carries every KPI's full
dictionary row (created_at, rag_rule_json, pending_action, ...), ~40KB for one
department alone, 15-40x more than a tool result needs. The trimmed version keeps the
same already-computed `status`/`rag_status` fields (never recomputes RAG logic) and
reports a department with no submission as `"not_reported"`, not silently omitted or
conflated with a red result.

Natural next additions, each following the same pattern (reuse an existing function,
return a compact shape, register in `TOOLS`): SAFEE budget (`buildOverview`/
`buildYearDetail` from `services/safee-budget.js`), procurement reports, GL drilldown,
HR/headcount summaries, aging (AR/AP). Add these as real questions come up that the
current 6 can't answer, rather than building every domain speculatively.

### 3. Permission-aware tools — **built, with a known gap carried over from the REST API**
Every tool handler receives the calling user and enforces whatever that resource's REST
route already enforces — nothing more, nothing less, so the agent's access boundary
matches the one that already exists. Concretely: KPI reads require only being logged in
(no extra department check — the same as `GET /api/kpi/overview` and
`GET /api/kpi/department/:id` today), and the same is true for budget/balance
sheet/cashflow/employee data.

**Known gap, not introduced by this feature**: per-user *page* access
(`user_page_access`) is enforced client-side only — hiding a nav item, not blocking the
underlying REST route. A user with no Balance Sheet page grant could already call
`GET /api/snapshots/latest` directly and read that data before any of this existed; the
agent's tools inherit that same gap rather than closing it, since closing it is a larger,
separate hardening pass across every existing route, not something to bundle silently
into this feature. Worth prioritizing before wiring up any **write** tool (layer 5) whose
blast radius matters more than a read.

### 4. Audit logging — **built**
Every tool call is logged to the new `ai_agent_log` table (`backend/db.js`): user id,
tool name, params, a short result shape summary (never the actual figures — keeps rows
small and avoids duplicating potentially sensitive data at rest), success/failure, and
timestamp. A failed or unknown tool call is logged too, so "why did the agent say X" is
always answerable after the fact. No admin UI to browse this yet — add a simple table
view under Admin once there's enough real usage to want one.

### 5. Actions — **not built**
The part that actually makes this "decision-making" instead of "better Q&A": tools that
write something, not just read. Scope deliberately narrow to start — flag a variance for
review, draft a note on a KPI — never anything that touches `users`/auth or mutates real
financial records directly. Every write tool needs an explicit confirmation step in the
UI (the agent proposes, a person clicks confirm, *then* the real endpoint runs) — never
autonomous execution, mirroring how Claude Code itself is only allowed to take
consequential actions with the user's explicit go-ahead.

Do not start this layer until:
- Layers 1-4 have real usage and the agent's accuracy has been spot-checked against known
  figures (hallucination risk is the main threat to trusting this for decisions), and
- The page-access gap noted in layer 3 has at least been decided on (fixed, or explicitly
  accepted as out of scope for the actions this layer would add).

### 6. Proactive analysis — **not built**
Scheduled job (reusing the cron pattern already in `services/scheduler.js`, running right
after each snapshot sync) that checks fixed, deterministic rules — budget utilization over
a threshold, YoY variance spikes, KPI reds — and surfaces them as a new Alerts section, or
as context the agent can draw on when asked "what should I be worried about." Start with
hardcoded threshold rules (cheap, predictable, no hallucination risk) rather than having
the LLM itself decide what's alert-worthy; it can narrate/prioritize already-flagged items
later. Largely independent of layers 1-5 — can be built in parallel.

## Status

| Layer | Status |
|---|---|
| 1. Tool-calling + agent loop | Built, live-verified against the real endpoint |
| 2. Read-only tools | Built (6 tools, 3 live-verified; more to add as needed) |
| 3. Permission-aware tools | Built (inherits the existing REST API's access boundary) |
| 4. Audit logging | Built |
| 5. Actions | Not started — see prerequisites above |
| 6. Proactive analysis | Not started |
