export default function KpiCard({ label, value, sub, trend, accent }) {
  const trendColor = trend === 'up' ? '#2EBD85' : trend === 'down' ? '#E5544B' : 'rgba(255,255,255,0.55)'
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''

  return (
    <div className="bg-white rounded-2xl p-5 border flex flex-col gap-1 shadow-sm" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</p>
      <p className="text-2xl font-extrabold leading-tight" style={{ color: accent || '#FFFFFF' }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs font-semibold" style={{ color: trend ? trendColor : 'rgba(255,255,255,0.55)' }}>
          {arrow && <span className="mr-0.5">{arrow}</span>}{sub}
        </p>
      )}
    </div>
  )
}
