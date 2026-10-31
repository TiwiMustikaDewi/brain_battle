import { useCallback, useEffect, useState } from 'react'
import { isCode } from '../lib/errors'
import { buzzerToken } from '../lib/storage'
import { rpc } from '../lib/supabase'

const HEARTBEAT_MS = 4000

export type WagerInfo = { question_id?: string | null; amount: number | null; max: number }

export type PressResult = { won: boolean; reason?: 'EXCLUDED' | 'TOO_LATE' | 'STALE' | 'CLOSED'; winner?: string | null }

/** This device's claim on its homegroup's buzzer, kept alive by a heartbeat. */
export function useBuzzer(code: string, participantToken: string | null) {
  const [token, setToken] = useState(() => buzzerToken.get(code))
  const [notice, setNotice] = useState('')

  const drop = useCallback(
    (message: string) => {
      buzzerToken.set(code, null)
      setToken(null)
      setNotice(message)
    },
    [code],
  )

  useEffect(() => {
    if (!token) return
    let stopped = false
    const beat = async () => {
      try {
        const res = await rpc<{ ok: boolean }>('buzzer_heartbeat', { p_buzzer_token: token })
        if (!res.ok && !stopped) drop('Hak buzzer perangkat ini dilepas (oleh admin atau perangkat lain).')
      } catch {
        // network blip: the next beat retries; the server allows 15 s of silence
      }
    }
    void beat()
    const t = setInterval(beat, HEARTBEAT_MS)
    return () => {
      stopped = true
      clearInterval(t)
    }
  }, [token, drop])

  const claim = useCallback(
    async (buzzerCode: string) => {
      const res = await rpc<{ buzzer_token: string }>('claim_buzzer', { p_token: participantToken, p_buzzer_code: buzzerCode })
      buzzerToken.set(code, res.buzzer_token)
      setToken(res.buzzer_token)
      setNotice('')
    },
    [code, participantToken],
  )

  const release = useCallback(async () => {
    if (!token) return
    try {
      await rpc('release_buzzer', { p_buzzer_token: token })
    } finally {
      drop('')
    }
  }, [token, drop])

  const press = useCallback(
    async (seq: number): Promise<PressResult> => {
      if (!token) return { won: false, reason: 'CLOSED' }
      try {
        return await rpc<PressResult>('press_buzzer', { p_buzzer_token: token, p_seq: seq })
      } catch (e) {
        if (isCode(e, 'BUZZER_REVOKED')) drop('Hak buzzer perangkat ini sudah dilepas.')
        throw e
      }
    },
    [token, drop],
  )

  const wager = useCallback(
    async (amount: number) => {
      if (!token) throw new Error('BUZZER_REVOKED')
      return rpc<WagerInfo>('submit_wager', { p_buzzer_token: token, p_amount: amount })
    },
    [token],
  )

  const myWager = useCallback(async () => (token ? rpc<WagerInfo>('get_my_wager', { p_buzzer_token: token }) : null), [token])

  return { holding: Boolean(token), claim, release, press, wager, myWager, notice }
}
