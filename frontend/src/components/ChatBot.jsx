import { useState, useRef, useEffect } from 'react'
import { ai, departmentOverrides } from '../lib/api.js'
import { renderMarkdown } from '../lib/markdown.jsx'

// Which top-level snapshot keys are relevant per page — without this, the context
// was always built by JSON.stringify-ing the whole snapshot from the top and slicing
// to 4000 chars, so on the HR pages (and most others) the budget was spent entirely on
// budgetActual/budgetOverview/cashflow/reports before the serializer ever reached hr or
// hrReview, and the assistant had no HR data to answer from regardless of what page the
// user was on.
const PAGE_DATA_KEYS = {
  'overview':                 ['budgetOverview', 'budgetActual', 'cashflow', 'hr', 'lending', 'loanOps'],
  'finance':                  ['reports', 'budgetActual', 'budgetOverview', 'corporateBudget', 'financialSS', 'dimensionNames'],
  'financial':                ['reports', 'budgetActual', 'budgetOverview', 'corporateBudget', 'financialSS', 'dimensionNames'],
  'financial-2':              ['reports', 'budgetActualIfrs18', 'budgetOverview', 'corporateBudget', 'financialSS', 'dimensionNames'],
  'budget':                   ['corporateBudget', 'budgetOverview'],
  'collections':              ['budgetOverview', 'financialSS', 'loanOps'],
  'balance-sheet':            ['balanceSheet'],
  'cashflow':                 ['cashflow'],
  'tax':                      ['tax'],
  'aging':                    ['arAging', 'apAging'],
  'lending':                  ['lending', 'loanOps'],
  'risk':                     ['risk', 'cashflow'],
  'hr':                       ['hr', 'hrReview'],
  'hr-summary':               ['hr', 'hrReview', 'employeeCost'],
  'employee-cost':            ['employeeCost', 'hr'],
  'employee-cost-detail':     ['employeeCost'],
  'employee-cost-variance':   ['employeeCost'],
  'hr-page-review':           ['hr', 'hrReview', 'employeeCost'],
  'department-overrides':     ['hr', 'hrReview', 'employeeCost'],
  'admin-users':              []
}

// Per-employee/per-transaction detail and raw lookup maps the model doesn't need to
// answer headline questions — stripped so they don't crowd out the aggregate figures
// (turnover rate, headcount, CTC) within the char budget. empNoToType/empNoToJobTitle
// in particular are pure employeeNo→value lookup tables for the frontend's own joins,
// not summaries — together they ran to ~50k characters with zero chat value.
const HEAVY_KEYS = new Set([
  'roster', 'employees', 'joinerRecords', 'leaverRecords', 'employeePayroll',
  'buDrillDown', 'activeRoster', 'headcountMatrix', 'seniorityList',
  'empNoToType', 'empNoToJobTitle', 'byJobTitle'
])
function stripHeavy(val) {
  if (Array.isArray(val)) return val.map(stripHeavy)
  if (val && typeof val === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(val)) {
      if (HEAVY_KEYS.has(k)) continue
      // headcountEvolution is a 12-20 month time series with a full per-BU/per-type
      // breakdown each — only the most recent few months are worth the space for a
      // "what's headcount right now" style question.
      if (k === 'headcountEvolution' && Array.isArray(v)) { out[k] = v.slice(-3).map(stripHeavy); continue }
      out[k] = stripHeavy(v)
    }
    return out
  }
  return val
}

// The procurement block carries raw PO/spend rows for the pages' own client-side filtering
// (~600 KB) — far too large for chat context, and unnecessary for headline questions. This
// boils it down to the aggregates a person would actually ask about, plus the data-quality
// caveats (all POs open, DOA limits unset, ETB-only totals) so answers don't overstate.
function summarizeProcurement(p) {
  if (!p) return null
  const sum = (rows, f) => Math.round(rows.reduce((s, r) => s + (f(r) || 0), 0))
  const group = (rows, keyFn, valFn, n = 10) => {
    const m = new Map()
    rows.forEach(r => { const k = keyFn(r); const g = m.get(k) || { name: k, count: 0, total: 0 }; g.count++; g.total += valFn(r) || 0; m.set(k, g) })
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, n).map(g => ({ ...g, total: Math.round(g.total) }))
  }
  const etb = p.po.rows.filter(r => r.cur === 'ETB')
  const foreign = p.po.rows.filter(r => r.cur !== 'ETB')
  const spend = p.spend.rows
  const caveats = []
  if (foreign.length) caveats.push('ETB totals exclude foreign-currency POs (no FX rate available); those are listed separately in their own currency.')
  if (p.variance.totals.linesWithReceipt === 0 && p.variance.totals.linesWithInvoice === 0) caveats.push('Nothing is received or invoiced against any PO in Business Central, so every PO counts as open.')
  if (!etb.some(r => r.unl || r.lim > 0)) caveats.push('No approver has a purchase approval limit set in Business Central, so DOA "breaches" are a setup gap, not confirmed breaches.')
  if (p.offContract?.onContractLines === 0) caveats.push('No PO line references a blanket order (contract), so 100% of spend counts as outside contract — a coverage gap in the data as much as a buying-behaviour finding.')
  if (p.vendorDelivery?.count) caveats.push('Vendor on-time delivery compares the receipt posting date with the expected receipt date only (promised/requested dates are blank); many receipts are booked at purchase time, so the overall on-time rate is optimistic — the late receipts are the reliable signal. No quality/returns data exists.')
  caveats.push('Purchase requisitions are Business Central purchase quotes; no PO feed carries a requisition reference, so PR-to-PO conversion cannot be calculated.')
  Object.values(p.endpoints).forEach(e => {
    if (!e.ok) caveats.push(`${e.name} is unavailable: ${e.error}`)
    else if (e.rows === 0) caveats.push(`${e.name} is connected but returns 0 rows.`)
  })
  return {
    caveats,
    endpoints: p.endpoints,
    purchaseOrders: {
      countETB: etb.length,
      valueETB: sum(etb, r => r.amt),
      valueInclVatETB: sum(etb, r => r.vat),
      byStatus: group(etb, r => r.st, r => r.amt),
      topVendors: group(etb, r => r.v || r.vn, r => r.amt),
      pendingApproval: group(etb.filter(r => r.st === 'Pending Approval'), r => r.ap, r => r.amt),
      foreignCurrency: group(foreign, r => r.cur, r => r.amt),
    },
    variance: p.variance.totals,
    commitments: { totals: p.commitments.totals, byBudget: p.commitments.byBudget, byMonth: p.commitments.byMonth },
    spend: {
      totalETB: sum(spend, r => r.amt),
      byMonth: group(spend, r => r.d.slice(0, 7), r => r.amt, 24),
      byCategory: group(spend, r => r.t, r => r.amt),
      topVendors: group(spend, r => r.v?.trim() || r.vn, r => r.amt),
    },
    requisitions: {
      count: p.requisitions.count,
      valueETB: sum(p.requisitions.rows.filter(r => r.cur === 'ETB'), r => r.amt),
      byStatus: group(p.requisitions.rows, r => r.st, r => (r.cur === 'ETB' ? r.amt : 0)),
      withNoAmount: p.requisitions.rows.filter(r => !r.amt).length,
      byRequester: group(p.requisitions.rows, r => r.u, r => (r.cur === 'ETB' ? r.amt : 0), 10),
      largest: [...p.requisitions.rows].filter(r => r.cur === 'ETB').sort((a, b) => b.amt - a.amt).slice(0, 5).map(r => ({ no: r.no, payee: r.v, status: r.st, amount: r.amt })),
      pendingApproval: { count: p.pendingPr.count, valueETB: sum(p.pendingPr.rows.filter(r => r.cur === 'ETB'), r => r.amt), byRequester: group(p.pendingPr.rows, r => r.u, () => 0, 10) },
    },
    vendorDelivery: p.vendorDelivery && (() => {
      const day = d => Math.round(new Date(d + 'T12:00:00').getTime() / 86400000)
      const rs = p.vendorDelivery.rows.filter(r => r.pd && r.exp).map(r => ({ ...r, late: day(r.pd) - day(r.exp) }))
      const late = rs.filter(r => r.late > 0)
      return {
        receipts: rs.length,
        postedOnOrBeforeExpectedPct: rs.length ? Math.round(((rs.length - late.length) / rs.length) * 1000) / 10 : null,
        lateReceipts: late.length,
        avgDaysLate: late.length ? Math.round((late.reduce((s, r) => s + r.late, 0) / late.length) * 10) / 10 : null,
        receiptsPostedBeforeOrderDate: rs.filter(r => r.od && day(r.pd) < day(r.od)).length,
        promisedDatesFilled: p.vendorDelivery.withPromisedDate,
        vendorsWithMostLateReceipts: group(late, r => r.v || r.vn, () => 1, 8).map(g => ({ vendor: g.name, lateReceipts: g.count })),
      }
    })(),
    outsideContract: p.offContract && {
      totals: p.offContract.totals, onContractLines: p.offContract.onContractLines, vendors: p.offContract.vendors,
      topVendors: p.offContract.byVendor.slice(0, 10).map(({ v, vn, pos, value }) => ({ vendor: v, vendorNo: vn, pos, value })),
    },
    budgets: p.budget.budgets.map(({ byDim, monthly, ...b }) => b),
    approvers: group(etb, r => r.ap, r => r.amt, 15),
  }
}

function buildContext(data, pageId) {
  if (pageId?.startsWith('procurement')) {
    return JSON.stringify({ asOf: data?.asOf, procurement: summarizeProcurement(data?.procurement) }).slice(0, 20000)
  }
  const keys = PAGE_DATA_KEYS[pageId] || Object.keys(data || {})
  const relevant = { asOf: data?.asOf }
  keys.forEach(k => { if (data?.[k] !== undefined) relevant[k] = stripHeavy(data[k]) })
  return JSON.stringify(relevant).slice(0, 20000)
}

// Common question words stripped out before name-matching — without this, asking
// "what does John cost" treats "what"/"does"/"cost" as name fragments too, which
// (a) is noisy and (b) defeats the all-tokens-must-match narrowing below, since none
// of those words appear in anyone's actual name.
const NAME_STOPWORDS = new Set([
  'what', 'who', 'when', 'where', 'why', 'how', 'is', 'are', 'was', 'were', 'does', 'did',
  'do', 'the', 'has', 'have', 'had', 'and', 'for', 'with', 'about', 'tell', 'me', 'please',
  'employee', 'staff', 'person', 'department', 'section', 'business', 'unit', 'cost',
  'salary', 'pay', 'payroll', 'total', 'monthly', 'job', 'title', 'type', 'status',
  'company', 'virtual', 'changed', 'change', 'transfer', 'transferred', 'moved', 'move',
  'from', 'which', 'info', 'information', 'details', 'show', 'find', 'search', 'give'
])

const extractNameTokens = (query) => query
  .toLowerCase()
  .replace(/[^a-z\s]/g, ' ') // strip punctuation/digits, e.g. "Abebe's" or "Abebe?"
  .split(/\s+/)
  .filter(w => w.length > 2 && !NAME_STOPWORDS.has(w))

// Single-employee lookup — activeRoster/employeePayroll are deliberately in HEAVY_KEYS
// (stripped from the general context) to keep the char budget for aggregates, so a
// name or employee number the user actually typed is searched locally here and, if
// matched, that one record is attached on its own. This is the only way a "what
// department is X in" / "what does X cost" question can be answered at all — without
// it the assistant only ever sees totals, never individuals. Includes any active
// dashboard-only department override automatically, since it's already baked into
// activeRoster's buCode/sectionCode at sync time.
//
// Name matching prefers an ALL-tokens match over an ANY-tokens one — with Ethiopian
// naming (own name + father's name + grandfather's name, no family surname), a first
// name alone is often shared by several people, so "Abebe Kebede" or a full three-part
// name should narrow down to one person rather than returning everyone named Abebe.
// Falls back to ANY-token matching only when no one matches every token, so a genuine
// first-name-only search (or a typo in one token) still returns candidates.
function findEmployeeMatches(query, data) {
  const roster = data?.hr?.activeRoster || []
  if (!roster.length) return []
  const q = query.toLowerCase()

  const byNo = roster.filter(r => {
    const no = (r.employeeNo || '').toLowerCase()
    return no && q.includes(no)
  })
  if (byNo.length) return byNo.slice(0, 5)

  const tokens = extractNameTokens(query)
  if (!tokens.length) return []

  const nameOf = (r) => (r.name || '').toLowerCase()
  const allMatch = roster.filter(r => tokens.every(t => nameOf(r).includes(t)))
  if (allMatch.length) return allMatch.slice(0, 5)

  return roster.filter(r => tokens.some(t => nameOf(r).includes(t))).slice(0, 5)
}

function buildEmployeeBlock(matches, data) {
  if (!matches.length) return ''
  // Some employees (dual-hatted staff) have a payroll record under BOTH the Corporate
  // (KIFIYA) and Programme (SAFEE) books simultaneously — keyed on employeeNo alone,
  // an object map would silently keep only the last one seen and drop the other's
  // cost entirely. Collected as arrays instead, and every source's monthly figures
  // are summed below, so the reported monthly cost is the employee's real total.
  const payrollByNo = {}
  ;(data?.hrReview?.employeePayroll || []).forEach(p => { (payrollByNo[p.employeeNo] ||= []).push(p) })
  const enriched = matches.map(m => {
    const recs = payrollByNo[m.employeeNo] || []
    const sumMonths = (key) => recs.reduce((acc, r) => {
      Object.entries(r[key] || {}).forEach(([month, v]) => { acc[month] = (acc[month] || 0) + (v || 0) })
      return acc
    }, {})
    return {
      employeeNo: m.employeeNo, name: m.name, jobTitle: m.jobTitle,
      businessUnit: m.buCode, section: m.sectionName || m.sectionCode,
      virtualCompany: m.vc, employeeType: m.type, status: m.status,
      ...(recs.length ? {
        monthlyCost: sumMonths('monthTotals'),
        pensionMonthlyCost: sumMonths('pensionMonthTotals'),
        payrollSources: recs.map(r => r.payrollSource)
      } : {})
    }
  })
  return `\nEmployee record(s) matching the user's message, from the live active roster (department already reflects any dashboard override). When payrollSources lists more than one source, monthlyCost/pensionMonthlyCost are already the combined total across all of them — report that total, not just one source's figure: ${JSON.stringify(enriched)}`
}

export default function ChatBot({ data, pageId, pageLabel }) {
  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm Kifiya's AI assistant. Ask me anything about the dashboard data." }
  ])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef             = useRef(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)
    try {
      // Department-transfer records (who was moved, from which section to which, by
      // whom, when) live in a separate DB table, not the main snapshot — fetch them on
      // all three HR pages so "did X change department, from what to what" is
      // answerable regardless of which of the three the user happens to be viewing.
      let overridesBlock = ''
      if (['hr-summary', 'hr-page-review', 'department-overrides'].includes(pageId)) {
        try {
          const or = await departmentOverrides.list()
          const list = or.ok ? await or.json() : []
          const dimNames = data?.dimensionNames || {}
          const enrichedList = list.map(o => ({
            ...o,
            from_section_name: dimNames[o.from_section] || o.from_section,
            to_section_name:    dimNames[o.section_code]  || o.section_code
          }))
          overridesBlock = `\nDashboard-only department transfers (not reflected in Business Central itself — from_section/section_code are the section codes moved from/to, with human-readable names alongside): ${JSON.stringify(enrichedList).slice(0, 4000)}`
        } catch { /* best-effort — omit if unavailable */ }
      }
      const employeeBlock = buildEmployeeBlock(findEmployeeMatches(text, data), data)
      const system = `You are an executive dashboard assistant for Kifiya Financial Technology. Be concise.
The user is currently viewing the "${pageLabel || 'dashboard'}" page — prioritize that page's data when answering.
Current data snapshot: ${buildContext(data, pageId)}${overridesBlock}${employeeBlock}`
      const r = await ai.chat([{ role: 'system', content: system }, ...next])
      const j = await r.json()
      const reply = j.choices?.[0]?.message?.content || j.error || 'No response.'
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection error — is the backend running?' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="AI Assistant"
        className="fixed bottom-16 right-5 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
        style={{ background: '#EB7D23' }}
      >
        {open
          ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        }
      </button>

      {open && (
        <div
          className="fixed bottom-32 right-5 z-50 bg-white rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden"
          style={{ width: 400, height: 520, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 160px)' }}
        >
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border flex-shrink-0" style={{ background: '#02404F' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#EB7D23' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <p className="text-white text-xs font-bold">Kifiya AI</p>
              <p className="text-white/40 text-[10px]">Dashboard Assistant</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`${m.role === 'assistant' ? 'max-w-[95%]' : 'max-w-[85%]'} rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed font-medium`}
                  style={m.role === 'user'
                    ? { background: '#02404F', color: 'white', borderBottomRightRadius: 4 }
                    : { background: '#0F3D46', color: '#FFFFFF', borderBottomLeftRadius: 4 }
                  }
                >
                  {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-2.5 text-xs font-medium" style={{ background: '#0F3D46', color: 'rgba(255,255,255,0.6)', borderBottomLeftRadius: 4 }}>
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex items-center gap-2 px-3 py-3 border-t border-border flex-shrink-0">
            <input
              className="flex-1 text-xs border border-border rounded-xl px-3 py-2 outline-none text-navy font-medium focus:border-navy transition-colors"
              placeholder="Ask about the data…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-40 flex-shrink-0"
              style={{ background: '#EB7D23' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
