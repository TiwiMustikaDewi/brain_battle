import { useState } from 'react'
import { Leaderboard } from '../../components/Leaderboard'
import { Button, Card, ErrorText, Input, Label } from '../../components/ui'
import { rankHomegroups } from '../../lib/score'
import { rpc } from '../../lib/supabase'
import type { GameSession, Homegroup } from '../../lib/types'
import { useAction, type Dashboard } from './shared'

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

export function ScoresTab({
  session,
  homegroups,
  dash,
  refresh,
}: {
  session: GameSession
  homegroups: Homegroup[]
  dash: Dashboard
  refresh: () => void
}) {
  const { busy, error, run } = useAction(refresh)
  const [hgId, setHgId] = useState('')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const hgName = (id: string) => homegroups.find((h) => h.id === id)?.name ?? id

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    downloadCsv(`brain-battle-${session.code}-skor-${stamp}.csv`, [
      ['Peringkat', 'Homegroup', 'Anggota resmi', 'Quick Fire (rata-rata)', 'Buzzer + Final', 'Total'],
      ...rankHomegroups(homegroups).map((h) => [h.rank, h.name, h.member_count, h.quickfire_score, h.battle_score, h.total_score]),
      [],
      ['Riwayat skor (buzzer/final/manual)'],
      ['Waktu', 'Homegroup', 'Delta', 'Sumber', 'Alasan'],
      ...[...dash.score_events].reverse().map((e) => [new Date(e.created_at).toLocaleString('id-ID'), hgName(e.homegroup_id), e.delta, e.source, e.reason]),
    ])
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_26rem]">
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Papan skor</p>
            <Button size="sm" variant="secondary" onClick={exportCsv}>Ekspor CSV</Button>
          </div>
          <Leaderboard homegroups={homegroups} showBreakdown size="lg" />
          <p className="mt-3 text-xs text-muted">
            Tie-break: total → poin buzzer/final → rata-rata Quick Fire. Jika masih seri, gunakan soal tambahan lalu catat sebagai koreksi manual.
          </p>
        </Card>

        <Card className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Riwayat skor (audit)</p>
          {dash.score_events.length === 0 ? (
            <p className="text-sm text-muted">Belum ada perubahan skor buzzer/manual.</p>
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr><th className="py-1">Waktu</th><th>Homegroup</th><th>Delta</th><th>Sumber</th><th>Alasan</th></tr>
              </thead>
              <tbody>
                {dash.score_events.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="py-1.5 text-muted tabular-nums">{new Date(e.created_at).toLocaleTimeString('id-ID')}</td>
                    <td>{hgName(e.homegroup_id)}</td>
                    <td className={`font-semibold tabular-nums ${e.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{e.delta > 0 ? '+' : ''}{e.delta}</td>
                    <td className="text-muted">{e.source}</td>
                    <td>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Koreksi skor manual</p>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              if (await run('adjust', () => rpc('admin_adjust_score', { p_homegroup_id: hgId, p_delta: Number(delta), p_reason: reason }))) {
                setDelta('')
                setReason('')
              }
            }}
          >
            <label>
              <Label>Homegroup</Label>
              <select value={hgId} onChange={(e) => setHgId(e.target.value)} required className="w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5">
                <option value="">Pilih…</option>
                {homegroups.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
            <label><Label>Perubahan poin (boleh negatif)</Label><Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required placeholder="cth. 50 atau -50" /></label>
            <label><Label>Alasan (wajib, tercatat di audit)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="cth. Koreksi juri soal buzzer #3" /></label>
            <Button type="submit" busy={busy === 'adjust'} disabled={!hgId || !delta || Number(delta) === 0 || !reason.trim()}>Terapkan koreksi</Button>
          </form>
        </Card>

        <Card className="border-rose-500/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-rose-300">Zona bahaya</p>
          <p className="mb-3 text-sm text-muted">
            Reset menghapus semua jawaban, buzzer, taruhan, dan skor sesi ini, mengeluarkan semua perangkat peserta, membuka kunci roster, lalu kembali ke lobby. Homegroup, roster, kode buzzer, dan soal tetap ada. Ekspor CSV dulu.
          </p>
          <Button
            variant="danger"
            size="sm"
            busy={busy === 'reset'}
            onClick={() => {
              const typed = prompt(`Ketik ${session.code} untuk mereset sesi ini:`)
              if (typed?.trim().toUpperCase() === session.code) void run('reset', () => rpc('admin_reset_session', { p_session_id: session.id }))
            }}
          >
            Reset sesi
          </Button>
        </Card>
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  )
}
