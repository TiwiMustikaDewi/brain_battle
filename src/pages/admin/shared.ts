import { useCallback, useState } from 'react'
import { errorMessage } from '../../lib/errors'

export interface DashHomegroup {
  id: string
  name: string
  color: string
  sort_order: number
  join_code: string | null
  has_buzzer_code: boolean
  joined: number
  online: number
  answered: number
  buzzer: { holder: string | null; heartbeat_at: string; alive: boolean } | null
  members: { id: string; name: string; joined: boolean; last_seen_at: string | null }[]
}

export interface Attempt {
  id: number
  homegroup_id: string
  participant_id: string | null
  buzzer_seq: number
  pressed_at: string
  result: 'pending' | 'correct' | 'wrong' | 'void'
}

export interface ScoreEvent {
  id: number
  homegroup_id: string
  delta: number
  source: 'buzzer' | 'final' | 'manual'
  reason: string
  created_at: string
  admin_id: string | null
}

export interface Dashboard {
  homegroups: DashHomegroup[]
  current_question: import('../../lib/types').Question | null
  attempts: Attempt[]
  wagers: { homegroup_id: string; amount: number; max_allowed: number; result: string | null }[]
  score_events: ScoreEvent[]
}

/** Runs admin actions one at a time with a shared busy flag and error message. */
export function useAction(after?: () => void) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key)
      setError('')
      try {
        await fn()
        after?.()
        return true
      } catch (e) {
        setError(errorMessage(e))
        return false
      } finally {
        setBusy(null)
      }
    },
    [after],
  )
  return { busy, error, run, setError }
}
