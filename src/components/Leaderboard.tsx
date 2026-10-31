import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fmtScore, rankHomegroups } from '../lib/score'
import type { Homegroup } from '../lib/types'

export function Leaderboard({
  homegroups,
  highlightId,
  dimIds = [],
  size = 'md',
  showBreakdown,
  fill,
}: {
  homegroups: Homegroup[]
  highlightId?: string | null
  dimIds?: string[]
  size?: 'md' | 'lg' | 'xl'
  showBreakdown?: boolean
  /** Stretch rows to fill the parent's height (projector side panel). */
  fill?: boolean
}) {
  const ranked = rankHomegroups(homegroups)
  const text = { md: 'text-base', lg: 'text-xl', xl: 'text-3xl' }[size]
  const pad = { md: 'py-2 px-3', lg: 'py-3 px-4', xl: 'py-4 px-6' }[size]
  const listRef = useFlip(ranked.map((h) => h.id).join(','))

  return (
    <ol ref={listRef} className={`flex flex-col gap-2 ${fill ? 'h-full' : ''}`}>
      {ranked.map((hg) => (
        <li
          key={hg.id}
          data-flip={hg.id}
          className={`relative flex items-center gap-3 rounded-xl border ${fill ? 'min-h-0 flex-1 lg:gap-4 lg:rounded-2xl lg:text-2xl' : ''} bg-gradient-to-r from-panel-2/90 to-panel/70 backdrop-blur-sm hover:from-sky/25 ${pad} ${text} transition-colors
            ${hg.id === highlightId ? 'border-volt shadow-lg shadow-volt/25' : 'border-transparent'}
            ${dimIds.includes(hg.id) ? 'opacity-35' : ''}`}
        >
          <span className={`w-8 font-display font-extrabold tabular-nums ${hg.rank <= 3 ? 'text-volt' : 'text-muted'}`}>
            {hg.rank <= 3 && hg.total_score > 0 ? ['🥇', '🥈', '🥉'][hg.rank - 1] : hg.rank}
          </span>
          <span className={`shrink-0 rounded-full ${fill ? 'size-5 shadow-[0_0_12px_currentColor]' : 'size-3.5'}`} style={{ background: hg.color, color: hg.color }} />
          <span className="flex-1 truncate font-semibold">{hg.name}</span>
          {showBreakdown && (
            <span className="hidden text-sm text-muted tabular-nums sm:inline">
              QF {fmtScore(hg.quickfire_score)} · BZ {fmtScore(hg.battle_score)}
            </span>
          )}
          <AnimatedScore value={hg.total_score} />
        </li>
      ))}
    </ol>
  )
}

/** Slides rows to their new position when the order changes (FLIP). */
function useFlip(orderKey: string) {
  const ref = useRef<HTMLOListElement>(null)
  const tops = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('[data-flip]') ?? []
    const next = new Map<string, number>()
    for (const el of items) {
      const id = el.dataset.flip!
      const top = el.offsetTop
      next.set(id, top)
      const before = tops.current.get(id)
      if (before === undefined || before === top) continue
      el.style.transition = 'none'
      el.style.transform = `translateY(${before - top}px)`
      el.style.zIndex = before > top ? '1' : ''
      requestAnimationFrame(() => {
        el.style.transition = 'transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)'
        el.style.transform = ''
      })
    }
    tops.current = next
  }, [orderKey])
  return ref
}

/** Counts up/down to the new score and floats the change beside it. */
function AnimatedScore({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const [delta, setDelta] = useState<{ n: number; key: number } | null>(null)
  const from = useRef(value)

  useEffect(() => {
    const start = from.current
    if (start === value) return
    from.current = value
    setDelta({ n: value - start, key: Date.now() })
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 800)
      const eased = 1 - (1 - k) ** 3
      setShown(k === 1 ? value : start + (value - start) * eased)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const hide = setTimeout(() => setDelta(null), 1800)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(hide)
      setShown(value)
    }
  }, [value])

  const rounded = Number.isInteger(value) ? Math.round(shown) : Math.round(shown * 100) / 100
  return (
    <span className="relative font-display font-extrabold tabular-nums">
      {fmtScore(rounded)}
      {delta && (
        <span
          key={delta.key}
          className={`animate-float-up pointer-events-none absolute -top-1 right-0 text-[0.8em] ${delta.n > 0 ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {delta.n > 0 ? '+' : ''}
          {fmtScore(Math.round(delta.n * 100) / 100)}
        </span>
      )}
    </span>
  )
}
