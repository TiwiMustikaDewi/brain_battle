import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ConnectionBanner, FullCenter, Logo, Spinner } from '../../components/ui'
import { useGameState } from '../../hooks/useGameState'
import { useInterval } from '../../hooks/useNow'
import { rpc, supabase } from '../../lib/supabase'
import { ROUND_LABEL, type Question } from '../../lib/types'
import { AdminGate } from './AdminGate'
import { ControlTab } from './ControlTab'
import { RosterTab } from './RosterTab'
import { ScoresTab } from './ScoresTab'
import type { Dashboard } from './shared'

const TABS = [
  { id: 'control', label: 'Kontrol' },
  { id: 'roster', label: 'Roster & Kode' },
  { id: 'scores', label: 'Skor & Audit' },
] as const

export default function AdminSession() {
  return (
    <AdminGate>
      <SessionConsole />
    </AdminGate>
  )
}

function SessionConsole() {
  const { code = '' } = useParams()
  const { session, homegroups, connected, notFound } = useGameState(code)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('control')
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])

  const sessionId = session?.id
  const refreshDash = useCallback(async () => {
    if (!sessionId) return
    try {
      setDash(await rpc<Dashboard>('admin_dashboard', { p_session_id: sessionId }))
    } catch {
      // transient; next poll retries
    }
  }, [sessionId])

  // Refetch on every public state change, plus a short poll for presence/answer counts.
  const updatedAt = session?.updated_at
  useEffect(() => {
    void refreshDash()
  }, [refreshDash, updatedAt])
  useInterval(refreshDash, 2500)

  const pack = session?.pack
  useEffect(() => {
    if (!pack) return
    supabase.from('questions').select('*').eq('pack', pack).order('order_no').order('created_at')
      .then(({ data }) => setQuestions((data ?? []) as Question[]))
  }, [pack])

  if (notFound) return <FullCenter><p className="text-muted">Sesi tidak ditemukan.</p></FullCenter>
  if (!session || !dash) return <FullCenter><Spinner className="size-8" /></FullCenter>

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1500px] flex-col px-4 py-4 lg:px-6">
      <ConnectionBanner connected={connected} />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-4">
          <Link to="/admin"><Logo className="text-2xl" /></Link>
          <div>
            <p className="font-display text-lg font-bold leading-tight">{session.code} · Paket {session.pack}</p>
            <p className="text-xs text-muted">{session.name} · {ROUND_LABEL[session.round]} · {session.status}</p>
          </div>
        </div>
        <nav className="flex w-full gap-1 overflow-x-auto rounded-xl bg-panel p-1 sm:w-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition sm:flex-none sm:px-4 ${tab === t.id ? 'bg-volt text-ink' : 'text-muted hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <a href={`/screen/${session.code}`} target="_blank" rel="noreferrer" className="text-sm text-muted underline underline-offset-4">
          Buka layar proyektor ↗
        </a>
      </header>

      <div className="flex-1 pt-4">
        {tab === 'control' && (
          <ControlTab session={session} homegroups={homegroups} dash={dash} questions={questions} refresh={refreshDash} />
        )}
        {tab === 'roster' && <RosterTab session={session} dash={dash} refresh={refreshDash} />}
        {tab === 'scores' && <ScoresTab session={session} homegroups={homegroups} dash={dash} refresh={refreshDash} />}
      </div>
    </div>
  )
}
