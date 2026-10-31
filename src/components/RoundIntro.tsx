import { useEffect, useState } from 'react'
import { sfx } from '../lib/sound'
import type { Round } from '../lib/types'

const INTRO: Partial<Record<Round, { kicker: string; title: string; rules: string[]; emoji: string }>> = {
  quickfire: {
    kicker: 'Babak 1',
    title: 'Quick Fire',
    emoji: '⚡',
    rules: ['Semua anggota menjawab di HP', '+100 per jawaban benar', 'Skor HG = rata-rata anggota'],
  },
  buzzer: {
    kicker: 'Babak 2',
    title: 'Battle Buzzer',
    emoji: '🔔',
    rules: ['1 buzzer per homegroup', 'Tercepat menjawab lisan', 'Benar +100 · Salah −50'],
  },
  final: {
    kicker: 'Babak 3',
    title: 'Final Showdown',
    emoji: '💰',
    rules: ['Pasang taruhan sebelum soal', 'Benar + taruhan · Salah − taruhan', 'Taruhan 0 = lewati'],
  },
  results: {
    kicker: 'Pengumuman',
    title: 'Hasil Akhir',
    emoji: '🏆',
    rules: ['Siapa juaranya…?'],
  },
}

const COUNT_FROM = 3
const STEP_MS = 900

/** Full-screen bridge between rounds: title sweep, rules, then a 3-2-1 countdown. Tap to skip. */
export function RoundIntro({ round, onDone, big }: { round: Round; onDone: () => void; big?: boolean }) {
  const info = INTRO[round]!
  const isResults = round === 'results'
  // stage 0: title in · 1..COUNT_FROM: countdown · COUNT_FROM+1: "MULAI!" · then out
  const [stage, setStage] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    if (isResults) {
      at(3200, () => setLeaving(true))
      at(3700, onDone)
    } else {
      const start = 2000
      for (let i = 1; i <= COUNT_FROM; i++) {
        at(start + (i - 1) * STEP_MS, () => {
          setStage(i)
          sfx.tick(i === COUNT_FROM)
        })
      }
      at(start + COUNT_FROM * STEP_MS, () => {
        setStage(COUNT_FROM + 1)
        sfx.open()
      })
      at(start + COUNT_FROM * STEP_MS + 700, () => setLeaving(true))
      at(start + COUNT_FROM * STEP_MS + 1200, onDone)
    }
    return () => timers.forEach(clearTimeout)
  }, [isResults, onDone])

  const count = stage >= 1 && stage <= COUNT_FROM ? COUNT_FROM - stage + 1 : null

  return (
    <div
      role="dialog"
      aria-label={`${info.kicker}: ${info.title}`}
      onClick={() => {
        setLeaving(true)
        setTimeout(onDone, 300)
      }}
      className={`fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-ink/95 text-center transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      {/* Diagonal blue/orange sweeps */}
      <span className="bb-sweep bb-sweep-a" />
      <span className="bb-sweep bb-sweep-b" />
      <span className="bb-sweep bb-sweep-c" />

      <div className="relative flex flex-col items-center px-6">
        <p className={`animate-intro-drop font-display font-black uppercase tracking-[0.3em] text-volt ${big ? 'text-4xl' : 'text-lg'}`}>
          {info.kicker}
        </p>
        <p className={`animate-intro-zoom mt-2 leading-none ${big ? 'text-[9rem]' : 'text-7xl'}`} style={{ animationDelay: '150ms' }}>
          {info.emoji}
        </p>
        <h1
          className={`animate-intro-zoom mt-3 font-display font-black leading-none text-gradient ${big ? 'text-[8rem]' : 'text-5xl'}`}
          style={{ animationDelay: '300ms' }}
        >
          {info.title}
        </h1>
        <ul className={`mt-6 flex flex-wrap justify-center gap-2 ${big ? 'gap-4 text-3xl' : 'text-sm'}`}>
          {info.rules.map((r, i) => (
            <li
              key={r}
              className={`animate-intro-drop rounded-full border border-sky/40 bg-panel-2/80 font-semibold ${big ? 'px-6 py-3' : 'px-3 py-1.5'}`}
              style={{ animationDelay: `${700 + i * 180}ms` }}
            >
              {r}
            </li>
          ))}
        </ul>

        <div className={`mt-8 flex items-center justify-center ${big ? 'h-56' : 'h-28'}`}>
          {count !== null && (
            <span key={count} className={`animate-count font-display font-black tabular-nums text-white ${big ? 'text-[12rem]' : 'text-8xl'}`}>
              {count}
            </span>
          )}
          {stage === COUNT_FROM + 1 && (
            <span className={`animate-count font-display font-black text-volt ${big ? 'text-[9rem]' : 'text-6xl'}`}>MULAI!</span>
          )}
        </div>
      </div>
      <p className={`absolute bottom-4 text-muted ${big ? 'text-xl' : 'text-xs'}`}>ketuk untuk lewati</p>
    </div>
  )
}
