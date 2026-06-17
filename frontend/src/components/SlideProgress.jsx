import { useEffect, useState } from 'react'

export default function SlideProgress({ slides, current, duration, paused, onDotClick }) {
  const [animKey, setAnimKey] = useState(0)

  useEffect(() => { setAnimKey(k => k + 1) }, [current, paused])

  return (
    <div className="flex-shrink-0 border-t bg-white px-6 py-2.5 flex items-center gap-4" style={{ borderColor: '#E3E9F2' }}>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#E3E9F2' }}>
        {!paused && (
          <div
            key={animKey}
            className="progress-bar-fill rounded-full"
            style={{ '--dur': `${duration / 1000}s` }}
          />
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onDotClick(i)}
            title={s.label}
            className="rounded-full transition-all duration-300 hover:opacity-80"
            style={{
              width: i === current ? 20 : 8,
              height: 8,
              background: i === current ? '#EB7D23' : '#E3E9F2',
            }}
          />
        ))}
      </div>
    </div>
  )
}
