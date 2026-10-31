import { useEffect, useState, type MouseEvent } from 'react'
import { sfx } from '../lib/sound'

const COLORS = ['#ff8a1f', '#ffb347', '#2f8bff', '#6cc4ff', '#13b5c9', '#ffffff', '#34d399']

function makeConfetti(n: number, seed: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${seed}-${i}`,
    left: Math.random() * 100,
    dx: (Math.random() - 0.5) * 240,
    rot: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720),
    delay: Math.random() * 0.5,
    dur: 2 + Math.random() * 1.4,
    color: COLORS[i % COLORS.length],
    w: 6 + Math.random() * 8,
  }))
}

/**
 * Full-screen win pop-up with confetti. Tap the card for another burst; tap
 * outside (or wait) to close.
 */
export function Celebrate({
  emoji = '🎉',
  title,
  subtitle,
  onClose,
  autoCloseMs = 3500,
}: {
  emoji?: string
  title: string
  subtitle?: string
  onClose: () => void
  autoCloseMs?: number
}) {
  const [bursts, setBursts] = useState(() => [makeConfetti(60, 0)])
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    navigator.vibrate?.([60, 40, 60, 40, 120])
    const t = setTimeout(onClose, autoCloseMs)
    return () => clearTimeout(t)
  }, [onClose, autoCloseMs])

  function burst(e: MouseEvent) {
    e.stopPropagation()
    sfx.correct()
    navigator.vibrate?.(40)
    setPulse((n) => n + 1)
    setBursts((b) => [...b.slice(-2), makeConfetti(40, Date.now())])
  }

  return (
    <div
      role="dialog"
      aria-live="assertive"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink/70 px-6 backdrop-blur-sm"
    >
      {bursts.flat().map((c) => (
        <span
          key={c.id}
          className="bb-confetti"
          style={{
            left: `${c.left}%`,
            width: c.w,
            background: c.color,
            ['--dx' as string]: `${c.dx}px`,
            ['--rot' as string]: `${c.rot}deg`,
            ['--delay' as string]: `${c.delay}s`,
            ['--dur' as string]: `${c.dur}s`,
          }}
        />
      ))}
      <button
        type="button"
        data-nofx
        onClick={burst}
        className="animate-celebrate relative w-full max-w-sm rounded-3xl border-2 border-volt bg-gradient-to-br from-panel-2 via-panel to-sky/40 p-7 text-center shadow-2xl shadow-volt/30"
      >
        <span key={pulse} className="animate-pop inline-block text-7xl">{emoji}</span>
        <p className="mt-2 font-display text-4xl font-black text-gradient">{title}</p>
        {subtitle && <p className="mt-2 text-xl font-bold text-emerald-300">{subtitle}</p>}
        <p className="mt-4 text-xs text-muted">Ketuk kartu untuk konfeti lagi · ketuk di luar untuk menutup</p>
      </button>
    </div>
  )
}
