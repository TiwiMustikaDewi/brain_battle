import { useEffect, useRef, useState } from 'react'
import { isMusicOn, isMuted, setMusicDefault, setMusicMood, setMusicOn, setMuted, sfx, soundReady, unlockOnFirstGesture } from '../lib/sound'
import type { GameSession } from '../lib/types'

/**
 * Plays cues on state transitions: question shown, buzzer open/won, judgement,
 * round intro and final results. `quickfireReveal` is off on phones, which play
 * their own right/wrong cue based on the participant's answer.
 */
export function useGameSounds(session: GameSession | null, { quickfireReveal = true } = {}) {
  const prev = useRef<GameSession | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = session
    if (!session || !p) return
    if (session.round !== p.round) {
      if (session.round === 'results') sfx.fanfare()
      else if (session.round !== 'lobby') sfx.whoosh()
      return
    }
    if (session.current_question_id && session.current_question_id !== p.current_question_id && session.phase === 'question') sfx.question()
    if (session.phase === 'wager' && (p.phase !== 'wager' || session.current_question_id !== p.current_question_id)) sfx.whoosh()
    if (session.phase === 'question' && p.phase === 'wager') sfx.question()
    if (session.buzzer_state === 'open' && p.buzzer_state !== 'open') sfx.open()
    if (session.buzzer_state === 'locked' && p.buzzer_state !== 'locked') sfx.buzz()
    const j = session.last_judgement
    if (j && JSON.stringify(j) !== JSON.stringify(p.last_judgement)) {
      if (j.result === 'correct') sfx.correct()
      if (j.result === 'wrong') sfx.wrong()
    }
    if (quickfireReveal && session.round === 'quickfire' && session.phase === 'reveal' && p.phase !== 'reveal') sfx.correct()
  }, [session, quickfireReveal])
}

/**
 * Drives the background music from game state: upbeat in the lobby and between
 * questions, faster while a timer runs, silent on the results podium (fanfare).
 * `defaultOn` applies only until the user toggles music on this device.
 */
export function useBackgroundMusic(session: GameSession | null, defaultOn: boolean) {
  // During render (not an effect) so the music toggle's first render sees the default.
  useState(() => setMusicDefault(defaultOn))
  useEffect(() => () => setMusicMood('off'), [])
  const mood = !session || session.round === 'results' || session.status === 'paused'
    ? 'off'
    : session.phase === 'wager' || (session.phase === 'question' && (session.round === 'quickfire' || session.buzzer_state === 'open'))
      ? 'tense'
      : 'calm'
  useEffect(() => setMusicMood(mood), [mood])
}

/** Mute state plus whether the browser has unlocked audio yet. */
export function useSoundControl() {
  const [muted, setMutedState] = useState(isMuted)
  const [ready, setReady] = useState(soundReady)
  const [music, setMusicState] = useState(isMusicOn)
  useEffect(() => {
    const unlock = unlockOnFirstGesture()
    const onGesture = () => setReady(true)
    window.addEventListener('pointerdown', onGesture, { once: true })
    window.addEventListener('keydown', onGesture, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
  }, [])
  return {
    muted,
    ready,
    toggle: () => {
      setMuted(!muted)
      setMutedState(!muted)
    },
    music,
    toggleMusic: () => {
      setMusicOn(!music)
      setMusicState(!music)
    },
  }
}
