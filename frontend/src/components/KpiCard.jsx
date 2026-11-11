export default function KpiCard({ label, value, sub, trend, accent }) {
  const trendColorClass = trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-muted'
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''

  return (
    <div className="bg-white rounded-2xl p-5 border border-border flex flex-col gap-1 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className="text-2xl font-extrabold leading-tight text-ink" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs font-semibold ${sub ? trendColorClass : ''}`}>
          {arrow && <span className="mr-0.5">{arrow}</span>}{sub}
        </p>
      )}
    </div>
  )
}
