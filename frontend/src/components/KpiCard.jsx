export default function KpiCard({ label, value, sub, trend, accent }) {
  const trendColor = trend === 'up' ? '#2EBD85' : trend === 'down' ? '#E5544B' : '#6B7C93'
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''

  return (
    <div className="bg-white rounded-2xl p-5 border flex flex-col gap-1 shadow-sm" style={{ borderColor: '#E3E9F2' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#6B7C93' }}>{label}</p>
      <p className="text-2xl font-extrabold leading-tight" style={{ color: accent || '#02404F' }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs font-semibold" style={{ color: trend ? trendColor : '#6B7C93' }}>
          {arrow && <span className="mr-0.5">{arrow}</span>}{sub}
        </p>
      )}
    </div>
  )
}
