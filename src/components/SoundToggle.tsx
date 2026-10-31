import { useSoundControl } from '../hooks/useGameSounds'

/** Mute button; before audio is unlocked it doubles as the "enable sound" prompt. */
export function SoundToggle({ prominent = false, className = '' }: { prominent?: boolean; className?: string }) {
  const { muted, ready, toggle, music, toggleMusic } = useSoundControl()
  if (!ready && prominent) {
    return (
      <button type="button" className={`animate-pulse rounded-xl bg-volt px-4 py-2 font-semibold text-ink ${className}`}>
        🔊 Klik untuk aktifkan suara
      </button>
    )
  }
  const btn = 'rounded-lg border border-sky/30 bg-panel-2/80 px-2.5 py-1.5 text-sm transition hover:border-volt'
  return (
    <div className={`flex gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={toggleMusic}
        aria-label={music ? 'Matikan musik latar' : 'Nyalakan musik latar'}
        aria-pressed={music}
        className={`${btn} ${music && !muted ? '' : 'opacity-40'}`}
      >
        🎵
      </button>
      <button type="button" onClick={toggle} aria-label={muted ? 'Nyalakan suara' : 'Matikan suara'} className={btn}>
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  )
}
