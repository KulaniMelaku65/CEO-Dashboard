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
  'overview':               ['budgetOverview', 'budgetActual', 'cashflow'],
  'financial':               ['reports', 'budgetActual'],
  'budget':                  ['corporateBudget', 'budgetOverview'],
  'lending':                  ['lending', 'loanOps'],
  'collections':              ['budgetActual'],
  'risk':                     ['risk'],
  'hr':                       ['hr', 'hrReview'],
  'hr-summary':               ['hr', 'hrReview'],
  'employee-cost':            ['employeeCost', 'hr'],
  'employee-cost-detail':     ['employeeCost'],
  'employee-cost-variance':   ['employeeCost'],
  'hr-page-review':           ['hr', 'hrReview'],
  'department-overrides':     ['hr', 'hrReview'],
  'reports':                  ['reports']
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

function buildContext(data, pageId) {
  const keys = PAGE_DATA_KEYS[pageId] || Object.keys(data || {})
  const relevant = { asOf: data?.asOf }
  keys.forEach(k => { if (data?.[k] !== undefined) relevant[k] = stripHeavy(data[k]) })
  return JSON.stringify(relevant).slice(0, 20000)
}

// Single-employee lookup — activeRoster/employeePayroll are deliberately in HEAVY_KEYS
// (stripped from the general context) to keep the char budget for aggregates, so a
// name or employee number the user actually typed is searched locally here and, if
// matched, that one record is attached on its own. This is the only way a "what
// department is X in" / "what does X cost" question can be answered at all — without
// it the assistant only ever sees totals, never individuals. Includes any active
// dashboard-only department override automatically, since it's already baked into
// activeRoster's buCode/sectionCode at sync time.
function findEmployeeMatches(query, data) {
  const roster = data?.hr?.activeRoster || []
  if (!roster.length) return []
  const q = query.toLowerCase()
  const words = q.split(/\s+/).filter(w => w.length > 2)
  return roster.filter(r => {
    const no = (r.employeeNo || '').toLowerCase()
    if (no && q.includes(no)) return true
    const name = (r.name || '').toLowerCase()
    return name && words.some(w => name.includes(w))
  }).slice(0, 5)
}

function buildEmployeeBlock(matches, data) {
  if (!matches.length) return ''
  const payrollByNo = {}
  ;(data?.hrReview?.employeePayroll || []).forEach(p => { payrollByNo[p.employeeNo] = p })
  const enriched = matches.map(m => {
    const pay = payrollByNo[m.employeeNo]
    return {
      employeeNo: m.employeeNo, name: m.name, jobTitle: m.jobTitle,
      businessUnit: m.buCode, section: m.sectionName || m.sectionCode,
      virtualCompany: m.vc, employeeType: m.type, status: m.status,
      ...(pay ? { monthlyCost: pay.monthTotals, pensionMonthlyCost: pay.pensionMonthTotals, payrollSource: pay.payrollSource } : {})
    }
  })
  return `\nEmployee record(s) matching the user's message, from the live active roster (department already reflects any dashboard override): ${JSON.stringify(enriched)}`
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
      // Organization Mapping's own override records (who was moved, from/to, by whom)
      // live in a separate DB table, not the main snapshot — fetch them here so the
      // assistant can actually answer "who was moved to X" style questions on that page.
      let overridesBlock = ''
      if (pageId === 'department-overrides') {
        try {
          const or = await departmentOverrides.list()
          const list = or.ok ? await or.json() : []
          overridesBlock = `\nActive dashboard-only department overrides (not reflected in Business Central itself): ${JSON.stringify(list).slice(0, 4000)}`
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
