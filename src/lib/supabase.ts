import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// Only the public anon/publishable key belongs here. Never the service-role key.
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  realtime: { params: { eventsPerSecond: 20 } },
})

/** Call an RPC and throw a readable error on failure. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new RpcError(error.message)
  return data as T
}

export class RpcError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}
