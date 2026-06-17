import { useState, useRef, useEffect } from 'react'
import { ai } from '../lib/api.js'

export default function ChatBot({ data }) {
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
      const system = `You are an executive dashboard assistant for Kifiya Financial Technology. Be concise.
Current data snapshot: ${JSON.stringify(data).slice(0, 4000)}`
      const r = await ai.chat([{ role: 'system', content: system }, ...next])
      const j = await r.json()
      setMessages(m => [...m, { role: 'assistant', content: j.reply || j.error || 'No response.' }])
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
          style={{ width: 320, height: 440 }}
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
                  className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed font-medium"
                  style={m.role === 'user'
                    ? { background: '#02404F', color: 'white', borderBottomRightRadius: 4 }
                    : { background: '#F4F6FA', color: '#02404F', borderBottomLeftRadius: 4 }
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-2.5 text-xs text-muted font-medium" style={{ background: '#F4F6FA', borderBottomLeftRadius: 4 }}>
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
