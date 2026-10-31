import { useCallback, useEffect, useState } from 'react'
import { syncClock } from '../lib/clock'
import { normalizeHomegroup } from '../lib/score'
import { supabase } from '../lib/supabase'
import type { GameSession, Homegroup } from '../lib/types'

const RESYNC_MS = 8000

/**
 * Live public state for one session: the session row and its homegroups.
 * Realtime pushes updates; a periodic refetch covers dropped sockets, sleeping
 * phones, and reconnects.
 */
export function useGameState(code: string | undefined) {
  const [session, setSession] = useState<GameSession | null>(null)
  const [homegroups, setHomegroups] = useState<Homegroup[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [connected, setConnected] = useState(true)

  const normCode = code?.toUpperCase()

  const load = useCallback(async () => {
    if (!normCode) return
    const { data: s, error } = await supabase.from('game_sessions').select('*').eq('code', normCode).maybeSingle()
    if (error) {
      setConnected(false)
      setLoading(false)
      return
    }
    setConnected(true)
    if (!s) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setSession(s as GameSession)
    const { data: h } = await supabase.from('homegroups').select('*').eq('session_id', s.id).order('sort_order')
    if (h) setHomegroups(h.map(normalizeHomegroup))
    setLoading(false)
  }, [normCode])

  useEffect(() => {
    void syncClock()
    void load()
    const timer = setInterval(load, RESYNC_MS)
    const onWake = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [load])

  const sessionId = session?.id
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`game:${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        (payload) => setSession(payload.new as GameSession))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'homegroups', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id: string }).id
            setHomegroups((prev) => prev.filter((h) => h.id !== id))
            return
          }
          const row = normalizeHomegroup(payload.new)
          setHomegroups((prev) => {
            const next = prev.some((h) => h.id === row.id) ? prev.map((h) => (h.id === row.id ? row : h)) : [...prev, row]
            return next.sort((a, b) => a.sort_order - b.sort_order)
          })
        })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          void load() // catch anything missed while (re)connecting
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnected(false)
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId, load])

  return { session, homegroups, loading, notFound, connected, reload: load }
}
