import { useState } from 'react'
import { OPTION_STYLE } from '../../lib/options'
import { Timer } from '../../components/Timer'
import { Button, Card, ErrorText, Input } from '../../components/ui'
import { fmtScore } from '../../lib/score'
import { rpc } from '../../lib/supabase'
import { ROUND_LABEL, type GameSession, type Homegroup, type Question, type Round } from '../../lib/types'
import { useAction, type Dashboard } from './shared'

const ROUNDS: Round[] = ['lobby', 'quickfire', 'buzzer', 'final', 'results']

export function ControlTab({
  session,
  homegroups,
  dash,
  questions,
  refresh,
}: {
  session: GameSession
  homegroups: Homegroup[]
  dash: Dashboard
  questions: Question[]
  refresh: () => void
}) {
  const { busy, error, run } = useAction(refresh)
  const [message, setMessage] = useState(session.message ?? '')
  const sid = { p_session_id: session.id }

  const roundQuestions = questions.filter((q) => q.round === session.round)
  const nextQuestion = roundQuestions.find((q) => !session.shown_question_ids.includes(q.id))
  const cq = dash.current_question
  const isBuzzerRound = session.round === 'buzzer' || session.round === 'final'
  const hgName = (id: string | null | undefined) => homegroups.find((h) => h.id === id)?.name ?? '—'
  const totalMembers = homegroups.reduce((n, h) => n + h.member_count, 0)
  const totalAnswered = dash.homegroups.reduce((n, h) => n + h.answered, 0)

  function setRound(r: Round) {
    if (r === session.round) return
    if ((session.phase === 'question' || session.phase === 'wager') && !confirm('Ada soal yang sedang berjalan. Tetap pindah babak?')) return
    if (r === 'quickfire' && !session.roster_locked && !confirm('Memulai babak akan MENGUNCI roster. Lanjutkan?')) return
    void run(`round-${r}`, () => rpc('admin_set_round', { ...sid, p_round: r }))
  }

  const show = (q: Question) => {
    if ((session.phase === 'question' || session.phase === 'wager') && !confirm('Soal saat ini belum diungkap. Tetap tampilkan soal lain?')) return
    void run(`show-${q.id}`, () => rpc('admin_show_question', { ...sid, p_question_id: q.id }))
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[17rem_1fr_24rem]">
      {/* Left: game flow */}
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Babak</p>
          <div className="flex flex-col gap-1.5">
            {ROUNDS.map((r, i) => (
              <button
                key={r}
                type="button"
                onClick={() => setRound(r)}
                disabled={busy !== null}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left font-semibold transition ${r === session.round ? 'bg-volt text-ink' : 'bg-panel-2 hover:bg-line'}`}
              >
                <span className="font-display opacity-60">{i}</span>
                {ROUND_LABEL[r]}
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Status permainan</p>
          {session.status === 'paused' ? (
            <Button variant="success" busy={busy === 'status'} onClick={() => run('status', () => rpc('admin_set_status', { ...sid, p_status: 'live' }))}>▶ Lanjutkan</Button>
          ) : (
            <Button variant="secondary" busy={busy === 'status'} disabled={session.status !== 'live'} onClick={() => run('status', () => rpc('admin_set_status', { ...sid, p_status: 'paused' }))}>⏸ Jeda (darurat)</Button>
          )}
          <p className="text-xs text-muted">Jeda menolak jawaban & buzzer sampai dilanjutkan.</p>
        </Card>

        <Card className="flex flex-col gap-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Pengumuman di layar</p>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="cth. Istirahat 1 menit" />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" busy={busy === 'msg'} onClick={() => run('msg', () => rpc('admin_set_message', { ...sid, p_message: message }))}>Tampilkan</Button>
            <Button size="sm" variant="ghost" onClick={() => { setMessage(''); void run('msg', () => rpc('admin_set_message', { ...sid, p_message: '' })) }}>Hapus</Button>
          </div>
        </Card>
      </div>

      {/* Center: current question */}
      <div className="flex flex-col gap-4">
        <ErrorText>{error}</ErrorText>

        {session.round === 'lobby' && (
          <Card className="p-6">
            <p className="font-display text-2xl font-bold">Lobby</p>
            <p className="mt-2 text-muted">
              Peserta bergabung lewat <b className="text-white">/play/{session.code}</b>. Pastikan roster benar dan kode buzzer sudah dibagikan
              (tab Roster & Kode), lalu mulai <b className="text-white">Quick Fire</b>. Roster terkunci otomatis saat babak dimulai.
            </p>
            <p className="mt-4 text-sm">{homegroups.reduce((n, h) => n + h.member_count, 0)} anggota resmi · {dash.homegroups.reduce((n, h) => n + h.joined, 0)} sudah masuk</p>
          </Card>
        )}

        {session.round === 'results' && (
          <Card className="p-6">
            <p className="font-display text-2xl font-bold">Hasil akhir ditampilkan</p>
            <p className="mt-2 text-muted">Lihat tab Skor & Audit untuk rincian dan ekspor CSV.</p>
          </Card>
        )}

        {session.round !== 'lobby' && session.round !== 'results' && (
          <Card className="flex flex-col gap-4 p-5">
            {!cq || session.phase === 'idle' ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-muted">
                  Belum ada soal tampil di babak ini. Layar & HP peserta memutar animasi pembuka babak (±5 detik), lalu menampilkan aturan babak & papan skor.
                  Tunggu animasinya selesai sebelum menampilkan soal — kalau soal ditampilkan lebih cepat, animasi langsung dihentikan.
                </p>
                {nextQuestion && (
                  <Button size="lg" busy={busy === `show-${nextQuestion.id}`} onClick={() => show(nextQuestion)}>
                    Tampilkan soal {roundQuestions.indexOf(nextQuestion) + 1} →
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Soal {session.question_no}/{session.question_total} · {cq.category} · {session.phase === 'reveal' ? 'diungkap' : session.phase === 'wager' ? 'fase taruhan (soal belum tampil di layar)' : 'berjalan'}
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold leading-snug">{cq.body}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-panel-2 px-3 py-1 text-sm tabular-nums">{session.round === 'final' ? '± taruhan' : `+${cq.points_correct} / −${cq.points_wrong}`}</span>
                </div>

                {cq.options && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {cq.options.map((o, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 ${i === cq.correct_option ? 'bg-emerald-500/20 ring-2 ring-emerald-400' : 'bg-panel-2'}`}
                      >
                        <span className={`size-6 shrink-0 rounded-md text-center text-sm leading-6 ${OPTION_STYLE[i].bg}`}>{OPTION_STYLE[i].glyph}</span>
                        <span className="flex-1">{o}</span>
                        {session.reveal?.counts && <span className="tabular-nums text-muted">{session.reveal.counts[i]}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {cq.answer_text && (
                  <p className="rounded-xl bg-emerald-500/15 px-4 py-3 text-emerald-200">
                    <span className="text-xs font-semibold uppercase tracking-wider">Kunci: </span>{cq.answer_text}
                  </p>
                )}

                {(session.phase === 'question' || session.phase === 'wager') && session.question_deadline && (
                  <Timer deadline={session.question_deadline} total={session.phase === 'wager' ? (session.public_question?.wager_sec ?? 20) : cq.duration_sec} />
                )}

                {session.round === 'final' && (
                  <div className="rounded-2xl border border-volt/40 bg-volt/5 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-volt">
                      💰 Taruhan ({session.wagered_hgs.length}/{homegroups.length}) · hanya terlihat oleh admin sampai diungkap
                    </p>
                    <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                      {homegroups.map((h) => {
                        const w = dash.wagers.find((x) => x.homegroup_id === h.id)
                        return (
                          <li key={h.id} className="flex items-center gap-2 rounded-lg bg-panel-2/70 px-3 py-1.5">
                            <span className="size-2.5 rounded-full" style={{ background: h.color }} />
                            <span className="flex-1 truncate">{h.name}</span>
                            <span className={`font-display font-bold tabular-nums ${w ? (w.amount > 0 ? 'text-volt' : 'text-muted') : 'text-muted/60'}`}>
                              {w ? (w.amount > 0 ? `${fmtScore(w.amount)} / ${fmtScore(w.max_allowed)}` : 'lewati') : '—'}
                            </span>
                            {w?.result && <span className={w.result === 'correct' ? 'text-emerald-400' : w.result === 'wrong' ? 'text-rose-400' : 'text-muted'}>{w.result === 'correct' ? '✓' : w.result === 'wrong' ? '✗' : '∅'}</span>}
                          </li>
                        )
                      })}
                    </ul>
                    {session.phase === 'wager' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="lg" className="flex-1" busy={busy === 'lock'} onClick={() => run('lock', () => rpc('admin_lock_wagers', sid))}>
                          🔒 Kunci taruhan & tampilkan soal
                        </Button>
                        <Button variant="secondary" busy={busy === 'extend'} onClick={() => run('extend', () => rpc('admin_extend_time', { ...sid, p_seconds: 10 }))}>+10 dtk</Button>
                      </div>
                    )}
                  </div>
                )}

                {session.round === 'quickfire' && (
                  <p className="text-sm text-muted">{totalAnswered} / {totalMembers} anggota resmi sudah menjawab</p>
                )}

                {/* Buzzer controls */}
                {isBuzzerRound && session.phase === 'question' && (
                  <div className="rounded-2xl border border-line bg-ink/40 p-4">
                    {session.buzzer_state === 'locked' && session.buzzer_winner_hg ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-center font-display text-3xl font-extrabold">
                          <span style={{ color: homegroups.find((h) => h.id === session.buzzer_winner_hg)?.color }}>{hgName(session.buzzer_winner_hg)}</span> menjawab…
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Button variant="success" size="lg" busy={busy === 'j-correct'} onClick={() => run('j-correct', () => rpc('admin_judge_buzz', { ...sid, p_result: 'correct', p_reopen: false }))}>✓ Benar</Button>
                          <Button variant="danger" size="lg" busy={busy === 'j-wrong-open'} onClick={() => run('j-wrong-open', () => rpc('admin_judge_buzz', { ...sid, p_result: 'wrong', p_reopen: true }))}>✗ Salah + buka lagi</Button>
                          <Button variant="danger" busy={busy === 'j-wrong'} onClick={() => run('j-wrong', () => rpc('admin_judge_buzz', { ...sid, p_result: 'wrong', p_reopen: false }))}>✗ Salah (tutup)</Button>
                          <Button variant="secondary" busy={busy === 'j-void'} onClick={() => run('j-void', () => rpc('admin_judge_buzz', { ...sid, p_result: 'void', p_reopen: false }))}>Batal (0 poin)</Button>
                        </div>
                      </div>
                    ) : session.buzzer_state === 'open' ? (
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-display text-2xl font-bold text-emerald-400">Buzzer terbuka…</p>
                        <Button variant="secondary" busy={busy === 'close'} onClick={() => run('close', () => rpc('admin_close_buzzer', sid))}>Tutup buzzer</Button>
                      </div>
                    ) : (
                      <Button size="lg" className="w-full" variant="success" busy={busy === 'open'} disabled={session.status !== 'live'} onClick={() => run('open', () => rpc('admin_open_buzzer', sid))}>
                        🔔 Buka buzzer {session.buzzer_excluded.length > 0 && `(tanpa ${session.buzzer_excluded.map(hgName).join(', ')})`}
                      </Button>
                    )}
                    {dash.attempts.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-1 text-sm text-muted">
                        {dash.attempts.map((a) => (
                          <li key={a.id}>#{a.buzzer_seq} · {hgName(a.homegroup_id)} · {new Date(a.pressed_at).toLocaleTimeString('id-ID')} · <b className="text-white">{a.result}</b></li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {session.phase === 'question' && (
                    <>
                      <Button busy={busy === 'reveal'} onClick={() => run('reveal', () => rpc('admin_reveal', sid))}>
                        Ungkap jawaban{isBuzzerRound ? ' (tanpa pemenang)' : ''}
                      </Button>
                      {session.question_deadline && (
                        <>
                          <Button variant="secondary" busy={busy === 'extend'} onClick={() => run('extend', () => rpc('admin_extend_time', { ...sid, p_seconds: 10 }))}>+10 dtk</Button>
                          <Button variant="secondary" busy={busy === 'end'} onClick={() => run('end', () => rpc('admin_end_timer', sid))}>Hentikan timer</Button>
                        </>
                      )}
                    </>
                  )}
                  {session.phase === 'reveal' && nextQuestion && (
                    <Button size="lg" busy={busy === `show-${nextQuestion.id}`} onClick={() => show(nextQuestion)}>
                      Soal berikutnya ({roundQuestions.indexOf(nextQuestion) + 1}) →
                    </Button>
                  )}
                  {session.phase === 'reveal' && !nextQuestion && (
                    <p className="self-center text-muted">Semua soal babak ini sudah tampil. Lanjut ke babak berikutnya di panel kiri.</p>
                  )}
                </div>
              </>
            )}
          </Card>
        )}

        {roundQuestions.length > 0 && (
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Soal {ROUND_LABEL[session.round]} · Paket {session.pack}</p>
            <ol className="flex flex-col gap-1.5">
              {roundQuestions.map((q, i) => {
                const shown = session.shown_question_ids.includes(q.id)
                const current = q.id === session.current_question_id
                return (
                  <li key={q.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${current ? 'bg-volt/10 ring-1 ring-volt' : 'bg-panel-2/60'}`}>
                    <span className="w-5 font-display font-bold text-muted">{i + 1}</span>
                    <span className={`flex-1 ${shown && !current ? 'text-muted line-through decoration-muted/50' : ''}`}>{q.body}</span>
                    <Button size="sm" variant={current ? 'ghost' : 'secondary'} busy={busy === `show-${q.id}`} onClick={() => show(q)}>
                      {current ? 'Tampil' : shown ? 'Ulang' : 'Tampilkan'}
                    </Button>
                  </li>
                )
              })}
            </ol>
          </Card>
        )}
      </div>

      {/* Right: homegroups */}
      <Card className="h-fit p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Homegroup</p>
        <ul className="flex flex-col gap-2">
          {homegroups.map((h) => {
            const d = dash.homegroups.find((x) => x.id === h.id)
            const excluded = session.buzzer_excluded.includes(h.id)
            return (
              <li key={h.id} className={`rounded-xl bg-panel-2/70 px-3 py-2.5 ${excluded ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: h.color }} />
                  <span className="flex-1 truncate font-semibold">{h.name}</span>
                  <span className="font-display font-bold tabular-nums">{fmtScore(h.total_score)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {d?.online ?? 0} online · {d?.joined ?? 0}/{h.member_count} masuk
                    {session.round === 'quickfire' && ` · ${d?.answered ?? 0} jawab`}
                  </span>
                  {d?.buzzer ? (
                    <span className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${d.buzzer.alive ? 'bg-emerald-400' : 'bg-rose-500'}`} title={d.buzzer.alive ? 'aktif' : 'tidak ada heartbeat'} />
                      {d.buzzer.holder ?? '?'}
                      <button
                        type="button"
                        className="ml-1 rounded bg-ink/60 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/30"
                        onClick={() => confirm(`Lepas paksa buzzer ${h.name}?`) && run(`rel-${h.id}`, () => rpc('admin_force_release', { p_homegroup_id: h.id }))}
                      >
                        Lepas
                      </button>
                    </span>
                  ) : (
                    <span className="text-amber-300/80">{d?.has_buzzer_code ? 'buzzer kosong' : 'kode buzzer belum diatur'}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
