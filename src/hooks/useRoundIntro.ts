import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameSession, Round } from '../lib/types'

/**
 * Detects round changes and returns the round whose intro should play. The
 * round present at load is skipped (no replay on reload), and the intro is cut
 * short once a question starts so it never eats into a timer.
 */
export function useRoundIntro(session: GameSession | null) {
  const [intro, setIntro] = useState<Round | null>(null)
  const prev = useRef<Round | null>(null)
  const round = session?.round ?? null
  useEffect(() => {
    if (!round) return
    const was = prev.current
    prev.current = round
    if (was && was !== round && round !== 'lobby') setIntro(round)
  }, [round])
  const done = useCallback(() => setIntro(null), [])
  const busy = session !== null && session.phase !== 'idle'
  return { intro: busy ? null : intro, done }
}
