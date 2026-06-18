const ICONS = {
  overview:    <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  financial:   <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>,
  lending:     <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
  collections: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
  hr:          <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  risk:        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  reports:     <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
}

export default function Sidebar({ slides, current, onNav, user, onLogout, mobileOpen, onMobileClose }) {
  const initials = (user?.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const handleNav = (i) => {
    onNav(i)
    onMobileClose?.()
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'flex flex-col h-screen overflow-hidden flex-shrink-0 transition-transform duration-300',
          // Mobile: fixed overlay, slides in/out
          'fixed top-0 left-0 z-50 lg:relative lg:z-auto lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
        style={{ background: '#02404F', width: 224 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10 flex-shrink-0">
          <img src="/logo.jfif" alt="Kifiya" className="w-9 h-9 rounded-lg object-contain bg-white p-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-white font-extrabold text-sm leading-tight tracking-tight">
              KIFIYA<span style={{ color: '#EB7D23' }}>.</span>
            </div>
            <div className="text-white/40 text-[9px] uppercase tracking-widest mt-0.5">Financial Technology</div>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={onMobileClose}
            className="lg:hidden text-white/40 hover:text-white p-1 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2">
          <p className="px-4 pt-3 pb-1 text-[9px] uppercase tracking-widest text-white/30 font-bold">Analytics</p>
          <ul className="space-y-0.5 px-2">
            {slides.map(({ id, label }, i) => {
              const active = i === current
              return (
                <li key={id}>
                  <button
                    onClick={() => handleNav(i)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-[12.5px] font-semibold transition-all duration-150 ${
                      active ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                    style={active
                      ? { background: 'rgba(235,125,35,.2)', borderLeft: '3px solid #EB7D23' }
                      : { borderLeft: '3px solid transparent' }}
                  >
                    <svg
                      width="16" height="16" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ opacity: active ? 1 : 0.7, flexShrink: 0 }}
                    >
                      {ICONS[id]}
                    </svg>
                    <span className="truncate">{label}</span>
                    {active && (
                      <span className="ml-auto text-[9px] font-extrabold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(235,125,35,.6)', color: '#fff' }}>
                        LIVE
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* User */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-t border-white/10 flex-shrink-0">
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-xs text-white flex-shrink-0" style={{ background: '#EB7D23' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/85 text-xs font-bold truncate">{user?.name}</p>
            <p className="text-white/40 text-[10px] truncate">{user?.title || user?.role}</p>
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            className="text-white/30 hover:text-white text-lg leading-none transition-colors p-1 rounded flex-shrink-0"
          >
            ⏻
          </button>
        </div>
      </aside>
    </>
  )
}
