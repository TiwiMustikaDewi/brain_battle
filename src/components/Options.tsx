import { OPTION_STYLE } from '../lib/options'
import { OPTION_LETTERS } from '../lib/types'

/**
 * One answer option. `state` drives the look:
 *   idle → tappable, chosen → my pick, correct/wrong → after reveal, faded → not relevant.
 */
export function OptionTile({
  index,
  text,
  state = 'idle',
  onClick,
  disabled,
  big,
  count,
  total,
}: {
  index: number
  text: string
  state?: 'idle' | 'chosen' | 'correct' | 'wrong' | 'faded'
  onClick?: () => void
  disabled?: boolean
  big?: boolean
  count?: number
  total?: number
}) {
  const s = OPTION_STYLE[index]
  const faded = state === 'faded'
  const tone =
    state === 'correct' ? 'bg-emerald-500 ring-4 ring-emerald-200 ring-offset-2 ring-offset-ink shadow-[0_0_36px_rgb(16_185_129/0.55)] animate-pop'
    : state === 'wrong' ? 'bg-rose-600 ring-4 ring-rose-300/70 ring-offset-2 ring-offset-ink animate-shake'
    : s.bg
  const pct = total ? Math.round(((count ?? 0) / total) * 100) : 0
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`relative flex w-full items-center gap-3 overflow-hidden rounded-2xl text-left font-semibold text-white shadow-lg transition
        ${tone} ${big ? 'min-h-16 px-4 py-3 text-lg lg:h-full lg:min-h-24 lg:gap-5 lg:rounded-3xl lg:px-8 lg:py-5 lg:text-[2.6rem]' : 'min-h-16 px-4 py-3 text-lg'}
        ${onClick && !disabled ? 'active:scale-[0.97] hover:-translate-y-1 hover:brightness-110 hover:shadow-2xl' : ''}
        ${faded ? 'opacity-30 saturate-50' : ''}
        ${state === 'chosen' ? 'ring-4 ring-white ring-offset-2 ring-offset-ink' : ''}`}
    >
      {count !== undefined && (
        <span className="absolute inset-y-0 left-0 bg-black/25 transition-[width] duration-700" style={{ width: `${pct}%` }} />
      )}
      <span className={`relative flex shrink-0 items-center justify-center rounded-xl bg-black/20 font-display ${big ? 'size-10 text-xl lg:size-20 lg:rounded-2xl lg:text-4xl' : 'size-10 text-xl'}`}>
        <span aria-hidden className="text-[0.7em]">{s.glyph}</span>
        <span className="sr-only">{OPTION_LETTERS[index]}</span>
      </span>
      <span className="relative flex-1 leading-snug">{text}</span>
      {count !== undefined && <span className="relative font-display tabular-nums">{count}</span>}
      {state === 'correct' && (
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-xl font-black text-emerald-600" aria-label="benar">✓</span>
      )}
      {state === 'wrong' && (
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-xl font-black text-rose-600" aria-label="salah">✕</span>
      )}
    </button>
  )
}
