import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { OPTION_STYLE } from '../../lib/options'
import { Button, Card, ErrorText, Input, Label, Logo, Textarea } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { ROUND_LABEL, type PlayRound, type Question } from '../../lib/types'
import { AdminGate } from './AdminGate'

const ROUNDS: PlayRound[] = ['quickfire', 'buzzer', 'final']
const TARGET: Record<PlayRound, number> = { quickfire: 8, buzzer: 6, final: 3 }
const DEFAULTS: Record<PlayRound, Pick<Question, 'duration_sec' | 'points_correct' | 'points_wrong'>> = {
  quickfire: { duration_sec: 20, points_correct: 100, points_wrong: 0 },
  buzzer: { duration_sec: 30, points_correct: 100, points_wrong: 50 },
  final: { duration_sec: 45, points_correct: 200, points_wrong: 100 },
}

type Draft = Omit<Question, 'id'> & { id?: string }

function blank(pack: 'A' | 'B', round: PlayRound, order: number): Draft {
  return {
    pack, round, order_no: order, category: 'Umum', difficulty: 'sedang', body: '',
    options: round === 'quickfire' ? ['', '', '', ''] : null, correct_option: round === 'quickfire' ? 0 : null,
    answer_text: round === 'quickfire' ? null : '', ...DEFAULTS[round],
  }
}

export default function AdminQuestions() {
  return (
    <AdminGate>
      <QuestionBank />
    </AdminGate>
  )
}

function QuestionBank() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [pack, setPack] = useState<'A' | 'B'>('A')
  const [editing, setEditing] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('questions').select('*').order('order_no').order('created_at')
    setQuestions((data ?? []) as Question[])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const inPack = questions.filter((q) => q.pack === pack)

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link to="/admin"><Logo className="text-2xl" /></Link>
          <p className="font-display text-xl font-bold">Bank soal</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-panel p-1">
          {(['A', 'B'] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPack(p)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${pack === p ? 'bg-volt text-ink' : 'text-muted'}`}>
              Paket {p}
            </button>
          ))}
        </div>
      </header>
      <p className="text-sm text-muted">
        Soal tampil sesuai urutan. Kunci jawaban tidak pernah dikirim ke HP peserta sebelum admin menekan "Ungkap jawaban". Jaga tingkat
        kesulitan paket A dan B tetap sebanding.
      </p>

      {ROUNDS.map((round) => {
        const list = inPack.filter((q) => q.round === round)
        return (
          <section key={round} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">
                {ROUND_LABEL[round]} <span className={`text-sm ${list.length === TARGET[round] ? 'text-muted' : 'text-amber-300'}`}>({list.length}/{TARGET[round]})</span>
              </h2>
              <Button size="sm" variant="secondary" onClick={() => setEditing(blank(pack, round, (list.at(-1)?.order_no ?? 0) + 1))}>+ Soal</Button>
            </div>
            {list.map((q, i) =>
              editing?.id === q.id ? (
                <Editor key={q.id} draft={editing} onDone={() => { setEditing(null); void load() }} />
              ) : (
                <Card key={q.id} className="flex items-start gap-3 p-3">
                  <span className="w-6 font-display font-bold text-muted">{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-medium">{q.body}</p>
                    <p className="mt-1 text-sm text-emerald-300/90">
                      {q.options ? `${OPTION_STYLE[q.correct_option ?? 0].glyph} ${q.options[q.correct_option ?? 0]}` : q.answer_text}
                    </p>
                    <p className="mt-1 text-xs text-muted">{q.category} · {q.difficulty} · {q.duration_sec} dtk · {q.round === 'final' ? '± taruhan' : `+${q.points_correct}/−${q.points_wrong}`}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(q)}>Edit</Button>
                </Card>
              ),
            )}
            {editing && !editing.id && editing.round === round && editing.pack === pack && (
              <Editor draft={editing} onDone={() => { setEditing(null); void load() }} />
            )}
          </section>
        )
      })}
    </main>
  )
}

function Editor({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const [d, setD] = useState<Draft>(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))
  const isQF = d.round === 'quickfire'

  async function save() {
    setBusy(true)
    setError('')
    const { id, ...row } = d
    const { error } = id ? await supabase.from('questions').update(row).eq('id', id) : await supabase.from('questions').insert(row)
    setBusy(false)
    if (error) setError(errorMessage(error))
    else onDone()
  }

  async function remove() {
    if (!d.id || !confirm('Hapus soal ini? Jawaban yang sudah masuk untuk soal ini ikut terhapus.')) return
    const { error } = await supabase.from('questions').delete().eq('id', d.id)
    if (error) setError(errorMessage(error))
    else onDone()
  }

  return (
    <Card className="flex flex-col gap-3 border-volt p-4">
      <label><Label>Pertanyaan</Label><Textarea rows={2} value={d.body} onChange={(e) => set('body', e.target.value)} /></label>
      {isQF && d.options && (
        <div className="grid gap-2 sm:grid-cols-2">
          {d.options.map((o, i) => (
            <label key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={d.correct_option === i} onChange={() => set('correct_option', i)} className="size-4 accent-emerald-500" aria-label={`Opsi ${i + 1} benar`} />
              <span className={`size-7 shrink-0 rounded-md text-center leading-7 ${OPTION_STYLE[i].bg}`}>{OPTION_STYLE[i].glyph}</span>
              <Input value={o} onChange={(e) => set('options', d.options!.map((x, j) => (j === i ? e.target.value : x)))} />
            </label>
          ))}
        </div>
      )}
      {!isQF && <label><Label>Kunci jawaban (untuk admin/juri)</Label><Textarea rows={2} value={d.answer_text ?? ''} onChange={(e) => set('answer_text', e.target.value)} /></label>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <label className="col-span-2"><Label>Kategori</Label><Input value={d.category} onChange={(e) => set('category', e.target.value)} /></label>
        <label>
          <Label>Kesulitan</Label>
          <select value={d.difficulty} onChange={(e) => set('difficulty', e.target.value as Draft['difficulty'])} className="w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5">
            <option value="mudah">mudah</option><option value="sedang">sedang</option><option value="sulit">sulit</option>
          </select>
        </label>
        <label><Label>Urutan</Label><Input type="number" value={d.order_no} onChange={(e) => set('order_no', Number(e.target.value))} /></label>
        <label><Label>Detik</Label><Input type="number" min={5} max={300} value={d.duration_sec} onChange={(e) => set('duration_sec', Number(e.target.value))} /></label>
        {d.round === 'final' ? (
          <div><Label>Poin</Label><p className="py-2.5 text-sm text-muted">± taruhan tiap HG</p></div>
        ) : (
          <label><Label>+Benar / −Salah</Label>
            <div className="flex gap-1">
              <Input type="number" value={d.points_correct} onChange={(e) => set('points_correct', Number(e.target.value))} />
              <Input type="number" min={0} value={d.points_wrong} onChange={(e) => set('points_wrong', Number(e.target.value))} />
            </div>
          </label>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button busy={busy} onClick={save} disabled={!d.body.trim() || (isQF && d.options!.some((o) => !o.trim()))}>Simpan</Button>
        <Button variant="ghost" onClick={onDone}>Batal</Button>
        {d.id && <Button variant="ghost" className="ml-auto text-rose-300" onClick={remove}>Hapus</Button>}
      </div>
    </Card>
  )
}
