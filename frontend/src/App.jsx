import { useState, useEffect, useRef, useCallback } from 'react'
import { auth, snapshots } from './lib/api.js'
import LoginOverlay from './components/LoginOverlay.jsx'
import Sidebar from './components/Sidebar.jsx'
import Topbar from './components/Topbar.jsx'
import SlideProgress from './components/SlideProgress.jsx'
import ChatBot from './components/ChatBot.jsx'
import Overview from './pages/Overview.jsx'
import Financial from './pages/Financial.jsx'
import LoanOps from './pages/LoanOps.jsx'
import Collections from './pages/Collections.jsx'
import HR from './pages/HR.jsx'
import Risk from './pages/Risk.jsx'
import Reports from './pages/Reports.jsx'

export const SLIDES = [
  { id: 'overview',     label: 'Overview',              Page: Overview },
  { id: 'financial',    label: 'Financial Performance', Page: Financial },
  { id: 'lending',      label: 'Loan Operations',       Page: LoanOps },
  { id: 'collections',  label: 'Receivables',           Page: Collections },
  { id: 'hr',           label: 'People & HR',           Page: HR },
  { id: 'risk',         label: 'Risk & Portfolio',      Page: Risk },
  { id: 'reports',      label: 'Reports',               Page: Reports },
]

const SLIDE_MS = 12000

export default function App() {
  const [user, setUser]             = useState(null)
  const [data, setData]             = useState(null)
  const [slide, setSlide]           = useState(0)
  const [paused, setPaused]         = useState(false)
  const [status, setStatus]         = useState('loading')
  const [histDate, setHistDate]     = useState(null)
  const [booting, setBooting]       = useState(true)
  const [sidebarOpen, setSidebar]   = useState(false)
  const pauseTimer                  = useRef(null)

  const loadData = useCallback(async (date) => {
    setStatus('loading')
    try {
      const r = date
        ? await snapshots.byDate(date)
        : await snapshots.latest()
      if (r.status === 401) { setUser(null); setStatus('error'); return }
      if (!r.ok) { setStatus('error'); return }
      setData(await r.json())
      setStatus('live')
    } catch { setStatus('error') }
  }, [])

  useEffect(() => {
    auth.me()
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u) { setUser(u); loadData() } })
      .catch(() => {})
      .finally(() => setBooting(false))
  }, [])

  // Auto-advance slideshow
  useEffect(() => {
    if (!user || !data || paused) return
    const t = setInterval(() => setSlide(s => (s + 1) % SLIDES.length), SLIDE_MS)
    return () => clearInterval(t)
  }, [user, data, paused])

  // Close sidebar when route changes on mobile
  useEffect(() => { setSidebar(false) }, [slide])

  const goToSlide = (idx) => {
    setSlide(idx)
    setPaused(true)
    clearTimeout(pauseTimer.current)
    pauseTimer.current = setTimeout(() => setPaused(false), 30000)
  }

  const togglePause = () => {
    if (paused) {
      setPaused(false)
      clearTimeout(pauseTimer.current)
    } else {
      setPaused(true)
    }
  }

  const handleLogin = async (username, password) => {
    const r = await auth.login(username, password)
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || 'Incorrect credentials')
    setUser(j)
    await loadData()
  }

  const handleLogout = async () => {
    await auth.logout().catch(() => {})
    setUser(null)
    setData(null)
    setStatus('loading')
  }

  const handleHistDate = async (date) => {
    setHistDate(date || null)
    await loadData(date || undefined)
  }

  if (booting) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg font-sans">
        <div className="text-muted text-sm font-semibold">Loading Kifiya Dashboard…</div>
      </div>
    )
  }

  if (!user) return <LoginOverlay onLogin={handleLogin} />

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-bg">
      <Sidebar
        slides={SLIDES}
        current={slide}
        onNav={goToSlide}
        user={user}
        onLogout={handleLogout}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebar(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          data={data}
          status={status}
          paused={paused}
          histDate={histDate}
          onTogglePause={togglePause}
          onRefresh={() => loadData(histDate || undefined)}
          onHistDate={handleHistDate}
          onMenuToggle={() => setSidebar(o => !o)}
        />

        <main className="flex-1 relative overflow-hidden">
          {!data && status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 rounded-full border-4 border-border border-t-gold mx-auto mb-3 animate-spin" />
                <p className="text-muted text-sm font-semibold">Fetching latest snapshot…</p>
              </div>
            </div>
          )}
          {!data && status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center max-w-sm">
                <div className="w-12 h-12 rounded-full bg-bg flex items-center justify-center mx-auto mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B7C93" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <p className="text-navy font-bold text-sm mb-1">No snapshot available yet</p>
                <p className="text-muted text-xs leading-relaxed">
                  Run <code className="font-mono bg-bg px-1.5 py-0.5 rounded text-navy">node snapshot.js</code> on a machine with Business Central access to populate the dashboard.
                </p>
              </div>
            </div>
          )}

          {data && SLIDES.map(({ id, Page }, i) => (
            <div
              key={id}
              className={`absolute inset-0 overflow-y-auto transition-opacity duration-500 ${
                i === slide ? 'opacity-100 z-10 slide-active' : 'opacity-0 z-0 pointer-events-none'
              }`}
            >
              <div className="p-4 md:p-6 pb-10">
                <Page data={data} />
              </div>
            </div>
          ))}
        </main>

        <SlideProgress
          slides={SLIDES}
          current={slide}
          duration={SLIDE_MS}
          paused={paused}
          onDotClick={goToSlide}
        />
      </div>

      <ChatBot data={data} />
    </div>
  )
}
