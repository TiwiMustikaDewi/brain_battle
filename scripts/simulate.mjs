// Load + race-condition rehearsal against a real Supabase project.
//
//   SIM_SESSION=SESI2 SIM_ADMIN_EMAIL=... SIM_ADMIN_PASSWORD=... node --env-file=.env.local scripts/simulate.mjs --yes
//
// DESTRUCTIVE for the chosen session: it resets the session, replaces every
// homegroup roster with simulated players, and regenerates buzzer codes. Run it
// before the event, then reset the session and re-enter the real roster.
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
const code = process.env.SIM_SESSION
const PLAYERS_PER_HG = Number(process.env.SIM_PLAYERS ?? 9)
const BUZZ_ROUNDS = Number(process.env.SIM_BUZZ_ROUNDS ?? 15)

if (!url || !key || !code || !process.env.SIM_ADMIN_EMAIL) {
  console.error('Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SIM_SESSION, SIM_ADMIN_EMAIL, SIM_ADMIN_PASSWORD')
  process.exit(1)
}
if (!process.argv.includes('--yes')) {
  console.error(`This wipes play data and the roster of session ${code}. Re-run with --yes to continue.`)
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false } })
const anon = () => createClient(url, key, { auth: { persistSession: false } })

async function call(client, fn, args) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}
const pct = (arr, p) => [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))]
const timed = async (fn) => {
  const t = performance.now()
  const r = await fn()
  return [r, performance.now() - t]
}
let failures = 0
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✖'} ${msg}`)
  if (!ok) failures++
}

const { error: authError } = await admin.auth.signInWithPassword({ email: process.env.SIM_ADMIN_EMAIL, password: process.env.SIM_ADMIN_PASSWORD })
if (authError) throw authError

const { data: session } = await admin.from('game_sessions').select('*').eq('code', code).single()
const sid = { p_session_id: session.id }
await call(admin, 'admin_reset_session', sid)
await call(admin, 'admin_lock_roster', { ...sid, p_locked: false })

const dash = await call(admin, 'admin_dashboard', sid)
const hgs = dash.homegroups
console.log(`Session ${code}: ${hgs.length} homegroups × ${PLAYERS_PER_HG} players`)

const buzzerCodes = {}
for (const h of hgs) {
  await call(admin, 'admin_set_roster', { p_homegroup_id: h.id, p_names: Array.from({ length: PLAYERS_PER_HG }, (_, i) => `Sim ${h.name} #${i + 1}`) })
  buzzerCodes[h.id] = `SIM${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  await call(admin, 'admin_set_buzzer_code', { p_homegroup_id: h.id, p_code: buzzerCodes[h.id] })
}

// Every player is its own client, like separate phones.
const info = await call(anon(), 'get_join_info', { p_code: code })
const players = []
const joinTimes = []
await Promise.all(info.homegroups.flatMap((h) => h.members.map(async (m) => {
  const client = anon()
  const [res, ms] = await timed(() => call(client, 'join_game', {
    p_code: code, p_homegroup_id: h.id, p_participant_id: m.id, p_new_name: null,
  }))
  joinTimes.push(ms)
  players.push({ client, hg: h.id, token: res.token })
})))
check(players.length === hgs.length * PLAYERS_PER_HG, `${players.length} players joined (p50 ${pct(joinTimes, 50).toFixed(0)} ms, p95 ${pct(joinTimes, 95).toFixed(0)} ms)`)

// Two devices fight over each buzzer: exactly one must win.
const buzzers = {}
for (const h of hgs) {
  const [a, b] = players.filter((p) => p.hg === h.id)
  const results = await Promise.allSettled([a, b].map((p) => call(p.client, 'claim_buzzer', { p_token: p.token, p_buzzer_code: buzzerCodes[h.id] })))
  const won = results.filter((r) => r.status === 'fulfilled')
  check(won.length === 1, `${h.name}: one of two simultaneous buzzer claims succeeded`)
  buzzers[h.id] = { client: results[0].status === 'fulfilled' ? a.client : b.client, token: won[0]?.value.buzzer_token }
}

// Quick Fire: everyone answers at once.
await call(admin, 'admin_set_round', { ...sid, p_round: 'quickfire' })
const { data: qf } = await admin.from('questions').select('*').eq('pack', session.pack).eq('round', 'quickfire').order('order_no').limit(1).single()
await call(admin, 'admin_show_question', { ...sid, p_question_id: qf.id })
const submitTimes = []
const submits = await Promise.allSettled(players.map(async (p) => {
  const [, ms] = await timed(() => call(p.client, 'submit_answer', { p_token: p.token, p_question_id: qf.id, p_choice: Math.floor(Math.random() * 4) }))
  submitTimes.push(ms)
}))
check(submits.every((r) => r.status === 'fulfilled'), `${players.length} simultaneous answers accepted (p50 ${pct(submitTimes, 50).toFixed(0)} ms, p95 ${pct(submitTimes, 95).toFixed(0)} ms)`)
const dupes = await Promise.allSettled(players.slice(0, 10).map((p) => call(p.client, 'submit_answer', { p_token: p.token, p_question_id: qf.id, p_choice: 0 })))
check(dupes.every((r) => r.status === 'rejected' && /ALREADY_ANSWERED/.test(r.reason.message)), 'duplicate answers rejected')
await call(admin, 'admin_reveal', sid)
const { data: afterReveal } = await admin.from('game_sessions').select('reveal').eq('id', session.id).single()
check(afterReveal.reveal.answered === players.length, `reveal counted ${afterReveal.reveal.answered} answers`)

// Buzzer races: all homegroups press at the same instant, repeatedly.
await call(admin, 'admin_set_round', { ...sid, p_round: 'buzzer' })
const { data: bq } = await admin.from('questions').select('*').eq('pack', session.pack).eq('round', 'buzzer').order('order_no').limit(1).single()
const pressTimes = []
let exactOne = 0
for (let i = 0; i < BUZZ_ROUNDS; i++) {
  await call(admin, 'admin_show_question', { ...sid, p_question_id: bq.id })
  await call(admin, 'admin_open_buzzer', sid)
  const { data: s } = await admin.from('game_sessions').select('buzzer_seq').eq('id', session.id).single()
  const results = await Promise.all(Object.values(buzzers).map(async (b) => {
    const [r, ms] = await timed(() => call(b.client, 'press_buzzer', { p_buzzer_token: b.token, p_seq: s.buzzer_seq }))
    pressTimes.push(ms)
    return r
  }))
  const winners = results.filter((r) => r.won)
  if (winners.length === 1) exactOne++
  await call(admin, 'admin_judge_buzz', { ...sid, p_result: 'void', p_reopen: false })
}
check(exactOne === BUZZ_ROUNDS, `${exactOne}/${BUZZ_ROUNDS} simultaneous buzzer races had exactly one winner (p50 ${pct(pressTimes, 50).toFixed(0)} ms, p95 ${pct(pressTimes, 95).toFixed(0)} ms)`)

await call(admin, 'admin_reset_session', sid)
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed. Session reset; re-enter the real roster before the event.')
process.exit(failures ? 1 : 0)
