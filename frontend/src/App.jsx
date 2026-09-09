import { useState, useEffect, useCallback, useMemo } from 'react'
import { auth, snapshots } from './lib/api.js'
import { PeopleOpsFiltersProvider } from './context/PeopleOpsFilters.jsx'
import { PAGE_REGISTRY } from './lib/pages.js'
import LoginOverlay from './components/LoginOverlay.jsx'
import ChangePasswordScreen from './components/ChangePasswordScreen.jsx'
import Sidebar from './components/Sidebar.jsx'
import Topbar from './components/Topbar.jsx'
import SlideProgress from './components/SlideProgress.jsx'
import ChatBot from './components/ChatBot.jsx'
import Overview from './pages/Overview.jsx'
import Financial from './pages/Financial.jsx'
import BudgetAnalysis from './pages/BudgetAnalysis.jsx'
import LoanOps from './pages/LoanOps.jsx'
import Collections from './pages/Collections.jsx'
import HR from './pages/HR.jsx'
import PeopleHRSummary from './pages/PeopleHRSummary.jsx'
import EmployeeCost from './pages/EmployeeCost.jsx'
import EmployeeCostDetail from './pages/EmployeeCostDetail.jsx'
import EmployeeCostVariance from './pages/EmployeeCostVariance.jsx'
import HRPageReview from './pages/HRPageReview.jsx'
import DepartmentOverrides from './pages/DepartmentOverrides.jsx'
import Risk from './pages/Risk.jsx'
import BalanceSheet from './pages/BalanceSheet.jsx'
import CashFlow from './pages/CashFlow.jsx'
import Tax from './pages/Tax.jsx'
import AdminUsers from './pages/AdminUsers.jsx'

// PAGE_REGISTRY (lib/pages.js) holds every page's id/label/parentId — this just pairs
// each with its actual component. Kept as two separate pieces (rather than one combined
// list here) so the Admin page's per-user toggles can import the metadata alone without
// pulling in every page component (and without a circular import back into this file).
const PAGE_COMPONENTS = {
  overview: Overview, financial: Financial, budget: BudgetAnalysis, collections: Collections,
  'balance-sheet': BalanceSheet, cashflow: CashFlow, tax: Tax, lending: LoanOps, risk: Risk,
  hr: HR, 'hr-summary': PeopleHRSummary, 'employee-cost': EmployeeCost,
  'employee-cost-detail': EmployeeCostDetail, 'employee-cost-variance': EmployeeCostVariance,
  'hr-page-review': HRPageReview, 'department-overrides': DepartmentOverrides,
}

export const ALL_SLIDES = PAGE_REGISTRY.map(p => ({ ...p, Page: PAGE_COMPONENTS[p.id] }))

// Admin access to this one is governed by the is_admin flag, not a per-page grant, so
// it's appended separately rather than living in the shared PAGE_REGISTRY.
const ADMIN_SLIDE = { id: 'admin-users', label: 'Admin — Users & Access', Page: AdminUsers }

const SLIDE_MS = 12000

export default function App() {
  const [user, setUser]             = useState(null)
  const [data, setData]             = useState(null)
  const [slide, setSlide]           = useState(0)
  const [status, setStatus]         = useState('loading')
  const [histDate, setHistDate]     = useState(null)
  const [booting, setBooting]       = useState(true)
  const [sidebarOpen, setSidebar]   = useState(false)

  // Per-user sidebar — replaces the old single hardcoded VISIBLE_IDS global. A user with
  // no page grants at all sees an empty list (handled below) rather than crashing.
  const slides = useMemo(() => {
    if (!user) return []
    const granted = ALL_SLIDES.filter(s => user.pageIds?.includes(s.id))
    return user.isAdmin ? [...granted, ADMIN_SLIDE] : granted
  }, [user])

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

  // Close sidebar when route changes on mobile
  useEffect(() => { setSidebar(false) }, [slide])

  // Keep the active slide in range if the user's own permission set ever shrinks
  // (e.g. an admin revokes access to the page currently being viewed).
  useEffect(() => {
    if (slide >= slides.length && slides.length > 0) setSlide(0)
  }, [slides, slide])

  // No auto-advance — stay on whatever page is selected until the user navigates away.
  const goToSlide = (idx) => setSlide(idx)

  const handleLogin = async (username, password) => {
    const r = await auth.login(username, password)
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || 'Incorrect credentials')
    setUser(j)
    setSlide(0)
    if (!j.mustChangePassword) await loadData()
  }

  const handleLogout = async () => {
    await auth.logout().catch(() => {})
    setUser(null)
    setData(null)
    setStatus('loading')
  }

  const handlePasswordChanged = async () => {
    setUser(u => ({ ...u, mustChangePassword: false }))
    await loadData()
  }

  const handleHistDate = async (date) => {
    setHistDate(date || null)
    await loadData(date || undefined)
  }

  const handleRefresh = async () => {
    if (!histDate) {
      setStatus('loading')
      try { await snapshots.sync() } catch { /* may still reload last snapshot */ }
    }
    await loadData(histDate || undefined)
  }

  if (booting) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg font-sans">
        <div className="text-muted text-sm font-semibold">Loading Kifiya Dashboard…</div>
      </div>
    )
  }

  if (!user) return <LoginOverlay onLogin={handleLogin} />

  if (user.mustChangePassword) {
    return <ChangePasswordScreen onDone={handlePasswordChanged} onLogout={handleLogout} />
  }

  return (
    <div className="dark-app flex h-screen overflow-hidden font-sans bg-bg">
      <Sidebar
        slides={slides}
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
          histDate={histDate}
          onRefresh={handleRefresh}
          onHistDate={handleHistDate}
          onMenuToggle={() => setSidebar(o => !o)}
        />

        <main className="flex-1 relative overflow-hidden">
          {slides.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center max-w-sm">
                <p className="text-navy font-bold text-sm mb-1">No pages available yet</p>
                <p className="text-muted text-xs leading-relaxed">
                  Your account doesn't have access to any dashboard pages yet — ask an admin to grant you access.
                </p>
              </div>
            </div>
          )}
          {slides.length > 0 && !data && status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 rounded-full border-4 border-border border-t-gold mx-auto mb-3 animate-spin" />
                <p className="text-muted text-sm font-semibold">Fetching latest snapshot…</p>
              </div>
            </div>
          )}
          {slides.length > 0 && !data && status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center max-w-sm">
                <div className="w-12 h-12 rounded-full bg-bg flex items-center justify-center mx-auto mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B7C93" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <p className="text-navy font-bold text-sm mb-1">No snapshot available yet</p>
                <p className="text-muted text-xs leading-relaxed">
                  The server pulls data from Business Central automatically. Use the refresh button above to sync now, or wait for the next scheduled run.
                </p>
              </div>
            </div>
          )}

          {data && slides.length > 0 && (
            <PeopleOpsFiltersProvider>
              {slides.map(({ id, Page }, i) => (
                <div
                  key={id}
                  className={`absolute inset-0 overflow-y-auto transition-opacity duration-500 ${
                    i === slide ? 'opacity-100 z-10 slide-active' : 'opacity-0 z-0 pointer-events-none'
                  }`}
                >
                  <div className="p-4 md:p-6 pb-10">
                    <Page data={data} onDataRefresh={() => loadData(histDate || undefined)} currentUserId={user.id} />
                  </div>
                </div>
              ))}
            </PeopleOpsFiltersProvider>
          )}
        </main>

        <SlideProgress
          slides={slides}
          current={slide}
          duration={SLIDE_MS}
          paused
          onDotClick={goToSlide}
        />
      </div>

      <ChatBot data={data} pageId={slides[slide]?.id} pageLabel={slides[slide]?.label} />
    </div>
  )
}
