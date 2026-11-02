import { useCallback, useEffect, useState } from 'react'
import { Button, Card, ErrorText, Input, Label, Textarea } from '../../components/ui'
import { rpc, supabase } from '../../lib/supabase'
import type { GameSession } from '../../lib/types'
import { useAction, type Dashboard, type DashHomegroup } from './shared'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L

function randomCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export function RosterTab({ session, dash, refresh }: { session: GameSession; dash: Dashboard; refresh: () => void }) {
  const { busy, error, run } = useAction(refresh)
  const [name, setName] = useState(session.name)
  const [pack, setPack] = useState(session.pack)
  const [codes, setCodes] = useState<Record<string, string>>({})
  const sid = session.id
  const locked = session.roster_locked

  // Buzzer codes are readable by admins only (RLS), so they can be looked up and printed any time.
  const loadCodes = useCallback(async () => {
    const { data } = await supabase.from('homegroup_credentials').select('homegroup_id, buzzer_code')
    setCodes(Object.fromEntries((data ?? []).filter((r) => r.buzzer_code).map((r) => [r.homegroup_id, r.buzzer_code as string])))
  }, [])
  useEffect(() => {
    void loadCodes()
  }, [loadCodes])

  const missing = dash.homegroups.filter((h) => !codes[h.id])

  async function generate(targets: DashHomegroup[]) {
    await run('gen', async () => {
      for (const h of targets) await rpc('admin_set_buzzer_code', { p_homegroup_id: h.id, p_code: randomCode() })
    })
    await loadCodes()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Sesi</p>
          <label><Label>Nama sesi</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>
            <Label>Paket soal</Label>
            <select
              value={pack}
              onChange={(e) => setPack(e.target.value as 'A' | 'B')}
              disabled={session.round !== 'lobby'}
              className="w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5"
            >
              <option value="A">Paket A</option>
              <option value="B">Paket B</option>
            </select>
          </label>
          <Button size="sm" busy={busy === 'session'} onClick={() => run('session', () => rpc('admin_update_session', { p_session_id: sid, p_name: name, p_pack: pack }))}>
            Simpan sesi
          </Button>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Roster resmi</p>
          <p className="text-sm">
            Status: <b className={locked ? 'text-volt' : 'text-emerald-400'}>{locked ? 'TERKUNCI' : 'terbuka'}</b>
          </p>
          <p className="text-xs text-muted">
            Skor Quick Fire = total skor anggota ÷ jumlah anggota resmi. Selama roster terbuka, peserta bisa menambahkan nama sendiri saat
            bergabung. Roster terkunci otomatis saat babak pertama dimulai.
          </p>
          <Button
            size="sm"
            variant={locked ? 'secondary' : 'primary'}
            busy={busy === 'lock'}
            onClick={() => {
              if (locked && session.round !== 'lobby' && !confirm('Permainan sudah berjalan. Membuka roster bisa mengubah pembagi rata-rata. Lanjutkan?')) return
              void run('lock', () => rpc('admin_lock_roster', { p_session_id: sid, p_locked: !locked }))
            }}
          >
            {locked ? 'Buka kunci roster' : 'Kunci roster sekarang'}
          </Button>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Kode buzzer</p>
          <p className="text-xs text-muted">
            Kode buzzer tetap sama sampai kamu menggantinya, dan selalu bisa dilihat di kartu kode (hanya admin). Berikan ke operator
            buzzer masing-masing homegroup.
          </p>
          {missing.length > 0 && (
            <Button size="sm" busy={busy === 'gen'} onClick={() => generate(missing)}>
              Buat kode untuk {missing.length} HG yang belum punya
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-300"
            disabled={busy === 'gen'}
            onClick={() => confirm('Ganti SEMUA kode buzzer? Kode lama tidak berlaku dan buzzer yang aktif akan dilepas.') && generate(dash.homegroups)}
          >
            Ganti semua kode
          </Button>
        </Card>
        <ErrorText>{error}</ErrorText>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="border-volt p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display text-lg font-bold">Kartu kode buzzer — {session.code}</p>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>Cetak</Button>
          </div>
          <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[32rem] text-left">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr><th className="py-1">Homegroup</th><th>Kode buzzer (operator)</th></tr>
            </thead>
            <tbody>
              {dash.homegroups.map((h) => (
                <tr key={h.id} className="border-t border-line">
                  <td className="py-2 font-semibold">{h.name}</td>
                  <td className="font-display text-xl tracking-widest text-volt">
                    {codes[h.id] ?? <span className="text-sm tracking-normal text-muted">{h.has_buzzer_code ? 'kode lama tersembunyi — buat ulang' : 'belum ada'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          {dash.homegroups.map((h) => (
            <HomegroupEditor key={h.id} sessionId={sid} hg={h} locked={locked} code={codes[h.id]} refresh={() => { refresh(); void loadCodes() }} />
          ))}
          {!locked && <NewHomegroup sessionId={sid} count={dash.homegroups.length} refresh={refresh} />}
        </div>
      </div>
    </div>
  )
}

function HomegroupEditor({ sessionId, hg, locked, code, refresh }: { sessionId: string; hg: DashHomegroup; locked: boolean; code?: string; refresh: () => void }) {
  const { busy, error, run } = useAction(refresh)
  const [name, setName] = useState(hg.name)
  const [color, setColor] = useState(hg.color)
  const [roster, setRoster] = useState(hg.members.map((m) => m.name).join('\n'))
  const [buzzerCode, setBuzzerCode] = useState('')
  const names = roster.split('\n').map((s) => s.trim()).filter(Boolean)
  const rosterChanged = names.join('\n') !== hg.members.map((m) => m.name).join('\n')

  async function save() {
    await run('save', async () => {
      await rpc('admin_save_homegroup', {
        p_session_id: sessionId, p_id: hg.id, p_name: name, p_color: color, p_join_code: hg.join_code ?? '0000', p_sort_order: hg.sort_order,
      })
      if (rosterChanged && !locked) await rpc('admin_set_roster', { p_homegroup_id: hg.id, p_names: names })
    })
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-9 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent" aria-label="Warna" />
        <Input value={name} onChange={(e) => setName(e.target.value)} className="font-semibold" aria-label="Nama homegroup" />
      </div>
      <label>
        <Label>Anggota resmi ({names.length}) — satu nama per baris</Label>
        <Textarea rows={6} value={roster} onChange={(e) => setRoster(e.target.value)} disabled={locked} />
      </label>
      {hg.members.some((m) => m.joined) && (
        <div>
          <Label>Sudah masuk ({hg.members.filter((m) => m.joined).length}) — Reset jika peserta ganti HP</Label>
          <div className="flex flex-wrap gap-1.5">
            {hg.members.filter((m) => m.joined).map((m) => (
              <span key={m.id} className="flex items-center gap-1.5 rounded-full bg-panel-2 py-1 pl-3 pr-1 text-sm">
                {m.name}
                <button
                  type="button"
                  className="rounded-full bg-ink/60 px-2 py-0.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/30"
                  onClick={() => confirm(`Reset ${m.name}? Perangkatnya akan keluar dan namanya bisa dipakai masuk lagi.`) && run(`reset-${m.id}`, () => rpc('admin_reset_participant', { p_participant_id: m.id }))}
                >
                  {busy === `reset-${m.id}` ? '…' : 'Reset'}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" busy={busy === 'save'} onClick={save}>Simpan</Button>
        <Input value={buzzerCode} onChange={(e) => setBuzzerCode(e.target.value.toUpperCase())} placeholder="Kode buzzer manual" className="w-44 py-1.5 text-sm" />
        <Button
          size="sm"
          variant="secondary"
          disabled={buzzerCode.length < 4}
          busy={busy === 'code'}
          onClick={async () => {
            if (await run('code', () => rpc('admin_set_buzzer_code', { p_homegroup_id: hg.id, p_code: buzzerCode }))) {
              setBuzzerCode('')
            }
          }}
        >
          Set
        </Button>
        <span className="text-xs text-muted">{code ? <>Kode buzzer: <b className="font-display tracking-widest text-volt">{code}</b></> : hg.has_buzzer_code ? '✓ kode lama (tersembunyi)' : '⚠ belum ada kode buzzer'}</span>
        {!locked && (
          <Button size="sm" variant="ghost" className="ml-auto text-rose-300" busy={busy === 'del'}
            onClick={() => confirm(`Hapus ${hg.name} beserta anggotanya?`) && run('del', () => rpc('admin_delete_homegroup', { p_id: hg.id }))}>
            Hapus
          </Button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}

function NewHomegroup({ sessionId, count, refresh }: { sessionId: string; count: number; refresh: () => void }) {
  const { busy, error, run } = useAction(refresh)
  const [name, setName] = useState('')
  return (
    <Card className="flex flex-col gap-3 border-dashed p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Tambah homegroup</p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama homegroup" />
      <Button size="sm" variant="secondary" disabled={!name.trim()} busy={busy === 'add'}
        onClick={async () => {
          const code = String(1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000))
          if (await run('add', () => rpc('admin_save_homegroup', { p_session_id: sessionId, p_id: null, p_name: name, p_color: '#6366f1', p_join_code: code, p_sort_order: count + 1 }))) setName('')
        }}>
        Tambah
      </Button>
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}
