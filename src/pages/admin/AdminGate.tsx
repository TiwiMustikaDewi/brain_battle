import type { Session } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Card, ErrorText, FullCenter, Input, Label, Logo, Spinner } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { rpc, supabase } from '../../lib/supabase'

/** Renders children only for a signed-in user listed in `admins`. */
export function AdminGate({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Session | null | undefined>(undefined)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = auth?.user.id
  useEffect(() => {
    if (!userId) return
    rpc<boolean>('is_admin').then(setIsAdmin, () => setIsAdmin(false))
  }, [userId])

  if (auth === undefined) return <FullCenter><Spinner className="size-8" /></FullCenter>
  if (!auth) return <LoginForm />
  if (isAdmin === null) return <FullCenter><Spinner className="size-8" /></FullCenter>
  if (!isAdmin) {
    return (
      <FullCenter>
        <Logo className="text-3xl" />
        <p className="max-w-sm text-muted">
          Akun <b className="text-white">{auth.user.email}</b> belum terdaftar sebagai admin. Tambahkan user id ini ke tabel{' '}
          <code>admins</code>:
        </p>
        <code className="rounded-lg bg-panel-2 px-3 py-2 text-xs">{auth.user.id}</code>
        <Button variant="secondary" onClick={() => supabase.auth.signOut()}>Keluar</Button>
      </FullCenter>
    )
  }
  return <>{children}</>
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <FullCenter>
      <Logo className="text-4xl" />
      <Card className="w-full max-w-sm p-5 text-left">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError('')
            const { error } = await supabase.auth.signInWithPassword({ email, password })
            if (error) setError(errorMessage(error))
            setBusy(false)
          }}
        >
          <p className="font-display text-xl font-bold">Masuk admin</p>
          <label><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy}>Masuk</Button>
        </form>
      </Card>
    </FullCenter>
  )
}
