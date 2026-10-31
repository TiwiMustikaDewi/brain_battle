// Runs the migration + seed on an in-process Postgres (PGlite) with Supabase stubs
// and exercises the game rules end to end. Run: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const migrations = readdirSync(new URL('migrations/', root)).sort()
  .map((f) => readFileSync(new URL(`migrations/${f}`, root), 'utf8'))
const seed = readFileSync(new URL('seed.sql', root), 'utf8')

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
`
// Supabase grants table privileges to API roles by default; RLS does the filtering.
const SUPABASE_GRANTS = `
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`

const ADMIN_ID = '00000000-0000-0000-0000-00000000a0a0'

async function setup() {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  for (const sql of migrations) {
    // Apply Supabase's default grants right before the migration's own revokes.
    await db.exec(sql.replace('-- Belt and braces', SUPABASE_GRANTS + '\n-- Belt and braces'))
  }
  await db.exec(seed)
  await db.exec(`insert into auth.users values ('${ADMIN_ID}', 'admin@test'); insert into public.admins values ('${ADMIN_ID}');`)
  return db
}

// Run fn's queries as a given API role.
async function as(db, role, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`)
    if (role === 'authenticated') await tx.exec(`set local request.jwt.claim.sub = '${ADMIN_ID}'`)
    const r = await tx.query(sql, params)
    return r.rows
  })
}
const anon = (db, fn, ...args) => rpc(db, 'anon', fn, args)
const admin = (db, fn, ...args) => rpc(db, 'authenticated', fn, args)
async function rpc(db, role, fn, args) {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await as(db, role, `select public.${fn}(${ph}) as r`, args)
  return rows[0].r
}
async function rejects(promise, code) {
  await assert.rejects(promise, (e) => {
    assert.match(e.message, new RegExp(code))
    return true
  })
}

test('brain battle rules', async (t) => {
  const db = await setup()
  const q = async (sql, p) => (await db.query(sql, p)).rows

  const [s1] = await q(`select * from game_sessions where code = 'SESI1'`)
  const [s2] = await q(`select * from game_sessions where code = 'SESI2'`)
  const hgs1 = await q(`select h.*, c.join_code from homegroups h join homegroup_credentials c on c.homegroup_id = h.id
                        where session_id = $1 order by sort_order`, [s1.id])
  const [hgA, hgB] = hgs1

  await t.test('seed', async () => {
    assert.equal((await q(`select count(*)::int n from homegroups`))[0].n, 16)
    assert.equal((await q(`select count(*)::int n from questions where pack = 'A'`))[0].n, 17)
    assert.equal((await q(`select count(*)::int n from questions where pack = 'B'`))[0].n, 17)
    // Re-running the seed must not duplicate anything.
    await db.exec(seed)
    assert.equal((await q(`select count(*)::int n from questions`))[0].n, 34)
    assert.equal((await q(`select count(*)::int n from homegroups`))[0].n, 16)
    assert.equal((await q(`select count(*)::int n from homegroup_credentials`))[0].n, 16)
  })

  await t.test('anon visibility', async () => {
    assert.equal((await as(db, 'anon', `select * from questions`)).length, 0)
    assert.equal((await as(db, 'anon', `select * from homegroup_credentials`)).length, 0)
    assert.equal((await as(db, 'anon', `select * from game_sessions`)).length, 2)
    await rejects(as(db, 'anon', `update game_sessions set round = 'final'`), 'permission denied')
    await rejects(anon(db, 'admin_reveal', s1.id), 'permission denied')
    await rejects(as(db, 'anon', `select private.hash('x')`), 'permission denied')
  })

  // Roster: HG A has 8 official members, HG B has 9.
  const namesA = Array.from({ length: 8 }, (_, i) => `A${i + 1}`)
  const namesB = Array.from({ length: 9 }, (_, i) => `B${i + 1}`)
  await admin(db, 'admin_set_roster', hgA.id, namesA)
  await admin(db, 'admin_set_roster', hgB.id, namesB)
  await admin(db, 'admin_set_buzzer_code', hgA.id, 'ALPHA1')
  await admin(db, 'admin_set_buzzer_code', hgB.id, 'BRAVO2')

  const tokens = {}
  await t.test('join', async () => {
    const info = await anon(db, 'get_join_info', 'sesi1')
    const infoA = info.homegroups.find((h) => h.id === hgA.id)
    assert.equal(infoA.members.length, 8)
    for (const [hg, names] of [[hgA, namesA], [hgB, namesB]]) {
      const members = info.homegroups.find((h) => h.id === hg.id).members
      for (const name of names) {
        const m = members.find((x) => x.name === name)
        tokens[name] = (await anon(db, 'join_game', 'SESI1', hg.id, m.id, null)).token
      }
    }
    const me = await anon(db, 'get_me', tokens.A1)
    assert.equal(me.name, 'A1')
    assert.equal(me.homegroup_id, hgA.id)

    // A signed-in name is locked: another device cannot take it over.
    const old = tokens.A8
    const m8 = infoA.members.find((x) => x.name === 'A8')
    await rejects(anon(db, 'join_game', 'SESI1', hgA.id, m8.id, null), 'NAME_IN_USE')
    assert.equal((await anon(db, 'get_me', old)).name, 'A8')

    // Admin reset frees it for a new device; the old device is signed out.
    await rejects(anon(db, 'admin_reset_participant', m8.id), 'permission denied')
    await admin(db, 'admin_reset_participant', m8.id)
    await rejects(anon(db, 'get_me', old), 'INVALID_TOKEN')
    tokens.A8 = (await anon(db, 'join_game', 'SESI1', hgA.id, m8.id, null)).token

    // Leaving frees the name too.
    await anon(db, 'leave_game', tokens.A8)
    await rejects(anon(db, 'get_me', tokens.A8), 'INVALID_TOKEN')
    tokens.A8 = (await anon(db, 'join_game', 'SESI1', hgA.id, m8.id, null)).token

    // Two devices racing for the same free name: exactly one wins.
    const m7 = infoA.members.find((x) => x.name === 'A7')
    await admin(db, 'admin_reset_participant', m7.id)
    const race = await Promise.allSettled([1, 2].map(() => anon(db, 'join_game', 'SESI1', hgA.id, m7.id, null)))
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1)
    tokens.A7 = race.find((r) => r.status === 'fulfilled').value.token
  })

  await t.test('quick fire', async () => {
    await admin(db, 'admin_set_round', s1.id, 'quickfire')
    const [st] = await q(`select * from game_sessions where id = $1`, [s1.id])
    assert.equal(st.roster_locked, true)
    assert.equal(st.question_total, 8)
    await rejects(anon(db, 'join_game', 'SESI1', hgA.id, null, 'Penyusup'), 'ROSTER_LOCKED')

    const [q1] = await q(`select * from questions where pack = 'A' and round = 'quickfire' order by order_no limit 1`)
    await rejects(anon(db, 'submit_answer', tokens.A1, q1.id, q1.correct_option), 'QUESTION_CLOSED')
    await admin(db, 'admin_show_question', s1.id, q1.id)

    const [pub] = await as(db, 'anon', `select public_question, reveal from game_sessions where id = $1`, [s1.id])
    assert.equal(pub.reveal, null)
    assert.equal('correct_option' in pub.public_question, false)
    assert.equal('answer_text' in pub.public_question, false)

    const wrong = (q1.correct_option + 1) % 4
    for (const n of namesA) await anon(db, 'submit_answer', tokens[n], q1.id, q1.correct_option)
    for (const n of namesB.slice(0, 8)) await anon(db, 'submit_answer', tokens[n], q1.id, q1.correct_option)
    await anon(db, 'submit_answer', tokens.B9, q1.id, wrong)
    await rejects(anon(db, 'submit_answer', tokens.A1, q1.id, wrong), 'ALREADY_ANSWERED')

    await admin(db, 'admin_reveal', s1.id)
    const [rev] = await q(`select reveal from game_sessions where id = $1`, [s1.id])
    assert.equal(rev.reveal.correct_option, q1.correct_option)
    assert.equal(rev.reveal.answered, 17)

    const scores = Object.fromEntries((await q(`select id, quickfire_score::float s from homegroups where session_id = $1`, [s1.id])).map((r) => [r.id, r.s]))
    assert.equal(scores[hgA.id], 100)          // 800 / 8
    assert.equal(scores[hgB.id], 88.89)        // 800 / 9 — averaged, not summed

    const [q2] = await q(`select * from questions where pack = 'A' and round = 'quickfire' order by order_no offset 1 limit 1`)
    await admin(db, 'admin_show_question', s1.id, q2.id)
    await db.query(`update game_sessions set question_deadline = clock_timestamp() - interval '5 seconds' where id = $1`, [s1.id])
    await rejects(anon(db, 'submit_answer', tokens.A2, q2.id, 0), 'DEADLINE_PASSED')

    await rejects(admin(db, 'admin_show_question', s2.id, q1.id), 'QUESTION_NOT_IN_ROUND')
  })

  const buzz = {}
  await t.test('buzzer credentials', async () => {
    await rejects(anon(db, 'claim_buzzer', tokens.A1, 'WRONG'), 'WRONG_BUZZER_CODE')
    buzz.A = (await anon(db, 'claim_buzzer', tokens.A1, 'alpha1')).buzzer_token
    await rejects(anon(db, 'claim_buzzer', tokens.A2, 'ALPHA1'), 'BUZZER_IN_USE')
    buzz.B = (await anon(db, 'claim_buzzer', tokens.B1, 'BRAVO2')).buzzer_token
    assert.equal((await anon(db, 'buzzer_heartbeat', buzz.A)).ok, true)
    assert.equal((await q(`select buzzer_holder from homegroups where id = $1`, [hgA.id]))[0].buzzer_holder, 'A1')

    // A dead device (no heartbeat for 15 s) can be taken over.
    await db.query(`update buzzer_sessions set heartbeat_at = now() - interval '1 minute' where homegroup_id = $1`, [hgA.id])
    const takeover = (await anon(db, 'claim_buzzer', tokens.A2, 'ALPHA1')).buzzer_token
    assert.equal((await anon(db, 'buzzer_heartbeat', buzz.A)).ok, false)
    await anon(db, 'release_buzzer', takeover)
    buzz.A = (await anon(db, 'claim_buzzer', tokens.A1, 'ALPHA1')).buzzer_token
  })

  await t.test('battle buzzer', async () => {
    await admin(db, 'admin_set_round', s1.id, 'buzzer')
    const [bq] = await q(`select * from questions where pack = 'A' and round = 'buzzer' order by order_no limit 1`)
    await admin(db, 'admin_show_question', s1.id, bq.id)
    let [st] = await q(`select * from game_sessions where id = $1`, [s1.id])

    assert.equal((await anon(db, 'press_buzzer', buzz.B, st.buzzer_seq)).won, false) // not open yet

    await admin(db, 'admin_open_buzzer', s1.id);
    [st] = await q(`select * from game_sessions where id = $1`, [s1.id])
    const seq1 = st.buzzer_seq
    assert.equal((await anon(db, 'press_buzzer', buzz.B, seq1)).won, true)
    const late = await anon(db, 'press_buzzer', buzz.A, seq1)
    assert.equal(late.won, false)
    assert.equal(late.reason, 'TOO_LATE')
    assert.equal(late.winner, hgB.id)

    await admin(db, 'admin_judge_buzz', s1.id, 'wrong', true);
    [st] = await q(`select * from game_sessions where id = $1`, [s1.id])
    assert.equal(st.buzzer_state, 'open')
    assert.deepEqual(st.buzzer_excluded, [hgB.id])
    assert.equal((await anon(db, 'press_buzzer', buzz.B, st.buzzer_seq)).reason, 'EXCLUDED')
    assert.equal((await anon(db, 'press_buzzer', buzz.A, seq1)).reason, 'STALE')
    assert.equal((await anon(db, 'press_buzzer', buzz.A, st.buzzer_seq)).won, true)

    await admin(db, 'admin_judge_buzz', s1.id, 'correct', false);
    [st] = await q(`select * from game_sessions where id = $1`, [s1.id])
    assert.equal(st.phase, 'reveal')
    assert.equal(st.reveal.answer_text, bq.answer_text)

    const hs = Object.fromEntries((await q(`select id, battle_score, total_score::float t from homegroups where session_id = $1`, [s1.id])).map((r) => [r.id, r]))
    assert.equal(hs[hgA.id].battle_score, 100)
    assert.equal(hs[hgB.id].battle_score, -50)
    assert.equal(hs[hgB.id].t, 38.89)
    await rejects(admin(db, 'admin_judge_buzz', s1.id, 'correct', false), 'NOTHING_TO_JUDGE')
  })

  await t.test('final showdown wagers', async () => {
    await admin(db, 'admin_set_round', s1.id, 'final')
    const [fq] = await q(`select * from questions where pack = 'A' and round = 'final' order by order_no limit 1`)
    await admin(db, 'admin_show_question', s1.id, fq.id)
    let [st] = await q(`select * from game_sessions where id = $1`, [s1.id])
    assert.equal(st.phase, 'wager')
    assert.equal(st.public_question.body, null, 'question text hidden while wagering')
    await rejects(admin(db, 'admin_open_buzzer', s1.id), 'BUZZER_NOT_AVAILABLE')

    // HG B has 38.89 points, so its cap is the 200 floor. HG A skips with 0.
    await rejects(anon(db, 'submit_wager', buzz.B, 201), 'WAGER_TOO_HIGH')
    await rejects(anon(db, 'submit_wager', buzz.B, -5), 'INVALID_WAGER')
    assert.deepEqual(await anon(db, 'submit_wager', buzz.B, 150), { amount: 150, max: 200 })
    assert.deepEqual(await anon(db, 'submit_wager', buzz.B, 200), { amount: 200, max: 200 })
    await anon(db, 'submit_wager', buzz.A, 0)
    assert.equal((await anon(db, 'get_my_wager', buzz.B)).amount, 200)
    ;[st] = await q(`select * from game_sessions where id = $1`, [s1.id])
    assert.equal(st.wagered_hgs.length, 2)
    await rejects(as(db, 'anon', `select * from final_wagers`), 'permission denied')
    assert.equal(JSON.stringify(st).includes('"amount"'), false, 'no amounts in public state')

    await admin(db, 'admin_lock_wagers', s1.id)
    await rejects(anon(db, 'submit_wager', buzz.B, 10), 'WAGER_CLOSED')
    ;[st] = await q(`select * from game_sessions where id = $1`, [s1.id])
    assert.equal(st.phase, 'question')
    assert.equal(st.public_question.body, fq.body)
    assert.ok(st.buzzer_excluded.includes(hgA.id), 'zero wager sits out')
    assert.ok(!st.buzzer_excluded.includes(hgB.id))
    assert.equal(st.buzzer_excluded.length, 7)

    await admin(db, 'admin_open_buzzer', s1.id)
    ;[st] = await q(`select * from game_sessions where id = $1`, [s1.id])
    assert.equal((await anon(db, 'press_buzzer', buzz.A, st.buzzer_seq)).reason, 'EXCLUDED')
    assert.equal((await anon(db, 'press_buzzer', buzz.B, st.buzzer_seq)).won, true)
    await admin(db, 'admin_judge_buzz', s1.id, 'wrong', false)
    // −50 from the buzzer round, −200 wager: negative scores are allowed.
    assert.equal((await q(`select battle_score from homegroups where id = $1`, [hgB.id]))[0].battle_score, -250)

    await admin(db, 'admin_reveal', s1.id)
    ;[st] = await q(`select * from game_sessions where id = $1`, [s1.id])
    const w = Object.fromEntries(st.reveal.wagers.map((x) => [x.homegroup_id, x]))
    assert.equal(w[hgB.id].amount, 200)
    assert.equal(w[hgB.id].result, 'wrong')
    assert.equal(w[hgA.id].amount, 0)

    // Next question: B is now at −161.11, still allowed to wager up to 200 and win it back.
    const [fq2] = await q(`select * from questions where pack = 'A' and round = 'final' order by order_no offset 1 limit 1`)
    await admin(db, 'admin_show_question', s1.id, fq2.id)
    assert.equal((await anon(db, 'submit_wager', buzz.B, 200)).max, 200)
    await admin(db, 'admin_lock_wagers', s1.id)
    await admin(db, 'admin_open_buzzer', s1.id)
    ;[st] = await q(`select * from game_sessions where id = $1`, [s1.id])
    await anon(db, 'press_buzzer', buzz.B, st.buzzer_seq)
    await admin(db, 'admin_judge_buzz', s1.id, 'correct', false)
    assert.equal((await q(`select battle_score from homegroups where id = $1`, [hgB.id]))[0].battle_score, -50)
    const dash = await admin(db, 'admin_dashboard', s1.id)
    assert.equal(dash.wagers[0].amount, 200)
  })

  await t.test('admin tools', async () => {
    await admin(db, 'admin_adjust_score', hgB.id, 25, 'Koreksi juri')
    await rejects(admin(db, 'admin_adjust_score', hgB.id, 25, ' '), 'REASON_REQUIRED')
    assert.equal((await q(`select battle_score from homegroups where id = $1`, [hgB.id]))[0].battle_score, -25)

    await admin(db, 'admin_force_release', hgA.id)
    assert.equal((await anon(db, 'buzzer_heartbeat', buzz.A)).ok, false)
    await rejects(anon(db, 'press_buzzer', buzz.A, 0), 'BUZZER_REVOKED')

    const dash = await admin(db, 'admin_dashboard', s1.id)
    assert.equal(dash.homegroups.length, 8)
    assert.ok(dash.score_events.length >= 4)

    // Session 2 is untouched by everything above.
    const s2scores = await q(`select coalesce(sum(abs(total_score)), 0)::float n from homegroups where session_id = $1`, [s2.id])
    assert.equal(s2scores[0].n, 0)

    await admin(db, 'admin_reset_session', s1.id)
    assert.equal((await q(`select count(*)::int n from final_wagers where session_id = $1`, [s1.id]))[0].n, 0)
    const after = await q(`select coalesce(sum(abs(total_score)), 0)::float n from homegroups where session_id = $1`, [s1.id])
    assert.equal(after[0].n, 0)
    assert.equal((await q(`select count(*)::int n from participants where session_id = $1`, [s1.id]))[0].n, 17)
    assert.equal((await q(`select count(*)::int n from participants where session_id = $1 and token_hash is not null`, [s1.id]))[0].n, 0)
    await rejects(anon(db, 'get_me', tokens.A1), 'INVALID_TOKEN')
  })
})
