import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Leaderboard } from '../components/Leaderboard'
import { OptionTile } from '../components/Options'
import { RoundIntro } from '../components/RoundIntro'
import { Stage } from '../components/Stage'
import { Timer } from '../components/Timer'
import { WagerReveal } from '../components/WagerReveal'
import { CountdownSounds } from '../components/CountdownSounds'
import { SoundToggle } from '../components/SoundToggle'
import { ConnectionBanner, FullCenter, Logo, Spinner } from '../components/ui'
import { useBackgroundMusic, useGameSounds } from '../hooks/useGameSounds'
import { useGameState } from '../hooks/useGameState'
import { useRoundIntro } from '../hooks/useRoundIntro'
import { fmtScore, rankHomegroups } from '../lib/score'
import { ROUND_LABEL, type GameSession, type Homegroup } from '../lib/types'

export default function Screen() {
  const { code = '' } = useParams()
  const { session, homegroups, connected, notFound } = useGameState(code)
  useGameSounds(session)
  useBackgroundMusic(session, true)
  const { intro, done } = useRoundIntro(session)

  if (notFound) return <FullCenter><p className="text-muted">Sesi tidak ditemukan.</p></FullCenter>
  if (!session) return <FullCenter><Spinner className="size-10" /></FullCenter>

  const playing = session.round !== 'lobby' && session.round !== 'results'
  const showSide = playing && session.phase !== 'idle'
  const ticking = session.status === 'live' && (session.phase === 'wager' || (session.phase === 'question' && (session.round === 'quickfire' || session.buzzer_state === 'open')))

  return (
    <Stage>
      <div className="flex min-h-dvh flex-col px-4 py-4 sm:px-6 lg:h-full lg:min-h-0 lg:overflow-hidden lg:px-10 lg:py-7">
        <ConnectionBanner connected={connected} />
        {/* Small screens are usually someone opening the projector link by mistake. */}
        <Link
          to={`/play/${session.code}`}
          className="mb-3 rounded-xl border border-volt/50 bg-volt/10 px-4 py-2.5 text-center text-sm lg:hidden"
        >
          📺 Ini <b>layar proyektor</b> (hanya tampilan). Untuk menjawab, ketuk di sini → <b className="text-volt">/play/{session.code}</b>
        </Link>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-5">
            <Logo className="text-2xl lg:text-5xl" />
            <span className="hidden text-xl text-muted md:inline lg:text-2xl">{session.name}</span>
          </div>
          <div className="flex items-center gap-3 lg:gap-6">
            {playing && session.question_no > 0 && (
              <span className="rounded-full border border-sky/40 bg-panel-2/80 px-3 py-1 text-base font-bold tabular-nums lg:px-6 lg:py-2 lg:text-3xl">Soal {session.question_no}<span className="text-muted">/{session.question_total}</span></span>
            )}
            <span className="rounded-full bg-gradient-to-r from-volt to-volt-2 px-3 py-1 font-display text-base font-extrabold text-ink shadow-lg shadow-volt/40 lg:px-7 lg:py-2 lg:text-3xl">{ROUND_LABEL[session.round]}</span>
          </div>
        </header>

        {session.message && (
          <p className="mt-4 rounded-2xl bg-panel-2 px-4 py-2 text-center text-lg font-semibold lg:px-6 lg:py-3 lg:text-2xl">{session.message}</p>
        )}

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-6 lg:mt-6 lg:flex-row lg:gap-8">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col lg:-m-3 lg:overflow-y-auto lg:p-3">
            {session.round === 'lobby' && <LobbyScreen session={session} homegroups={homegroups} />}
            {playing && session.phase === 'idle' && <BetweenScreen session={session} homegroups={homegroups} />}
            {playing && session.phase !== 'idle' && session.round === 'quickfire' && <QuickFireScreen session={session} />}
            {playing && session.phase !== 'idle' && session.round !== 'quickfire' && <BuzzerScreen session={session} homegroups={homegroups} />}
            {session.round === 'results' && <ResultsScreen homegroups={homegroups} />}
          </main>
          {showSide && (
            <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-sky/25 bg-panel/60 p-4 shadow-2xl shadow-black/30 backdrop-blur-md lg:w-[34rem] lg:p-5">
              <p className="mb-3 flex items-center gap-2 font-display text-lg font-black uppercase tracking-wider text-volt lg:text-2xl">🏆 Papan Skor</p>
              <div className="min-h-0 flex-1">
                <Leaderboard
                  homegroups={homegroups}
                  size="lg"
                  fill
                  highlightId={session.buzzer_winner_hg}
                  dimIds={session.round === 'quickfire' ? [] : session.buzzer_excluded}
                />
              </div>
            </aside>
          )}
        </div>

        {session.status === 'paused' && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/85 backdrop-blur">
            <p className="font-display text-5xl font-extrabold lg:text-7xl">Dijeda</p>
          </div>
        )}
        {ticking && <CountdownSounds deadline={session.question_deadline} />}
        <SoundToggle prominent className="fixed bottom-3 right-3 z-50" />
        {intro && <RoundIntro round={intro} onDone={done} big />}
      </div>
    </Stage>
  )
}

function LobbyScreen({ session, homegroups }: { session: GameSession; homegroups: Homegroup[] }) {
  const url = `${location.origin}/play/${session.code}`
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 520, color: { dark: '#0c0a1d', light: '#ffffff' } }).then(setQr)
  }, [url])
  return (
    <div className="flex flex-1 flex-col items-center gap-6 lg:flex-row lg:gap-16">
      <div className="flex flex-col items-center gap-4">
        {qr && <img src={qr} alt={`QR untuk ${url}`} className="size-56 rounded-3xl bg-white p-3 sm:size-72 lg:size-[26rem]" />}
      </div>
      <div className="flex w-full flex-1 flex-col gap-3 text-center lg:gap-6 lg:text-left">
        <p className="text-lg text-muted lg:text-3xl">Buka di HP-mu:</p>
        <p className="font-display text-2xl font-extrabold break-all sm:text-4xl lg:text-6xl">{url.replace(/^https?:\/\//, '')}</p>
        <p className="text-base text-muted sm:text-xl lg:text-3xl">
          Kode sesi <span className="font-display font-extrabold text-volt">{session.code}</span> · pilih homegroup · pilih namamu
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:mt-4 lg:gap-3">
          {homegroups.map((h) => (
            <div key={h.id} className="rounded-2xl bg-panel-2 px-3 py-2 text-left lg:px-4 lg:py-3">
              <span className="mb-2 block h-2 w-10 rounded-full" style={{ background: h.color }} />
              <p className="truncate font-semibold lg:text-xl">{h.name}</p>
              <p className="text-muted">{h.member_count} anggota</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const ROUND_RULES: Record<string, string> = {
  quickfire: 'Semua anggota menjawab di HP. +100 per jawaban benar. Skor homegroup = rata-rata anggota resmi.',
  buzzer: 'Satu buzzer per homegroup. Jawab lisan. Benar +100, salah −50.',
  final: 'Sebelum tiap soal, pasang taruhan (0 = lewati, maksimal skor sendiri atau minimal 200). Hanya yang bertaruh boleh rebutan: benar + taruhan, salah − taruhan.',
}

function BetweenScreen({ session, homegroups }: { session: GameSession; homegroups: Homegroup[] }) {
  return (
    <div className="grid flex-1 grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
      <div>
        <p className="font-display text-4xl font-extrabold leading-none lg:text-7xl">{ROUND_LABEL[session.round]}</p>
        <p className="mt-3 text-lg leading-snug text-muted lg:mt-6 lg:text-3xl">{ROUND_RULES[session.round]}</p>
      </div>
      <Leaderboard homegroups={homegroups} size="lg" showBreakdown />
    </div>
  )
}

function QuestionHeader({ session, children }: { session: GameSession; children?: ReactNode }) {
  const q = session.public_question!
  return (
    <div className="animate-pop rounded-3xl border border-sky/25 bg-gradient-to-br from-panel-2/90 to-panel/70 p-5 shadow-2xl shadow-black/30 backdrop-blur-md lg:p-8">
      <span className="inline-block rounded-full bg-sky/20 px-3 py-1 text-sm font-bold uppercase tracking-wider text-sky-2 lg:px-4 lg:text-xl">{q.category}</span>
      <h1 className="mt-3 font-display text-2xl font-black leading-tight drop-shadow-lg sm:text-4xl lg:text-[3.6rem]">{q.body}</h1>
      {children}
    </div>
  )
}

function QuickFireScreen({ session }: { session: GameSession }) {
  const q = session.public_question
  if (!q?.options) return null
  const r = session.phase === 'reveal' && session.reveal?.question_id === q.id ? session.reveal : null
  return (
    <div className="flex flex-1 flex-col gap-5 lg:min-h-0 lg:gap-6">
      <QuestionHeader session={session}>
        <div className="mt-4 lg:mt-6">
          {r ? (
            <p className="text-lg font-semibold text-muted lg:text-2xl">
              ✅ {r.answered} dari {r.roster} peserta menjawab
            </p>
          ) : (
            <Timer deadline={session.question_deadline} total={q.duration_sec} size="xl" />
          )}
        </div>
      </QuestionHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-rows-2 lg:gap-5">
        {q.options.map((opt, i) => (
          <OptionTile
            key={i}
            index={i}
            text={opt}
            big
            state={r ? (i === r.correct_option ? 'correct' : 'faded') : 'idle'}
            count={r?.counts?.[i]}
            total={r?.answered ?? undefined}
          />
        ))}
      </div>
    </div>
  )
}

function BuzzerScreen({ session, homegroups }: { session: GameSession; homegroups: Homegroup[] }) {
  const q = session.public_question
  if (!q) return null
  if (session.phase === 'wager') return <WagerScreen session={session} homegroups={homegroups} />
  const isFinal = session.round === 'final'
  const hg = (id: string | null | undefined) => homegroups.find((h) => h.id === id)
  const winner = hg(session.buzzer_winner_hg)
  const j = session.last_judgement
  const judged = hg(j?.homegroup_id)

  return (
    <div className="flex flex-1 flex-col gap-5 lg:gap-7">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row lg:gap-8">
        <QuestionHeader session={session} />
        <span className="shrink-0 rounded-2xl bg-panel-2 px-4 py-2 text-center font-display text-xl font-bold lg:px-5 lg:py-3 lg:text-3xl">
          {isFinal ? (
            <span className="text-volt">💰 ± taruhan</span>
          ) : (
            <>
              <span className="text-emerald-400">+{q.points_correct}</span>
              <span className="text-muted"> / </span>
              <span className="text-rose-400">−{q.points_wrong}</span>
            </>
          )}
        </span>
      </div>

      <div className="mt-auto">
        {session.phase === 'reveal' && session.reveal?.answer_text ? (
          <div className="animate-pop rounded-3xl border-2 border-emerald-400/60 bg-emerald-500/10 p-5 lg:p-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300 lg:text-2xl">Jawaban</p>
            <p className="mt-2 text-2xl font-bold leading-tight sm:text-3xl lg:text-5xl">{session.reveal.answer_text}</p>
            {j?.result === 'correct' && judged && (
              <p className="mt-4 text-xl lg:text-3xl">
                <span style={{ color: judged.color }} className="font-bold">{judged.name}</span> +{j.delta}
              </p>
            )}
            {session.reveal.wagers && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-volt lg:text-xl">💰 Taruhan dibuka</p>
                <WagerReveal wagers={session.reveal.wagers} homegroups={homegroups} big />
              </div>
            )}
          </div>
        ) : session.buzzer_state === 'locked' && winner ? (
          <div className="animate-pop rounded-3xl p-6 text-center text-ink lg:p-10" style={{ background: winner.color }}>
            <p className="font-display text-5xl font-extrabold lg:text-8xl">{winner.name}</p>
            <p className="mt-2 text-2xl font-bold lg:text-4xl">menekan pertama!</p>
          </div>
        ) : session.buzzer_state === 'open' ? (
          <div className="flex flex-col gap-6">
            <p className="animate-pulse text-center font-display text-4xl font-extrabold text-emerald-400 lg:text-7xl">BUZZER TERBUKA!</p>
            <Timer deadline={session.question_deadline} total={q.duration_sec} size="xl" />
          </div>
        ) : (
          <p className="text-center text-2xl text-muted lg:text-4xl">Dengarkan soalnya…</p>
        )}
        {j && judged && session.phase !== 'reveal' && session.buzzer_state !== 'locked' && (
          <p className={`animate-pop mt-6 text-center text-2xl font-bold lg:text-4xl ${j.result === 'wrong' ? 'text-rose-400' : 'text-muted'}`}>
            {judged.name}: {j.result === 'wrong' ? `Salah ${j.delta}` : j.result === 'void' ? 'dibatalkan' : `Benar +${j.delta}`}
          </p>
        )}
      </div>
    </div>
  )
}

function WagerScreen({ session, homegroups }: { session: GameSession; homegroups: Homegroup[] }) {
  const q = session.public_question!
  const done = session.wagered_hgs.length
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center lg:gap-8">
      <p className="animate-bob text-6xl lg:text-8xl">💰</p>
      <p className="font-display text-4xl font-extrabold text-gradient lg:text-7xl">PASANG TARUHAN!</p>
      <div>
        <p className="text-lg text-muted lg:text-2xl">Kategori soal</p>
        <p className="font-display text-3xl font-bold lg:text-5xl">{q.category}</p>
      </div>
      <div className="w-full max-w-3xl">
        <Timer deadline={session.question_deadline} total={q.wager_sec ?? 20} size="xl" />
      </div>
      <div className="grid w-full max-w-4xl grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
        {homegroups.map((h) => {
          const placed = session.wagered_hgs.includes(h.id)
          return (
            <div
              key={h.id}
              className={`rounded-2xl border-2 px-3 py-2 transition lg:py-3 ${placed ? 'animate-pop border-volt bg-volt/15' : 'border-line bg-panel-2/60'}`}
            >
              <span className="mx-auto mb-1 block h-1.5 w-8 rounded-full" style={{ background: h.color }} />
              <p className="truncate font-semibold lg:text-xl">{h.name}</p>
              <p className={`text-sm lg:text-base ${placed ? 'text-volt' : 'text-muted'}`}>{placed ? '✓ terkunci' : '⏳ menimbang…'}</p>
            </div>
          )
        })}
      </div>
      <p className="text-muted lg:text-xl">{done}/{homegroups.length} homegroup sudah bertaruh · jumlahnya rahasia sampai jawaban diumumkan</p>
    </div>
  )
}

function ResultsScreen({ homegroups }: { homegroups: Homegroup[] }) {
  const ranked = rankHomegroups(homegroups)
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean)
  const heights = ['h-28 lg:h-48', 'h-40 lg:h-72', 'h-20 lg:h-36']
  return (
    <div className="grid flex-1 grid-cols-1 items-end gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
      <div className="flex items-end justify-center gap-2 sm:gap-6">
        {podium.map((hg) => (
          <div key={hg.id} className="flex w-1/3 max-w-56 flex-col items-center gap-2 lg:gap-3">
            <p className="text-center font-display text-lg font-extrabold sm:text-2xl lg:text-4xl">{hg.name}</p>
            <p className="tabular-nums text-muted lg:text-2xl">{fmtScore(hg.total_score)}</p>
            <div
              className={`animate-pop flex w-full items-start justify-center rounded-t-3xl pt-4 font-display text-4xl font-extrabold text-ink lg:text-7xl ${heights[hg.rank - 1] ?? 'h-16 lg:h-24'}`}
              style={{ background: hg.color }}
            >
              {hg.rank}
            </div>
          </div>
        ))}
      </div>
      <Leaderboard homegroups={homegroups} size="lg" showBreakdown />
    </div>
  )
}
