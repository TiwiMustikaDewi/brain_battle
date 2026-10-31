import { fmtScore } from '../lib/score'
import type { Homegroup, WagerResult } from '../lib/types'

/** Every homegroup's wager on a final question, unveiled at the reveal. */
export function WagerReveal({ wagers, homegroups, big }: { wagers: WagerResult[]; homegroups: Homegroup[]; big?: boolean }) {
  const placed = homegroups
    .map((h) => ({ hg: h, w: wagers.find((w) => w.homegroup_id === h.id) }))
    .sort((a, b) => (b.w?.amount ?? -1) - (a.w?.amount ?? -1))

  return (
    <div className={`grid gap-2 ${big ? 'sm:grid-cols-2 lg:gap-3' : ''}`}>
      {placed.map(({ hg, w }, i) => {
        const amount = w?.amount ?? 0
        const outcome =
          w?.result === 'correct' ? { text: `+${fmtScore(amount)}`, tone: 'text-emerald-400' }
          : w?.result === 'wrong' ? { text: `−${fmtScore(amount)}`, tone: 'text-rose-400' }
          : amount > 0 ? { text: 'aman (0)', tone: 'text-muted' }
          : { text: 'lewati', tone: 'text-muted' }
        return (
          <div
            key={hg.id}
            className={`animate-pop flex items-center gap-3 rounded-xl bg-panel-2/80 ${big ? 'px-4 py-3 lg:text-2xl' : 'px-3 py-2 text-sm'}`}
            style={{ animationDelay: `${i * 90}ms`, animationFillMode: 'backwards' }}
          >
            <span className="size-3 shrink-0 rounded-full" style={{ background: hg.color }} />
            <span className="flex-1 truncate font-semibold">{hg.name}</span>
            <span className="text-muted tabular-nums">💰 {fmtScore(amount)}</span>
            <span className={`w-24 text-right font-display font-extrabold tabular-nums ${outcome.tone}`}>{outcome.text}</span>
          </div>
        )
      })}
    </div>
  )
}
