import { useEffect, useRef } from 'react'
import { useNow } from '../hooks/useNow'
import { sfx } from '../lib/sound'

/** Ticks during the last 5 seconds of a deadline, then a time-up sound. Render-only, returns null. */
export function CountdownSounds({ deadline }: { deadline: string | null }) {
  const now = useNow(100)
  const last = useRef<number | null>(null)
  const secs = deadline ? Math.ceil((Date.parse(deadline) - now) / 1000) : null
  useEffect(() => {
    if (secs === null || secs === last.current) return
    const was = last.current
    last.current = secs
    if (was === null) return
    if (secs <= 0 && was > 0) sfx.timeUp()
    else if (secs > 0 && secs <= 5) sfx.tick(secs === 1)
  }, [secs])
  return null
}
