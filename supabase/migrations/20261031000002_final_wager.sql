-- Final Showdown wagers.
--
-- Before each final question the homegroup's buzzer operator secretly wagers
-- 0 .. max(current score, 200). 0 means "skip". Only homegroups with a positive
-- wager may buzz. Correct = +wager, wrong = −wager, no chance to answer = 0.
-- Scores may go negative.
--
-- Flow per question: admin_show_question → phase 'wager' (category only, 20 s)
-- → admin_lock_wagers → phase 'question' (full question, buzzer as usual)
-- → admin_judge_buzz / admin_reveal. Amounts stay secret until the reveal.

alter table public.game_sessions drop constraint game_sessions_phase_check;
alter table public.game_sessions add constraint game_sessions_phase_check
  check (phase in ('idle', 'wager', 'question', 'reveal'));
-- Homegroups that have placed a wager on the current question (amounts stay secret).
alter table public.game_sessions add column wagered_hgs uuid[] not null default '{}';

create table public.final_wagers (
  session_id   uuid not null references public.game_sessions (id) on delete cascade,
  question_id  uuid not null references public.questions (id) on delete cascade,
  homegroup_id uuid not null references public.homegroups (id) on delete cascade,
  amount       int  not null check (amount >= 0),
  max_allowed  int  not null,
  result       text check (result in ('correct', 'wrong', 'void')),
  updated_at   timestamptz not null default now(),
  primary key (question_id, homegroup_id)
);
create index final_wagers_session on public.final_wagers (session_id);

alter table public.final_wagers enable row level security;
create policy "admin read" on public.final_wagers for select using (public.is_admin());
grant select on public.final_wagers to authenticated;

-- Belt and braces: anonymous clients never write tables directly; nobody writes
-- wagers directly and anon cannot even read them. (Repeats the first migration's
-- revokes in case default privileges were re-applied in between.)
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke all on public.final_wagers from anon;
revoke insert, update, delete, truncate on public.game_sessions, public.homegroups, public.admins,
  public.homegroup_credentials, public.participants, public.participant_answers,
  public.buzzer_sessions, public.buzzer_attempts, public.score_events, public.final_wagers from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Largest wager a homegroup may place: its current score, but at least 200 so
-- homegroups at zero or below can still play.
create function private.wager_cap(p_homegroup uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(floor(total_score)::int, 200) from public.homegroups where id = p_homegroup
$$;

-- Question as shown to players (no answer key).
create function private.public_question(q public.questions) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', q.id, 'round', q.round, 'category', q.category, 'difficulty', q.difficulty,
    'body', q.body, 'options', case when q.round = 'quickfire' then q.options end,
    'duration_sec', q.duration_sec, 'points_correct', q.points_correct, 'points_wrong', q.points_wrong)
$$;

-- ---------------------------------------------------------------------------
-- Player RPCs
-- ---------------------------------------------------------------------------

-- Place or change this homegroup's wager while the wager phase is open.
create function public.submit_wager(p_buzzer_token text, p_amount int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_bs      public.buzzer_sessions;
  v_session public.game_sessions;
  v_cap     int;
begin
  update public.buzzer_sessions set heartbeat_at = now()
   where token_hash = private.hash(p_buzzer_token)
  returning * into v_bs;
  if not found then
    raise exception 'BUZZER_REVOKED';
  end if;

  select * into v_session from public.game_sessions where id = v_bs.session_id for update;
  if v_session.status <> 'live' then
    raise exception 'GAME_NOT_LIVE';
  end if;
  if v_session.round <> 'final' or v_session.phase <> 'wager' then
    raise exception 'WAGER_CLOSED';
  end if;
  if v_session.question_deadline is not null
     and clock_timestamp() > v_session.question_deadline + interval '1.5 seconds' then
    raise exception 'DEADLINE_PASSED';
  end if;

  v_cap := private.wager_cap(v_bs.homegroup_id);
  if p_amount is null or p_amount < 0 then
    raise exception 'INVALID_WAGER';
  end if;
  if p_amount > v_cap then
    raise exception 'WAGER_TOO_HIGH';
  end if;

  insert into public.final_wagers (session_id, question_id, homegroup_id, amount, max_allowed)
  values (v_session.id, v_session.current_question_id, v_bs.homegroup_id, p_amount, v_cap)
  on conflict (question_id, homegroup_id) do update
     set amount = excluded.amount, max_allowed = excluded.max_allowed, updated_at = now();

  update public.game_sessions
     set wagered_hgs = case when v_bs.homegroup_id = any (wagered_hgs) then wagered_hgs
                            else wagered_hgs || v_bs.homegroup_id end
   where id = v_session.id;

  return jsonb_build_object('amount', p_amount, 'max', v_cap);
end;
$$;

-- This homegroup's wager on the current question (amount null if none yet) and its cap.
create function public.get_my_wager(p_buzzer_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_bs     public.buzzer_sessions;
  v_qid    uuid;
  v_amount int;
begin
  select * into v_bs from public.buzzer_sessions where token_hash = private.hash(p_buzzer_token);
  if not found then
    raise exception 'BUZZER_REVOKED';
  end if;
  select current_question_id into v_qid from public.game_sessions where id = v_bs.session_id;
  select amount into v_amount from public.final_wagers
   where question_id = v_qid and homegroup_id = v_bs.homegroup_id;
  return jsonb_build_object('question_id', v_qid, 'amount', v_amount, 'max', private.wager_cap(v_bs.homegroup_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

-- Final questions now open with a wager phase (category only) instead of the question.
create or replace function public.admin_show_question(p_session_id uuid, p_question_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_q       public.questions;
  v_no      int;
begin
  perform private.require_admin();
  select * into v_session from public.game_sessions where id = p_session_id for update;
  select * into v_q from public.questions where id = p_question_id;
  if not found or v_q.pack <> v_session.pack or v_q.round <> v_session.round then
    raise exception 'QUESTION_NOT_IN_ROUND';
  end if;
  perform private.recompute_quickfire(p_session_id);

  select n into v_no from (
    select id, row_number() over (order by order_no, created_at) n
      from public.questions where pack = v_q.pack and round = v_q.round) t
   where t.id = v_q.id;

  if v_q.round = 'final' then
    -- Re-showing a final question starts its wagers over.
    delete from public.final_wagers where session_id = p_session_id and question_id = v_q.id;
  end if;

  update public.game_sessions
     set phase = case when v_q.round = 'final' then 'wager' else 'question' end,
         current_question_id = v_q.id,
         question_no = v_no,
         public_question = case when v_q.round = 'final'
           then jsonb_build_object('id', v_q.id, 'round', v_q.round, 'category', v_q.category,
                                   'difficulty', v_q.difficulty, 'body', null, 'options', null,
                                   'duration_sec', v_q.duration_sec, 'wager_sec', 20)
           else private.public_question(v_q) end,
         reveal = null,
         question_started_at = clock_timestamp(),
         -- Quick Fire and the wager phase start their timer now; buzzer rounds start it when the buzzer opens.
         question_deadline = case v_q.round
                               when 'quickfire' then clock_timestamp() + make_interval(secs => v_q.duration_sec)
                               when 'final' then clock_timestamp() + interval '20 seconds' end,
         shown_question_ids = case when v_q.id = any (shown_question_ids) then shown_question_ids
                                   else shown_question_ids || v_q.id end,
         wagered_hgs = '{}',
         buzzer_state = 'closed', buzzer_winner_hg = null, buzzer_excluded = '{}', last_judgement = null
   where id = p_session_id;
end;
$$;

-- Close wagering and show the question. Homegroups without a positive wager sit this one out.
create function public.admin_lock_wagers(p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_q       public.questions;
begin
  perform private.require_admin();
  select * into v_session from public.game_sessions where id = p_session_id for update;
  if v_session.round <> 'final' or v_session.phase <> 'wager' then
    raise exception 'WAGER_CLOSED';
  end if;
  select * into v_q from public.questions where id = v_session.current_question_id;

  update public.game_sessions
     set phase = 'question',
         public_question = private.public_question(v_q),
         question_started_at = clock_timestamp(),
         question_deadline = null,
         buzzer_excluded = coalesce((
           select array_agg(h.id) from public.homegroups h
            where h.session_id = p_session_id
              and not exists (select 1 from public.final_wagers w
                               where w.question_id = v_q.id and w.homegroup_id = h.id and w.amount > 0)), '{}')
   where id = p_session_id;
end;
$$;

-- Final answers score ± the homegroup's wager instead of the question's fixed points.
create or replace function public.admin_judge_buzz(p_session_id uuid, p_result text, p_reopen boolean default false) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_q       public.questions;
  v_attempt public.buzzer_attempts;
  v_delta   int;
  v_wager   int;
  v_hg_name text;
begin
  perform private.require_admin();
  if p_result not in ('correct', 'wrong', 'void') then
    raise exception 'INVALID_RESULT';
  end if;
  select * into v_session from public.game_sessions where id = p_session_id for update;
  if v_session.buzzer_state <> 'locked' or v_session.buzzer_winner_hg is null then
    raise exception 'NOTHING_TO_JUDGE';
  end if;
  select * into v_q from public.questions where id = v_session.current_question_id;
  select * into v_attempt from public.buzzer_attempts
   where session_id = p_session_id and buzzer_seq = v_session.buzzer_seq and result = 'pending'
   for update;
  if not found then
    raise exception 'NOTHING_TO_JUDGE';
  end if;

  if v_q.round = 'final' then
    select amount into v_wager from public.final_wagers
     where question_id = v_q.id and homegroup_id = v_attempt.homegroup_id;
    v_wager := coalesce(v_wager, 0);
    v_delta := case p_result when 'correct' then v_wager when 'wrong' then -v_wager else 0 end;
    update public.final_wagers set result = p_result, updated_at = now()
     where question_id = v_q.id and homegroup_id = v_attempt.homegroup_id;
  else
    v_delta := case p_result when 'correct' then v_q.points_correct
                             when 'wrong' then -v_q.points_wrong
                             else 0 end;
  end if;

  update public.buzzer_attempts set result = p_result, judged_by = auth.uid(), judged_at = now()
   where id = v_attempt.id;

  if v_delta <> 0 then
    select name into v_hg_name from public.homegroups where id = v_attempt.homegroup_id;
    insert into public.score_events (session_id, homegroup_id, delta, source, reason, attempt_id, question_id, admin_id)
    values (p_session_id, v_attempt.homegroup_id, v_delta,
            case when v_q.round = 'final' then 'final' else 'buzzer' end,
            format('%s soal #%s: %s%s', initcap(v_q.round), v_session.question_no,
                   case when p_result = 'correct' then 'benar' else 'salah' end,
                   case when v_q.round = 'final' then format(' (taruhan %s)', v_wager) else '' end),
            v_attempt.id, v_q.id, auth.uid());
  end if;

  update public.game_sessions
     set last_judgement = jsonb_build_object('homegroup_id', v_attempt.homegroup_id, 'result', p_result,
                                             'delta', v_delta, 'seq', v_session.buzzer_seq),
         buzzer_winner_hg = null,
         buzzer_excluded = case when p_result = 'wrong' then buzzer_excluded || v_attempt.homegroup_id
                                else buzzer_excluded end,
         buzzer_state = case when p_result = 'wrong' and p_reopen then 'open' else 'closed' end,
         buzzer_seq = case when p_result = 'wrong' and p_reopen then buzzer_seq + 1 else buzzer_seq end,
         question_deadline = case
           when p_result = 'wrong' and p_reopen
             then clock_timestamp() + make_interval(secs => greatest(v_q.duration_sec / 2, 10))
           else question_deadline end
   where id = p_session_id;

  if p_result = 'correct' then
    perform public.admin_reveal(p_session_id);
  end if;
end;
$$;

-- The reveal of a final question also unveils every homegroup's wager.
create or replace function public.admin_reveal(p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_q       public.questions;
  v_counts  jsonb;
  v_total   int;
begin
  perform private.require_admin();
  select * into v_session from public.game_sessions where id = p_session_id for update;
  select * into v_q from public.questions where id = v_session.current_question_id;
  if not found then
    raise exception 'NO_ACTIVE_QUESTION';
  end if;

  if v_q.round = 'quickfire' then
    select jsonb_build_array(
             count(*) filter (where choice = 0), count(*) filter (where choice = 1),
             count(*) filter (where choice = 2), count(*) filter (where choice = 3)),
           count(*)
      into v_counts, v_total
      from public.participant_answers where session_id = p_session_id and question_id = v_q.id;
    perform private.recompute_quickfire(p_session_id);
  end if;

  update public.game_sessions
     set phase = 'reveal',
         buzzer_state = 'closed',
         public_question = case when v_q.round = 'final' then private.public_question(v_q) else public_question end,
         question_deadline = least(question_deadline, clock_timestamp()),
         reveal = jsonb_build_object(
           'question_id', v_q.id,
           'correct_option', case when v_q.round = 'quickfire' then v_q.correct_option end,
           'answer_text', v_q.answer_text,
           'counts', v_counts,
           'answered', v_total,
           'roster', (select coalesce(sum(member_count), 0) from public.homegroups where session_id = p_session_id),
           'wagers', case when v_q.round = 'final' then (
             select coalesce(jsonb_agg(jsonb_build_object('homegroup_id', w.homegroup_id, 'amount', w.amount, 'result', w.result)
                                       order by w.amount desc), '[]'::jsonb)
               from public.final_wagers w
              where w.session_id = p_session_id and w.question_id = v_q.id) end)
   where id = p_session_id;
end;
$$;

-- Dashboard gains the current question's wagers (admins see amounts live).
create or replace function public.admin_dashboard(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_session public.game_sessions;
begin
  perform private.require_admin();
  select * into v_session from public.game_sessions where id = p_session_id;
  return jsonb_build_object(
    'homegroups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id, 'name', h.name, 'color', h.color, 'sort_order', h.sort_order,
               'join_code', c.join_code, 'has_buzzer_code', c.buzzer_code_hash is not null,
               'joined', (select count(*) from public.participants p where p.homegroup_id = h.id and p.token_hash is not null),
               'online', (select count(*) from public.participants p
                           where p.homegroup_id = h.id and p.last_seen_at > now() - interval '30 seconds'),
               'answered', (select count(*) from public.participant_answers a
                             where a.homegroup_id = h.id and a.question_id = v_session.current_question_id),
               'buzzer', (select jsonb_build_object(
                                   'holder', p.name, 'heartbeat_at', b.heartbeat_at,
                                   'alive', b.heartbeat_at > now() - interval '15 seconds')
                            from public.buzzer_sessions b left join public.participants p on p.id = b.participant_id
                           where b.homegroup_id = h.id),
               'members', coalesce((
                 select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                                    'joined', p.token_hash is not null, 'last_seen_at', p.last_seen_at)
                                  order by p.name)
                   from public.participants p where p.homegroup_id = h.id), '[]'::jsonb))
             order by h.sort_order, h.name)
        from public.homegroups h left join public.homegroup_credentials c on c.homegroup_id = h.id
       where h.session_id = p_session_id), '[]'::jsonb),
    'current_question', (select to_jsonb(q) from public.questions q where q.id = v_session.current_question_id),
    'attempts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.id)
        from public.buzzer_attempts a
       where a.session_id = p_session_id and a.question_id = v_session.current_question_id), '[]'::jsonb),
    'wagers', coalesce((
      select jsonb_agg(jsonb_build_object('homegroup_id', w.homegroup_id, 'amount', w.amount,
                                          'max_allowed', w.max_allowed, 'result', w.result))
        from public.final_wagers w
       where w.session_id = p_session_id and w.question_id = v_session.current_question_id), '[]'::jsonb),
    'score_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.id desc)
        from (select * from public.score_events where session_id = p_session_id order by id desc limit 200) e),
      '[]'::jsonb));
end;
$$;

create or replace function public.admin_reset_session(p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  delete from public.score_events where session_id = p_session_id;
  delete from public.final_wagers where session_id = p_session_id;
  delete from public.buzzer_attempts where session_id = p_session_id;
  delete from public.participant_answers where session_id = p_session_id;
  delete from public.buzzer_sessions where session_id = p_session_id;
  update public.homegroups set quickfire_score = 0, battle_score = 0, buzzer_holder = null
   where session_id = p_session_id;
  update public.game_sessions
     set status = 'lobby', round = 'lobby', phase = 'idle', current_question_id = null,
         question_no = 0, question_total = 0, question_started_at = null, question_deadline = null,
         public_question = null, reveal = null, shown_question_ids = '{}', wagered_hgs = '{}',
         buzzer_state = 'closed', buzzer_winner_hg = null, buzzer_locked_at = null,
         buzzer_excluded = '{}', last_judgement = null, message = null
   where id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges (new functions only; replaced ones keep their grants)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.submit_wager(text, int),
  public.get_my_wager(text),
  public.admin_lock_wagers(uuid)
from public, anon, authenticated;

grant execute on function public.submit_wager(text, int), public.get_my_wager(text) to anon, authenticated;
grant execute on function public.admin_lock_wagers(uuid) to authenticated;
