import { useEffect, useState } from 'react'
import { kpi } from '../lib/api.js'
import { NAVY, ROW_BG, ragColor, ragLabel, currentPeriod } from './kpi/ragColors.js'

function StatusDot({ status, size = 10 }) {
  return <span className="inline-block rounded-full flex-shrink-0" style={{ width: size, height: size, background: ragColor(status) }} />
}

function DepartmentCard({ dept, onClick }) {
  const counts = dept.rows.reduce((acc, r) => {
    const s = r.submission?.rag_status ?? 'null'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border text-left p-4 transition-transform hover:-translate-y-0.5"
      style={{ background: ROW_BG.even, borderColor: 'var(--tbl-line)' }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-ink font-bold text-sm truncate">{dept.department.name}</span>
        <StatusDot status={dept.status} size={14} />
      </div>
      <p className="text-muted text-[10px] font-bold uppercase tracking-wider mb-2">{dept.department.accountable_exec}</p>
      <div className="flex items-center gap-3 text-[11px] font-semibold text-muted">
        <span className="flex items-center gap-1"><StatusDot status="green" /> {counts.green || 0}</span>
        <span className="flex items-center gap-1"><StatusDot status="amber" /> {counts.amber || 0}</span>
        <span className="flex items-center gap-1"><StatusDot status="red" /> {counts.red || 0}</span>
        <span className="flex items-center gap-1"><StatusDot status={null} /> {counts.null || 0}</span>
      </div>
    </button>
  )
}

export default function KpiOverview({ onNavigate }) {
  const [period] = useState(currentPeriod())
  const [overview, setOverview] = useState(null)
  const [reminders, setReminders] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    kpi.overview(period).then(r => r.ok ? r.json() : Promise.reject()).then(setOverview).catch(() => setError('Could not load the KPI overview.'))
    kpi.reminders(period).then(r => r.ok ? r.json() : Promise.reject()).then(setReminders).catch(() => {})
  }, [period])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-ink mb-0.5">Group KPI Dashboard</h2>
        <p className="text-xs text-muted font-medium">
          Red / Amber / Green status across all 12 departments — {period}. Click a department to see its KPIs.
        </p>
      </div>

      {reminders && (
        <div
          className="rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ background: reminders.overdue ? 'rgba(229,84,75,.12)' : 'rgba(235,125,35,.1)', borderColor: reminders.overdue ? '#D32F2F' : '#EB7D23' }}
        >
          <p className="text-xs font-bold text-ink">
            {reminders.overdue
              ? `Submission deadline (WD5, ${reminders.deadline}) has passed`
              : `Submission deadline: ${reminders.deadline} (${reminders.daysLeft} day${reminders.daysLeft === 1 ? '' : 's'} left)`}
            {reminders.departmentsMissing.length > 0 && ` — ${reminders.departmentsMissing.length} department(s) haven't submitted yet`}
          </p>
          {reminders.departmentsMissing.length > 0 && (
            <p className="text-[11px] text-muted">{reminders.departmentsMissing.map(d => d.name).join(', ')}</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {overview.departments.map(d => (
            <DepartmentCard key={d.departmentId} dept={d} onClick={() => onNavigate?.(d.departmentId)} />
          ))}
        </div>
      )}
    </div>
  )
}
