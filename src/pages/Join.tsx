import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { Button, Card, ErrorText, FullCenter, Input, Logo, Spinner } from '../components/ui'
import { errorMessage, isCode } from '../lib/errors'
import { participantToken } from '../lib/storage'
import { rpc } from '../lib/supabase'

interface JoinInfo {
  session: { id: string; code: string; name: string; status: string; round: string; roster_locked: boolean }
  homegroups: { id: string; name: string; color: string; members: { id: string; name: string; joined: boolean }[] }[]
}

export default function Join() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [hgId, setHgId] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const kicked = useSearchParams()[0].has('kicked')

  useEffect(() => {
    rpc<JoinInfo>('get_join_info', { p_code: code }).then(setInfo, (e) => setLoadError(errorMessage(e)))
  }, [code])

  if (participantToken.get(code)) return <Navigate to={`/play/${code.toUpperCase()}/game`} replace />
  if (loadError) {
    return (
      <FullCenter>
        <Logo className="text-3xl" />
        <ErrorText>{loadError}</ErrorText>
        <Link to="/" className="text-muted underline">Kembali</Link>
      </FullCenter>
    )
  }
  if (!info) return <FullCenter><Spinner className="size-8" /></FullCenter>

  const hg = info.homegroups.find((h) => h.id === hgId)
  const locked = info.session.roster_locked
  const canSubmit = hg && (memberId || (!locked && newName.trim().length >= 2))

  async function join() {
    if (!hg) return
    setBusy(true)
    setError('')
    try {
      const res = await rpc<{ token: string }>('join_game', {
        p_code: code,
        p_homegroup_id: hg.id,
        p_participant_id: memberId,
        p_new_name: memberId ? null : newName,
      })
      participantToken.set(code, res.token)
      navigate(`/play/${code.toUpperCase()}/game`, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
      if (isCode(e, 'NAME_IN_USE')) {
        // Someone took the name after this page loaded: refresh who is signed in.
        setMemberId(null)
        rpc<JoinInfo>('get_join_info', { p_code: code }).then(setInfo, () => {})
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-4 py-6">
      <header className="text-center">
        <Logo className="text-3xl" />
        <p className="mt-1 text-sm text-muted">{info.session.name}</p>
      </header>

      {kicked && (
        <p className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-200">
          Perangkat ini dikeluarkan (oleh panitia atau karena sesi direset). Silakan masuk lagi.
        </p>
      )}

      <section>
        <h2 className="mb-2 font-display text-lg font-bold">1. Pilih homegroup</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {info.homegroups.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                setHgId(h.id)
                setMemberId(null)
              }}
              className={`rounded-xl border-2 px-3 py-3 text-left font-semibold transition ${h.id === hgId ? 'border-white bg-panel-2' : 'border-line bg-panel hover:border-muted'}`}
            >
              <span className="mb-1 block h-1.5 w-8 rounded-full" style={{ background: h.color }} />
              {h.name}
            </button>
          ))}
        </div>
      </section>

      {hg && (
        <Card className="flex flex-col gap-5 p-4">
          <section>
            <h2 className="mb-2 font-display text-lg font-bold">2. Siapa kamu?</h2>
            {hg.members.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {hg.members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={m.joined}
                    onClick={() => {
                      setMemberId(m.id)
                      setNewName('')
                    }}
                    className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${m.id === memberId ? 'border-volt bg-volt text-ink' : 'border-line bg-ink/50 hover:border-muted'} disabled:opacity-40 disabled:line-through`}
                    title={m.joined ? 'Sudah masuk di perangkat lain' : undefined}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            ) : (
              locked && <p className="text-sm text-muted">Pendaftaran nama baru ditutup karena permainan sudah dimulai. Hubungi panitia untuk didaftarkan.</p>
            )}
            {locked && hg.members.length > 0 && (
              <p className="mt-3 text-xs text-muted">Namamu tidak ada? Pendaftaran nama baru ditutup karena permainan sudah dimulai — hubungi panitia.</p>
            )}
            {!locked && (
              <div className="mt-3">
                <Input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value)
                    setMemberId(null)
                  }}
                  placeholder={hg.members.length ? 'Nama tidak ada? Ketik namamu' : 'Ketik namamu'}
                  maxLength={40}
                />
              </div>
            )}
            {hg.members.some((m) => m.joined) && (
              <p className="mt-2 text-xs text-muted">
                Nama yang dicoret sudah masuk di perangkat lain. Kalau itu namamu (misalnya ganti HP), minta panitia menekan Reset.
              </p>
            )}
          </section>

          <ErrorText>{error}</ErrorText>
          <Button size="lg" onClick={join} busy={busy} disabled={!canSubmit}>Gabung</Button>
        </Card>
      )}
    </main>
  )
}
