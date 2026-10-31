import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Celebrate } from '../components/Celebrate'
import { CountdownSounds } from '../components/CountdownSounds'
import { Leaderboard } from '../components/Leaderboard'
import { RoundIntro } from '../components/RoundIntro'
import { OptionTile } from '../components/Options'
import { SoundToggle } from '../components/SoundToggle'
import { WagerReveal } from '../components/WagerReveal'
import { Timer } from '../components/Timer'
import { Button, Card, ConnectionBanner, ErrorText, FullCenter, Input, Logo, Spinner } from '../components/ui'
import { useBuzzer, type PressResult } from '../hooks/useBuzzer'
import { useBackgroundMusic, useGameSounds } from '../hooks/useGameSounds'
import { useGameState } from '../hooks/useGameState'
import { useRoundIntro } from '../hooks/useRoundIntro'
import { useInterval, useNow } from '../hooks/useNow'
import { errorMessage, isCode } from '../lib/errors'
import { fmtScore, rankHomegroups } from '../lib/score'
import { sfx } from '../lib/sound'
import { buzzerToken, participantToken } from '../lib/storage'
import { rpc } from '../lib/supabase'
import { ROUND_LABEL, wagerCap, type GameSession, type Homegroup } from '../lib/types'

interface Me {
  participant_id: string
  name: string
  homegroup_id: string
  homegroup_name: string
  homegroup_color: string
  current_question_id: string | null
  current_choice: number | null
  holds_buzzer: boolean
}

export default function Play() {
  const { code = '' } = useParams()
  const token = participantToken.get(code)
  if (!token) return <Navigate to={`/play/${code.toUpperCase()}`} replace />
  return <PlayInner code={code.toUpperCase()} token={token} />
}

function PlayInner({ code, token }: { code: string; token: string }) {
  const navigate = useNavigate()
  const { session, homegroups, connected, notFound } = useGameState(code)
  const [me, setMe] = useState<Me | null>(null)
  const buzzer = useBuzzer(code, token)
  useGameSounds(session, { quickfireReveal: false })
  useBackgroundMusic(session, false)
  const { intro, done: introDone } = useRoundIntro(session)

  const refreshMe = useCallback(async () => {
    try {
      setMe(await rpc<Me>('get_me', { p_token: token }))
    } catch (e) {
      if (isCode(e, 'INVALID_TOKEN')) {
        participantToken.set(code, null)
        buzzerToken.set(code, null)
        navigate(`/play/${code}?kicked=1`, { replace: true })
      }
    }
  }, [token, code, navigate])

  const questionId = session?.current_question_id
  useEffect(() => {
    void refreshMe()
  }, [refreshMe, questionId])
  useInterval(refreshMe, 20000)

  // Pop-up when my homegroup's buzzer answer is judged correct. The judgement
  // present at load time is skipped so a reload does not replay it.
  const [win, setWin] = useState<{ emoji: string; title: string; subtitle: string } | null>(null)
  const closeWin = useCallback(() => setWin(null), [])
  const seenSeq = useRef<number | null | undefined>(undefined)
  const judgement = session?.last_judgement ?? null
  const myHgId = me?.homegroup_id
  const isFinalRound = session?.round === 'final'
  useEffect(() => {
    if (!myHgId) return
    const seq = judgement?.seq ?? null
    if (seenSeq.current === undefined) {
      seenSeq.current = seq
      return
    }
    if (!judgement || seq === seenSeq.current) return
    seenSeq.current = seq
    if (judgement.homegroup_id === myHgId && judgement.result === 'correct') {
      setWin({
        emoji: isFinalRound ? '🏆' : '🎉',
        title: 'BENAR!',
        subtitle: `+${fmtScore(judgement.delta)} poin untuk homegroup-mu`,
      })
    }
  }, [judgement, myHgId, isFinalRound])

  if (notFound) return <FullCenter><p className="text-muted">Sesi tidak ditemukan.</p></FullCenter>
  if (!session || !me) return <FullCenter><Spinner className="size-8" /></FullCenter>

  const myHg = homegroups.find((h) => h.id === me.homegroup_id)
  const ticking = session.status === 'live' && (session.phase === 'wager' || (session.phase === 'question' && (session.round === 'quickfire' || session.buzzer_state === 'open')))

  async function leave() {
    if (!confirm('Keluar dari perangkat ini? Namamu bisa dipakai masuk lagi dari perangkat lain.')) return
    try {
      await buzzer.release()
      await rpc('leave_game', { p_token: token })
    } catch {
      // offline: the admin can still free the name with Reset
    }
    participantToken.set(code, null)
    navigate(`/play/${code}`, { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-6 pt-3">
      <ConnectionBanner connected={connected} />
      <header className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="size-3.5 shrink-0 rounded-full" style={{ background: me.homegroup_color }} />
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{me.name}</p>
            <p className="truncate text-xs text-muted">{me.homegroup_name}{myHg && ` · ${fmtScore(myHg.total_score)} poin`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="font-display text-sm font-bold text-volt">{ROUND_LABEL[session.round]}</p>
            {session.question_no > 0 && session.round !== 'results' && (
              <p className="text-xs text-muted">Soal {session.question_no}/{session.question_total}</p>
            )}
          </div>
          <SoundToggle />
        </div>
      </header>
      {ticking && <CountdownSounds deadline={session.question_deadline} />}

      {session.status === 'paused' && (
        <p className="mt-3 rounded-xl bg-amber-500/15 px-4 py-2.5 text-center text-sm font-semibold text-amber-200">Permainan dijeda oleh host</p>
      )}
      {session.message && <p className="mt-3 rounded-xl bg-panel-2 px-4 py-2.5 text-center text-sm">{session.message}</p>}

      <main className="flex flex-1 flex-col gap-4 pt-4">
        {session.round === 'lobby' && <LobbyView me={me} myHg={myHg} />}
        {session.round === 'quickfire' && (
          <QuickFireView key={session.current_question_id ?? 'idle'} session={session} me={me} token={token} homegroups={homegroups} onConflict={refreshMe} />
        )}
        {(session.round === 'buzzer' || session.round === 'final') && (
          <BuzzerRoundView session={session} homegroups={homegroups} me={me} buzzer={buzzer} />
        )}
        {session.round === 'results' && <ResultsView homegroups={homegroups} me={me} />}

        {session.round !== 'results' && session.round !== 'quickfire' && <BuzzerPanel myHg={myHg} buzzer={buzzer} />}
      </main>

      {intro && <RoundIntro round={intro} onDone={introDone} />}
      {win && <Celebrate emoji={win.emoji} title={win.title} subtitle={win.subtitle} onClose={closeWin} />}

      <footer className="mt-6 text-center">
        <button type="button" onClick={leave} className="text-xs text-muted underline underline-offset-4">Keluar dari perangkat ini</button>
      </footer>
    </div>
  )
}

function LobbyView({ me, myHg }: { me: Me; myHg?: Homegroup }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      <Logo className="text-3xl" />
      <p className="text-lg">Halo, <b>{me.name}</b>!</p>
      <p className="text-muted">
        Kamu bergabung dengan <b className="text-white">{me.homegroup_name}</b>
        {myHg && ` (${myHg.member_count} anggota resmi)`}. Tunggu host memulai permainan.
      </p>
      <Spinner className="mt-2 size-6 text-volt" />
    </Card>
  )
}

function Waiting({ title, homegroups, highlightId }: { title: string; homegroups: Homegroup[]; highlightId: string }) {
  return (
    <>
      <Card className="p-6 text-center">
        <p className="font-display text-2xl font-bold">{title}</p>
        <p className="mt-1 text-sm text-muted">Lihat layar utama dan bersiaplah.</p>
      </Card>
      <Leaderboard homegroups={homegroups} highlightId={highlightId} />
    </>
  )
}

function QuickFireView({
  session,
  me,
  token,
  homegroups,
  onConflict,
}: {
  session: GameSession
  me: Me
  token: string
  homegroups: Homegroup[]
  onConflict: () => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const [sending, setSending] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [celebrate, setCelebrate] = useState(false)
  const closeCelebrate = useCallback(() => setCelebrate(false), [])
  const now = useNow(500)
  const q = session.public_question
  const myChoice = picked ?? (q && me.current_question_id === q.id ? me.current_choice : null)
  const revealed = !!q && session.phase === 'reveal' && session.reveal?.question_id === q.id
  const correct = revealed ? session.reveal!.correct_option : null

  useEffect(() => {
    if (!revealed || myChoice === null) return
    if (myChoice === correct) {
      sfx.correct()
      setCelebrate(true)
    } else {
      sfx.wrong()
      navigator.vibrate?.(200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- play once per reveal
  }, [revealed])

  if (session.phase === 'idle' || !q?.options) {
    return <Waiting title="Bersiap untuk soal berikutnya!" homegroups={homegroups} highlightId={me.homegroup_id} />
  }

  const closed = revealed || session.status !== 'live' || (session.question_deadline !== null && now > Date.parse(session.question_deadline) + 1500)

  async function choose(i: number) {
    setSending(i)
    setError('')
    try {
      await rpc('submit_answer', { p_token: token, p_question_id: q!.id, p_choice: i })
      setPicked(i)
      sfx.tap()
      navigator.vibrate?.(30)
    } catch (e) {
      if (isCode(e, 'ALREADY_ANSWERED')) onConflict()
      setError(errorMessage(e))
    } finally {
      setSending(null)
    }
  }

  const state = (i: number) => {
    if (revealed) return i === correct ? 'correct' : i === myChoice ? 'wrong' : 'faded'
    if (myChoice !== null) return i === myChoice ? 'chosen' : 'faded'
    return 'idle'
  }

  return (
    <>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{q.category}</p>
        <h1 className="font-display text-2xl font-bold leading-snug">{q.body}</h1>
      </div>
      {!revealed && <Timer deadline={session.question_deadline} total={q.duration_sec} />}
      <div className="grid gap-2.5">
        {q.options.map((opt, i) => (
          <OptionTile
            key={i}
            index={i}
            text={opt}
            state={state(i)}
            onClick={myChoice === null && !closed && sending === null ? () => choose(i) : undefined}
          />
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {sending !== null && <p className="flex items-center justify-center gap-2 text-muted"><Spinner /> Mengirim…</p>}
      {!revealed && myChoice !== null && (
        <p className="text-center text-muted">Jawaban terkunci. Tunggu pengumuman jawaban benar.</p>
      )}
      {!revealed && myChoice === null && closed && <p className="text-center text-muted">Waktu habis.</p>}
      {revealed && (
        <Card className={`animate-pop p-4 text-center font-display text-2xl font-bold ${myChoice === correct ? 'text-emerald-400' : 'text-rose-300'}`}>
          {myChoice === null ? 'Tidak menjawab' : myChoice === correct ? `Benar! +${q.points_correct}` : 'Belum tepat'}
        </Card>
      )}
      {celebrate && <Celebrate title="BENAR!" subtitle={`+${q.points_correct} poin`} onClose={closeCelebrate} />}
    </>
  )
}

function BuzzerRoundView({
  session,
  homegroups,
  me,
  buzzer,
}: {
  session: GameSession
  homegroups: Homegroup[]
  me: Me
  buzzer: ReturnType<typeof useBuzzer>
}) {
  const [feedback, setFeedback] = useState<{ seq: number; text: string } | null>(null)
  const [pressing, setPressing] = useState(false)
  const q = session.public_question
  const hgName = (id: string | null | undefined) => homegroups.find((h) => h.id === id)?.name ?? '—'

  if (session.phase === 'idle' || !q) {
    return <Waiting title={`${ROUND_LABEL[session.round]} segera dimulai!`} homegroups={homegroups} highlightId={me.homegroup_id} />
  }
  if (session.phase === 'wager') {
    return <WagerView key={q.id} session={session} homegroups={homegroups} me={me} buzzer={buzzer} />
  }
  const isFinal = session.round === 'final'

  const excluded = session.buzzer_excluded.includes(me.homegroup_id)
  const canPress = buzzer.holding && session.buzzer_state === 'open' && !excluded && session.status === 'live' && !pressing
  const winner = session.buzzer_winner_hg
  const judgement = session.last_judgement

  async function press() {
    setPressing(true)
    navigator.vibrate?.(60)
    const seq = session.buzzer_seq
    try {
      const res: PressResult = await buzzer.press(seq)
      const text = res.won
        ? 'KAMU PERTAMA! Jawab sekarang!'
        : res.reason === 'TOO_LATE'
          ? `Kalah cepat — ${hgName(res.winner)} lebih dulu`
          : res.reason === 'EXCLUDED'
            ? 'Homegroup-mu sudah mencoba soal ini'
            : 'Buzzer belum/sudah ditutup'
      setFeedback({ seq, text })
      if (res.won) navigator.vibrate?.([80, 40, 80])
    } catch (e) {
      setFeedback({ seq, text: errorMessage(e) })
    } finally {
      setPressing(false)
    }
  }

  const wageredHere = session.wagered_hgs.includes(me.homegroup_id)
  const excludedText = !isFinal
    ? 'Homegroup-mu sudah mencoba soal ini'
    : session.last_judgement?.homegroup_id === me.homegroup_id
      ? 'Homegroup-mu sudah menjawab soal ini'
      : wageredHere ? 'Homegroup-mu memilih lewati (taruhan 0)' : 'Homegroup-mu tidak memasang taruhan'
  let status: { text: string; tone: string }
  if (session.phase === 'reveal') status = { text: 'Jawaban diumumkan', tone: 'bg-panel-2' }
  else if (session.buzzer_state === 'locked' && winner)
    status = winner === me.homegroup_id
      ? { text: 'Homegroup-mu menekan pertama! Jawab sekarang!', tone: 'bg-volt text-ink' }
      : { text: `${hgName(winner)} menekan pertama`, tone: 'bg-panel-2' }
  else if (session.buzzer_state === 'open')
    status = excluded ? { text: excludedText, tone: 'bg-panel-2 text-muted' } : { text: 'BUZZER TERBUKA!', tone: 'bg-emerald-600' }
  else if (excluded && isFinal) status = { text: excludedText, tone: 'bg-panel-2 text-muted' }
  else status = { text: 'Dengarkan soal — buzzer belum dibuka', tone: 'bg-panel-2 text-muted' }

  return (
    <>
      <div>
        <p className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wider text-muted">
          <span>{q.category}</span>
          <span>{isFinal ? '± taruhan' : `+${q.points_correct} / −${q.points_wrong}`}</span>
        </p>
        <h1 className="font-display text-2xl font-bold leading-snug">{q.body}</h1>
      </div>

      {session.buzzer_state === 'open' && <Timer deadline={session.question_deadline} total={q.duration_sec} />}

      <p className={`rounded-xl px-4 py-3 text-center font-semibold ${status.tone}`}>{status.text}</p>

      {judgement && session.phase !== 'reveal' && (
        <p className="text-center text-sm text-muted">
          {hgName(judgement.homegroup_id)}: {judgement.result === 'correct' ? 'benar' : judgement.result === 'wrong' ? 'salah' : 'dibatalkan'}
          {judgement.delta !== 0 && ` (${judgement.delta > 0 ? '+' : ''}${judgement.delta})`}
        </p>
      )}

      {isFinal && buzzer.holding && session.phase === 'question' && !excluded && <MyWagerNote buzzer={buzzer} questionId={q.id} />}

      {session.phase === 'reveal' && session.reveal?.answer_text && (
        <Card className="animate-pop p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Jawaban</p>
          <p className="mt-1 text-lg font-semibold">{session.reveal.answer_text}</p>
        </Card>
      )}
      {session.phase === 'reveal' && session.reveal?.wagers && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Taruhan dibuka</p>
          <WagerReveal wagers={session.reveal.wagers} homegroups={homegroups} />
        </div>
      )}

      {buzzer.holding && session.phase === 'question' && (
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={press}
            disabled={!canPress}
            data-nofx
            aria-label="Tekan buzzer"
            className={`aspect-square w-64 max-w-[75vw] rounded-full border-8 font-display text-4xl font-extrabold tracking-wide shadow-2xl transition active:scale-95
              ${canPress ? 'animate-pulse-ring border-volt-2 bg-gradient-to-br from-volt-2 via-volt to-orange-600 text-ink' : 'border-line bg-panel-2 text-muted'}`}
          >
            {pressing ? '…' : 'BUZZ!'}
          </button>
          {feedback && feedback.seq === session.buzzer_seq && <p className="animate-pop text-center font-semibold">{feedback.text}</p>}
        </div>
      )}
    </>
  )
}

const WAGER_STEP = 10

function WagerView({
  session,
  homegroups,
  me,
  buzzer,
}: {
  session: GameSession
  homegroups: Homegroup[]
  me: Me
  buzzer: ReturnType<typeof useBuzzer>
}) {
  const myHg = homegroups.find((h) => h.id === me.homegroup_id)
  const score = myHg?.total_score ?? 0
  const [max, setMax] = useState(() => wagerCap(score))
  const [amount, setAmount] = useState(0)
  const [saved, setSaved] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const placed = session.wagered_hgs.includes(me.homegroup_id)
  const q = session.public_question!
  const { holding, myWager, wager } = buzzer

  // Restore this homegroup's wager after a reload.
  useEffect(() => {
    if (!holding) return
    myWager()
      .then((w) => {
        if (!w) return
        setMax(w.max)
        if (w.amount !== null && w.question_id === q.id) {
          setSaved(w.amount)
          setAmount(w.amount)
        }
      })
      .catch(() => {})
  }, [holding, myWager, q.id])

  async function submit(value: number) {
    setBusy(true)
    setError('')
    try {
      const res = await wager(value)
      setSaved(res.amount)
      setMax(res.max)
      sfx.tap()
      navigator.vibrate?.(40)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const presets = [
    { label: 'Lewati', value: 0 },
    { label: '25%', value: Math.floor((max * 0.25) / WAGER_STEP) * WAGER_STEP },
    { label: '50%', value: Math.floor((max * 0.5) / WAGER_STEP) * WAGER_STEP },
    { label: 'Semua!', value: max },
  ]

  return (
    <>
      <Card className="animate-pop p-5 text-center">
        <p className="text-3xl">💰</p>
        <p className="font-display text-2xl font-extrabold text-volt">Pasang taruhan!</p>
        <p className="mt-1 text-sm text-muted">Kategori soal berikutnya</p>
        <p className="font-display text-xl font-bold">{q.category}</p>
      </Card>
      <Timer deadline={session.question_deadline} total={q.wager_sec ?? 20} />

      {holding ? (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Skor {me.homegroup_name}</span>
            <b className="tabular-nums">{fmtScore(score)}</b>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Taruhan maksimal</span>
            <b className="tabular-nums text-volt">{fmtScore(max)}</b>
          </div>

          <p className="text-center font-display text-5xl font-extrabold tabular-nums">{fmtScore(amount)}</p>
          <input
            type="range"
            min={0}
            max={max}
            step={WAGER_STEP}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            aria-label="Jumlah taruhan"
            className="w-full accent-[var(--color-volt)]"
          />
          <div className="grid grid-cols-4 gap-2">
            {presets.map((p) => (
              <Button key={p.label} type="button" size="sm" variant={amount === p.value ? 'primary' : 'secondary'} onClick={() => setAmount(p.value)}>
                {p.label}
              </Button>
            ))}
          </div>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
            className="text-center font-display text-lg"
            aria-label="Ketik jumlah taruhan"
          />
          <ErrorText>{error}</ErrorText>
          <Button size="lg" busy={busy} onClick={() => submit(amount)}>
            {amount === 0 ? 'Lewati soal ini' : `Kunci taruhan ${fmtScore(amount)}`}
          </Button>
          {saved !== null && (
            <p className="animate-pop rounded-xl bg-emerald-500/15 px-3 py-2 text-center text-sm text-emerald-200">
              {saved === 0 ? 'Tercatat: lewati soal ini.' : `Taruhan terkunci: ${fmtScore(saved)} poin.`} Masih bisa diubah sampai waktu habis.
            </p>
          )}
          <p className="text-center text-xs text-muted">Benar = + taruhan · Salah = − taruhan · Tidak sempat menjawab = 0</p>
        </Card>
      ) : (
        <Card className="p-4 text-center">
          {myHg?.buzzer_holder ? (
            <p>Operator buzzer <b>{myHg.buzzer_holder}</b> sedang memasang taruhan untuk {me.homegroup_name}…</p>
          ) : (
            <p className="text-amber-200">Belum ada yang memegang buzzer {me.homegroup_name}. Tanpa operator, homegroup-mu tidak bisa bertaruh!</p>
          )}
          <p className={`mt-2 font-semibold ${placed ? 'text-emerald-400' : 'text-muted'}`}>{placed ? '✓ Taruhan sudah dipasang' : '⏳ Belum memasang taruhan'}</p>
        </Card>
      )}
    </>
  )
}

/** Reminds the buzzer operator how much is riding on this final question. */
function MyWagerNote({ buzzer, questionId }: { buzzer: ReturnType<typeof useBuzzer>; questionId: string }) {
  const [amount, setAmount] = useState<number | null>(null)
  const { myWager } = buzzer
  useEffect(() => {
    myWager()
      .then((w) => {
        if (w && w.question_id === questionId) setAmount(w.amount)
      })
      .catch(() => {})
  }, [myWager, questionId])
  if (!amount) return null
  return <p className="text-center text-sm">💰 Taruhan homegroup-mu: <b className="text-volt">{fmtScore(amount)}</b></p>
}

function BuzzerPanel({ myHg, buzzer }: { myHg?: Homegroup; buzzer: ReturnType<typeof useBuzzer> }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (buzzer.holding) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-volt/40 bg-volt/5 px-4 py-3 text-sm">
        <span>📣 Perangkat ini adalah <b>buzzer {myHg?.name}</b></span>
        <Button variant="ghost" size="sm" onClick={() => confirm('Lepas hak buzzer dari perangkat ini?') && buzzer.release()}>Lepas</Button>
      </div>
    )
  }

  async function claim() {
    setBusy(true)
    setError('')
    try {
      await buzzer.claim(code)
      setOpen(false)
      setCode('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel/60 px-4 py-3 text-sm">
      {buzzer.notice && <p className="mb-2 text-amber-200">{buzzer.notice}</p>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">
          {myHg?.buzzer_holder ? <>Buzzer dipegang oleh <b className="text-white">{myHg.buzzer_holder}</b></> : 'Buzzer homegroup belum dipegang'}
        </span>
        {!open && <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Saya operator</Button>}
      </div>
      {open && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void claim()
          }}
        >
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Kode buzzer" autoComplete="off" autoCapitalize="characters" className="text-center font-display tracking-widest" />
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" className="flex-1" busy={busy} disabled={code.length < 4}>Pegang buzzer</Button>
          </div>
        </form>
      )}
    </div>
  )
}

function ResultsView({ homegroups, me }: { homegroups: Homegroup[]; me: Me }) {
  const ranked = rankHomegroups(homegroups)
  const mine = ranked.find((h) => h.id === me.homegroup_id)
  const [podium, setPodium] = useState(() => (mine?.rank ?? 99) <= 3 && (mine?.total_score ?? 0) > 0)
  const closePodium = useCallback(() => setPodium(false), [])
  return (
    <>
      {podium && mine && (
        <Celebrate
          emoji={['🏆', '🥈', '🥉'][mine.rank - 1]}
          title={mine.rank === 1 ? 'JUARA 1!' : `Juara ${mine.rank}!`}
          subtitle={`${me.homegroup_name} · ${fmtScore(mine.total_score)} poin`}
          onClose={closePodium}
          autoCloseMs={6000}
        />
      )}
      <Card className="animate-pop p-6 text-center">
        <p className="text-sm uppercase tracking-wider text-muted">{me.homegroup_name} finis di peringkat</p>
        <p className="font-display text-7xl font-extrabold text-volt">#{mine?.rank ?? '—'}</p>
        <p className="mt-1 text-muted">{mine && `${fmtScore(mine.total_score)} poin`}</p>
      </Card>
      <Leaderboard homegroups={homegroups} highlightId={me.homegroup_id} showBreakdown />
    </>
  )
}
