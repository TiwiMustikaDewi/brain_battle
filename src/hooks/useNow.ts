import { useEffect, useState } from 'react'
import { serverNow } from '../lib/clock'

/** Re-renders every `ms` and returns the current server time. */
export function useNow(ms = 250) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function useInterval(fn: () => void, ms: number | null) {
  useEffect(() => {
    if (ms === null) return
    const t = setInterval(fn, ms)
    return () => clearInterval(t)
  }, [fn, ms])
}
