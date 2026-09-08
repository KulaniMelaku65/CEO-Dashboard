import { PERIOD_MODES } from '../lib/period.js'

const LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' }

// Shared Monthly / Quarterly / Annually control — Financial Performance and Budget
// Analysis both aggregate the same kind of monthly series, so one toggle + one
// aggregation helper (lib/period.js) covers both instead of duplicating the logic.
export default function PeriodToggle({ value, onChange }) {
  return (
    <div className="flex gap-0.5 bg-bg rounded-xl p-1 border border-border flex-shrink-0">
      {PERIOD_MODES.map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
          style={value === m ? { background: '#02404F', color: '#fff' } : { color: '#6B7C93' }}
        >
          {LABELS[m]}
        </button>
      ))}
    </div>
  )
}
