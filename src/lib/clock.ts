import { rpc } from './supabase'

// Phone clocks drift; countdowns use the server's clock. offset = server - local.
let offset = 0
let syncing: Promise<void> | null = null

export function serverNow() {
  return Date.now() + offset
}

export function syncClock() {
  syncing ??= (async () => {
    let best = Infinity
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now()
      try {
        const server = Date.parse(await rpc<string>('server_time'))
        const rtt = Date.now() - t0
        if (rtt < best) {
          best = rtt
          offset = server + rtt / 2 - Date.now()
        }
      } catch {
        // keep the previous offset
      }
    }
  })()
  return syncing
}

export function msUntil(iso: string | null | undefined) {
  if (!iso) return null
  return Date.parse(iso) - serverNow()
}
