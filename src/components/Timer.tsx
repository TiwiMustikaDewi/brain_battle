import { useNow } from '../hooks/useNow'

/** Countdown to a server-time deadline. */
export function Timer({
  deadline,
  total,
  size = 'md',
}: {
  deadline: string | null
  total: number
  size?: 'md' | 'xl'
}) {
  const now = useNow(200)
  if (!deadline) return null
  const left = Math.max(0, Date.parse(deadline) - now)
  const secs = Math.ceil(left / 1000)
  const pct = Math.min(100, (left / (total * 1000)) * 100)
  const urgent = secs <= 5
  const color = left === 0 ? 'bg-muted' : urgent ? 'bg-rose-500 animate-pulse' : 'bg-gradient-to-r from-sky to-volt'

  return (
    <div className="flex w-full items-center gap-3" role="timer" aria-label={`${secs} detik tersisa`}>
      <div className={`flex-1 overflow-hidden rounded-full bg-panel-2 ${size === 'xl' ? 'h-4' : 'h-2.5'}`}>
        <div className={`h-full rounded-full transition-[width] duration-200 ease-linear ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={`font-display font-extrabold tabular-nums ${size === 'xl' ? 'w-16 text-4xl lg:w-24 lg:text-6xl' : 'w-12 text-2xl'} text-right ${urgent ? 'text-rose-400' : ''}`}
      >
        <span key={urgent ? secs : 'n'} className={`inline-block ${urgent && left > 0 ? 'animate-pop' : ''}`}>{secs}</span>
      </span>
    </div>
  )
}
