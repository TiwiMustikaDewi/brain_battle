import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, Logo } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { ROUND_LABEL, type GameSession } from '../../lib/types'
import { AdminGate } from './AdminGate'

export default function AdminHome() {
  return (
    <AdminGate>
      <SessionList />
    </AdminGate>
  )
}

function SessionList() {
  const [sessions, setSessions] = useState<GameSession[]>([])
  useEffect(() => {
    supabase.from('game_sessions').select('*').order('code').then(({ data }) => setSessions((data ?? []) as GameSession[]))
  }, [])

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Logo className="text-3xl" />
        <div className="flex gap-2">
          <Link to="/admin/questions"><Button variant="secondary">Bank soal</Button></Link>
          <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Keluar</Button>
        </div>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {sessions.map((s) => (
          <Card key={s.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-2xl font-bold">{s.code}</p>
                <p className="text-sm text-muted">{s.name}</p>
              </div>
              <span className="rounded-full bg-panel-2 px-3 py-1 text-xs font-semibold">Paket {s.pack}</span>
            </div>
            <p className="text-sm text-muted">{ROUND_LABEL[s.round]} · {s.status}</p>
            <div className="mt-auto flex gap-2">
              <Link to={`/admin/s/${s.code}`} className="flex-1"><Button className="w-full">Kendalikan</Button></Link>
              <a href={`/screen/${s.code}`} target="_blank" rel="noreferrer"><Button variant="secondary">Layar ↗</Button></a>
            </div>
          </Card>
        ))}
      </div>
    </main>
  )
}
