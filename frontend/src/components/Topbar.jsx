import { useState, useEffect, useRef } from 'react'
import { snapshots } from '../lib/api.js'
import { fmtDate } from '../lib/fmt.js'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Topbar({ data, status, paused, histDate, onTogglePause, onRefresh, onHistDate, onMenuToggle }) {
  const [dates, setDates]       = useState([])
  const [pickerOpen, setPicker] = useState(false)
  const [selYear, setSelYear]   = useState(null)
  const pickerRef               = useRef(null)

  useEffect(() => {
    snapshots.dates()
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        setDates(d)
        if (d.length) setSelYear(new Date(d[0] + 'T12:00:00').getFullYear())
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handler = e => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPicker(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const statusColor = status === 'live' ? '#2EBD85' : status === 'loading' ? '#EB7D23' : '#E5544B'
  const statusLabel = histDate ? `Snapshot · ${fmtDate(histDate)}` : status === 'live' ? 'Live' : status === 'loading' ? 'Loading…' : 'No Data'

  // Build year → month → [dates] index
  const byYear = dates.reduce((acc, d) => {
    const dt = new Date(d + 'T12:00:00')
    const y  = dt.getFullYear()
    const m  = dt.getMonth()
    if (!acc[y]) acc[y] = {}
    if (!acc[y][m]) acc[y][m] = []
    acc[y][m].push(d)
    return acc
  }, {})
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a)

  const pickMonth = (year, month) => {
    const datesInMonth = byYear[year]?.[month] || []
    if (!datesInMonth.length) return
    const latest = datesInMonth[0] // dates are sorted latest-first from API
    onHistDate(latest === dates[0] ? null : latest)
    setPicker(false)
  }

  return (
    <header className="flex-shrink-0 flex items-center gap-2 md:gap-3 px-3 md:px-6 bg-white border-b border-border h-14 shadow-sm z-30">

      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 rounded-lg hover:bg-bg text-muted hover:text-navy transition-colors flex-shrink-0"
        aria-label="Toggle menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Status dot + label */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
        <span className="text-xs font-bold text-muted hidden sm:block truncate">{statusLabel}</span>
        {data?.asOf && !histDate && (
          <span className="text-[11px] text-muted/50 font-medium hidden lg:block">· as of {data.asOf}</span>
        )}
      </div>

      {/* Period picker */}
      <div className="flex items-center gap-1.5 flex-shrink-0" ref={pickerRef}>

        {/* Latest pill */}
        <button
          onClick={() => { onHistDate(null); setPicker(false) }}
          className="text-xs font-bold px-3 py-1.5 rounded-xl border transition-all"
          style={!histDate
            ? { background: '#02404F', color: '#fff', borderColor: '#02404F' }
            : { borderColor: '#E3E9F2', color: '#6B7C93' }}
        >
          Latest
        </button>

        {/* History dropdown */}
        <div className="relative">
          <button
            onClick={() => setPicker(o => !o)}
            className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-xl border transition-all"
            style={pickerOpen
              ? { background: '#F4F6FA', borderColor: '#02404F', color: '#02404F' }
              : { borderColor: '#E3E9F2', color: '#6B7C93' }}
            title="View historical snapshots"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span className="hidden sm:inline">History</span>
          </button>

          {pickerOpen && (
            <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl border border-border shadow-xl z-50 overflow-hidden" style={{ width: 300 }}>

              {/* Date input */}
              <div className="px-4 pt-4 pb-3 border-b border-border">
                <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">Jump to date</p>
                <input
                  type="date"
                  className="w-full text-xs border border-border rounded-xl px-3 py-2 text-navy font-medium outline-none focus:border-navy bg-bg"
                  value={histDate || ''}
                  onChange={e => { if (e.target.value) { onHistDate(e.target.value); setPicker(false) } }}
                />
              </div>

              {/* Year tabs */}
              {years.length > 0 && (
                <div className="px-4 pt-3 pb-2">
                  <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">Browse by month</p>
                  <div className="flex gap-1.5 mb-3">
                    {years.map(y => (
                      <button
                        key={y}
                        onClick={() => setSelYear(y)}
                        className="flex-1 text-xs font-bold py-1.5 rounded-xl border transition-all"
                        style={selYear === y
                          ? { background: '#02404F', color: '#fff', borderColor: '#02404F' }
                          : { borderColor: '#E3E9F2', color: '#6B7C93' }}
                      >
                        {y}
                      </button>
                    ))}
                  </div>

                  {/* Month grid */}
                  <div className="grid grid-cols-4 gap-1.5 pb-3">
                    {MONTHS.map((name, m) => {
                      const datesInMonth = byYear[selYear]?.[m] || []
                      const hasData = datesInMonth.length > 0
                      const latest  = datesInMonth[0]
                      const active  = histDate && latest === histDate
                      return (
                        <button
                          key={m}
                          disabled={!hasData}
                          onClick={() => pickMonth(selYear, m)}
                          className="text-xs font-bold py-2 rounded-xl border transition-all"
                          style={active
                            ? { background: '#EB7D23', color: '#fff', borderColor: '#EB7D23' }
                            : hasData
                              ? { borderColor: '#E3E9F2', color: '#02404F' }
                              : { borderColor: '#F4F6FA', color: '#C8D1DC', cursor: 'default' }}
                        >
                          {name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="px-4 py-2.5 border-t border-border flex items-center gap-2" style={{ background: '#02404F08' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#02404F" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <p className="text-[10px] font-semibold" style={{ color: '#02404F' }}>Applies to all dashboard pages</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onRefresh}
          title={histDate ? 'Reload snapshot' : 'Sync from Business Central'}
          className="p-2 rounded-xl hover:bg-bg text-muted hover:text-navy transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>

        <button
          onClick={onTogglePause}
          title={paused ? 'Resume slideshow' : 'Pause slideshow'}
          className="hidden sm:flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all"
          style={paused
            ? { borderColor: '#EB7D23', color: '#EB7D23', background: 'rgba(235,125,35,.08)' }
            : { borderColor: '#E3E9F2', color: '#6B7C93', background: 'white' }}
        >
          {paused
            ? <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            : <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          }
          <span className="hidden md:inline">{paused ? 'Resume' : 'Pause'}</span>
        </button>
      </div>
    </header>
  )
}
