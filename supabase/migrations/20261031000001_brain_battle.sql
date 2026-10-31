-- Brain Battle — schema, security model, and authoritative RPCs.
--
-- Security model
--   * Participants and buzzer devices are anonymous (no Supabase Auth). They hold
--     random tokens issued by RPCs; only SHA-256 hashes are stored.
--   * Anonymous clients can SELECT only `game_sessions` and `homegroups` (public
--     state, no secrets). Everything else goes through SECURITY DEFINER RPCs.
--   * Admins are Supabase Auth users listed in `admins`. Admin RPCs check is_admin().
--   * Answer keys never leave the server until the reveal phase writes them into
--     `game_sessions.reveal`.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.questions (
  id             uuid primary key default gen_random_uuid(),
  pack           text not null check (pack in ('A', 'B')),
  round          text not null check (round in ('quickfire', 'buzzer', 'final')),
  order_no       int  not null default 0,
  category       text not null default 'Umum',
  difficulty     text not null default 'sedang' check (difficulty in ('mudah', 'sedang', 'sulit')),
  body           text not null,
  options        jsonb,          -- quickfire: array of exactly 4 strings
  correct_option smallint,       -- quickfire: 0..3
  answer_text    text,           -- buzzer/final: answer key read by the admin
  duration_sec   int  not null default 20 check (duration_sec between 5 and 300),
  points_correct int  not null default 100,
  points_wrong   int  not null default 0 check (points_wrong >= 0),
  created_at     timestamptz not null default now(),
  constraint quickfire_shape check (
    round <> 'quickfire' or (
      jsonb_typeof(options) = 'array'
      and jsonb_array_length(options) = 4
      and correct_option between 0 and 3
    )
  )
);
create index questions_pack_round on public.questions (pack, round, order_no);

create table public.game_sessions (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  pack                text not null check (pack in ('A', 'B')),
  status              text not null default 'lobby' check (status in ('lobby', 'live', 'paused', 'finished')),
  round               text not null default 'lobby' check (round in ('lobby', 'quickfire', 'buzzer', 'final', 'results')),
  phase               text not null default 'idle' check (phase in ('idle', 'question', 'reveal')),
  roster_locked       boolean not null default false,
  current_question_id uuid references public.questions (id) on delete set null,
  question_no         int not null default 0,
  question_total      int not null default 0,
  question_started_at timestamptz,
  question_deadline   timestamptz,
  public_question     jsonb,      -- question without the answer key
  reveal              jsonb,      -- set only during the reveal phase
  shown_question_ids  uuid[] not null default '{}',
  buzzer_state        text not null default 'closed' check (buzzer_state in ('closed', 'open', 'locked')),
  buzzer_seq          int not null default 0,   -- bumps on every open; stale presses are ignored
  buzzer_winner_hg    uuid,
  buzzer_locked_at    timestamptz,
  buzzer_excluded     uuid[] not null default '{}',
  last_judgement      jsonb,      -- {homegroup_id, result, delta} of the latest buzzer verdict
  message             text,
  updated_at          timestamptz not null default now()
);

create table public.homegroups (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.game_sessions (id) on delete cascade,
  name            text not null,
  color           text not null default '#6366f1',
  sort_order      int  not null default 0,
  member_count    int  not null default 0,          -- official roster size (trigger-maintained)
  quickfire_score numeric(8, 2) not null default 0, -- average across official roster
  battle_score    int  not null default 0,          -- sum of score_events
  total_score     numeric(8, 2) generated always as (quickfire_score + battle_score) stored,
  buzzer_holder   text,                             -- display name of current buzzer operator
  unique (session_id, name)
);
create index homegroups_session on public.homegroups (session_id);

-- Secrets per homegroup. Never readable by anonymous clients.
create table public.homegroup_credentials (
  homegroup_id     uuid primary key references public.homegroups (id) on delete cascade,
  join_code        text not null,  -- shared with the whole homegroup, shown to admins
  buzzer_code_hash text,           -- only the hash; the code is shown once when generated
  updated_at       timestamptz not null default now()
);

create table public.participants (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.game_sessions (id) on delete cascade,
  homegroup_id uuid not null references public.homegroups (id) on delete cascade,
  name         text not null,
  token_hash   text,
  joined_at    timestamptz,
  last_seen_at timestamptz,
  unique (homegroup_id, name)
);
create index participants_session on public.participants (session_id);
create unique index participants_token on public.participants (token_hash);

create table public.participant_answers (
  id             bigint generated always as identity primary key,
  session_id     uuid not null references public.game_sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  homegroup_id   uuid not null references public.homegroups (id) on delete cascade,
  question_id    uuid not null references public.questions (id) on delete cascade,
  choice         smallint not null check (choice between 0 and 3),
  is_correct     boolean not null,
  score          int not null,
  submitted_at   timestamptz not null default clock_timestamp(),
  unique (participant_id, question_id)
);
create index answers_session_question on public.participant_answers (session_id, question_id);

-- One row per homegroup = at most one active buzzer device per homegroup.
create table public.buzzer_sessions (
  homegroup_id   uuid primary key references public.homegroups (id) on delete cascade,
  session_id     uuid not null references public.game_sessions (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete set null,
  token_hash     text not null unique,
  claimed_at     timestamptz not null default now(),
  heartbeat_at   timestamptz not null default now()
);

create table public.buzzer_attempts (
  id             bigint generated always as identity primary key,
  session_id     uuid not null references public.game_sessions (id) on delete cascade,
  question_id    uuid not null references public.questions (id) on delete cascade,
  homegroup_id   uuid not null references public.homegroups (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete set null,
  buzzer_seq     int not null,
  pressed_at     timestamptz not null default clock_timestamp(),
  result         text not null default 'pending' check (result in ('pending', 'correct', 'wrong', 'void')),
  judged_by      uuid,
  judged_at      timestamptz,
  unique (session_id, buzzer_seq)
);

-- Append-only score ledger for buzzer rounds and manual corrections.
create table public.score_events (
  id           bigint generated always as identity primary key,
  session_id   uuid not null references public.game_sessions (id) on delete cascade,
  homegroup_id uuid not null references public.homegroups (id) on delete cascade,
  delta        int  not null,
  source       text not null check (source in ('buzzer', 'final', 'manual')),
  reason       text not null,
  attempt_id   bigint references public.buzzer_attempts (id) on delete set null,
  question_id  uuid references public.questions (id) on delete set null,
  admin_id     uuid,
  created_at   timestamptz not null default now()
);
create index score_events_hg on public.score_events (homegroup_id);

-- ---------------------------------------------------------------------------
-- Internal helpers (private schema: not exposed through the API)
-- ---------------------------------------------------------------------------

create function private.hash(p text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

create function private.new_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

create function private.norm_code(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '\s', '', 'g'));
$$;

create function private.buzzer_hash(p_homegroup uuid, p_code text) returns text
language sql immutable as $$
  select private.hash(p_homegroup::text || ':' || private.norm_code(p_code));
$$;

create function private.participant_by_token(p_token text) returns public.participants
language plpgsql stable security definer set search_path = public as $$
declare
  v public.participants;
begin
  select * into v from public.participants where token_hash = private.hash(p_token);
  if not found then
    raise exception 'INVALID_TOKEN';
  end if;
  return v;
end;
$$;

-- Quick Fire HG score = sum of member scores / official roster size.
create function private.recompute_quickfire(p_session uuid) returns void
language sql security definer set search_path = public as $$
  update public.homegroups h
     set quickfire_score = round(
           coalesce((select sum(a.score) from public.participant_answers a where a.homegroup_id = h.id), 0)::numeric
           / greatest(h.member_count, 1), 2)
   where h.session_id = p_session;
$$;

create function private.on_participants_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.homegroups h
     set member_count = (select count(*) from public.participants p where p.homegroup_id = h.id)
   where h.id in (coalesce(new.homegroup_id, old.homegroup_id), coalesce(old.homegroup_id, new.homegroup_id));
  return null;
end;
$$;
create trigger participants_count after insert or delete or update of homegroup_id on public.participants
  for each row execute function private.on_participants_change();

create function private.on_score_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.homegroups h
     set battle_score = coalesce((select sum(delta) from public.score_events e where e.homegroup_id = h.id), 0)
   where h.id = coalesce(new.homegroup_id, old.homegroup_id);
  return null;
end;
$$;
create trigger score_events_total after insert or delete on public.score_events
  for each row execute function private.on_score_event();

create function private.touch_session() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger game_sessions_touch before update on public.game_sessions
  for each row execute function private.touch_session();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function private.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.admins                enable row level security;
alter table public.questions             enable row level security;
alter table public.game_sessions         enable row level security;
alter table public.homegroups            enable row level security;
alter table public.homegroup_credentials enable row level security;
alter table public.participants          enable row level security;
alter table public.participant_answers   enable row level security;
alter table public.buzzer_sessions       enable row level security;
alter table public.buzzer_attempts       enable row level security;
alter table public.score_events          enable row level security;

create policy "public read" on public.game_sessions for select using (true);
create policy "public read" on public.homegroups    for select using (true);

create policy "admin read"  on public.admins for select using (public.is_admin());
create policy "admin all"   on public.questions for all using (public.is_admin()) with check (public.is_admin());
create policy "admin read"  on public.homegroup_credentials for select using (public.is_admin());
create policy "admin read"  on public.participants for select using (public.is_admin());
create policy "admin read"  on public.participant_answers for select using (public.is_admin());
create policy "admin read"  on public.buzzer_sessions for select using (public.is_admin());
create policy "admin read"  on public.buzzer_attempts for select using (public.is_admin());
create policy "admin read"  on public.score_events for select using (public.is_admin());

-- Explicit grants, so this works even when new tables are not auto-exposed to the API.
grant usage on schema public to anon, authenticated;
grant select on public.game_sessions, public.homegroups to anon, authenticated;
grant select on public.admins, public.homegroup_credentials, public.participants, public.participant_answers,
  public.buzzer_sessions, public.buzzer_attempts, public.score_events to authenticated;
grant select, insert, update, delete on public.questions to authenticated;

-- Belt and braces: anonymous clients never write tables directly.
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke insert, update, delete, truncate on public.game_sessions, public.homegroups, public.admins,
  public.homegroup_credentials, public.participants, public.participant_answers,
  public.buzzer_sessions, public.buzzer_attempts, public.score_events from authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs (anon + authenticated)
-- ---------------------------------------------------------------------------

create function public.server_time() returns timestamptz
language sql volatile as $$
  select clock_timestamp();
$$;

-- Session + homegroups + roster names for the join screen.
create function public.get_join_info(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_session public.game_sessions;
begin
  select * into v_session from public.game_sessions where code = private.norm_code(p_code);
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id, 'code', v_session.code, 'name', v_session.name,
      'status', v_session.status, 'round', v_session.round, 'roster_locked', v_session.roster_locked),
    'homegroups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id, 'name', h.name, 'color', h.color,
               'members', coalesce((
                 select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'joined', p.token_hash is not null)
                                  order by p.name)
                   from public.participants p where p.homegroup_id = h.id), '[]'::jsonb))
             order by h.sort_order, h.name)
        from public.homegroups h where h.session_id = v_session.id), '[]'::jsonb));
end;
$$;

-- Join (or re-join from another device). Picks an official roster name, or adds a
-- new name while the roster is still open. Issuing a new token signs out the old device.
create function public.join_game(
  p_code text, p_homegroup_id uuid, p_join_code text,
  p_participant_id uuid default null, p_new_name text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_cred    public.homegroup_credentials;
  v_p       public.participants;
  v_token   text := private.new_token();
  v_name    text := btrim(regexp_replace(coalesce(p_new_name, ''), '\s+', ' ', 'g'));
begin
  select * into v_session from public.game_sessions where code = private.norm_code(p_code);
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not exists (select 1 from public.homegroups where id = p_homegroup_id and session_id = v_session.id) then
    raise exception 'HOMEGROUP_NOT_FOUND';
  end if;
  select * into v_cred from public.homegroup_credentials where homegroup_id = p_homegroup_id;
  if not found or private.norm_code(v_cred.join_code) <> private.norm_code(p_join_code) then
    raise exception 'WRONG_JOIN_CODE';
  end if;

  if p_participant_id is not null then
    update public.participants
       set token_hash = private.hash(v_token), joined_at = coalesce(joined_at, now()), last_seen_at = now()
     where id = p_participant_id and homegroup_id = p_homegroup_id
    returning * into v_p;
    if not found then
      raise exception 'PARTICIPANT_NOT_FOUND';
    end if;
  else
    if v_session.roster_locked then
      raise exception 'ROSTER_LOCKED';
    end if;
    if length(v_name) < 2 or length(v_name) > 40 then
      raise exception 'INVALID_NAME';
    end if;
    insert into public.participants (session_id, homegroup_id, name, token_hash, joined_at, last_seen_at)
    values (v_session.id, p_homegroup_id, v_name, private.hash(v_token), now(), now())
    on conflict (homegroup_id, name) do nothing
    returning * into v_p;
    if not found then
      raise exception 'NAME_TAKEN';
    end if;
  end if;

  return jsonb_build_object('token', v_token, 'participant_id', v_p.id, 'session_code', v_session.code);
end;
$$;

-- Who am I + my answer to the current question. Doubles as presence ping.
create function public.get_me(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_p       public.participants := private.participant_by_token(p_token);
  v_session public.game_sessions;
  v_hg      public.homegroups;
  v_choice  smallint;
  v_holder  uuid;
begin
  update public.participants set last_seen_at = now() where id = v_p.id;
  select * into v_session from public.game_sessions where id = v_p.session_id;
  select * into v_hg from public.homegroups where id = v_p.homegroup_id;
  select choice into v_choice from public.participant_answers
   where participant_id = v_p.id and question_id = v_session.current_question_id;
  select participant_id into v_holder from public.buzzer_sessions where homegroup_id = v_p.homegroup_id;
  return jsonb_build_object(
    'participant_id', v_p.id, 'name', v_p.name,
    'homegroup_id', v_hg.id, 'homegroup_name', v_hg.name, 'homegroup_color', v_hg.color,
    'session_id', v_session.id, 'session_code', v_session.code,
    'current_question_id', v_session.current_question_id, 'current_choice', v_choice,
    'holds_buzzer', v_holder is not null and v_holder = v_p.id);
end;
$$;

create function public.submit_answer(p_token text, p_question_id uuid, p_choice int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_p       public.participants := private.participant_by_token(p_token);
  v_session public.game_sessions;
  v_q       public.questions;
  v_ok      boolean;
  v_id      bigint;
begin
  select * into v_session from public.game_sessions where id = v_p.session_id;
  if v_session.status <> 'live' then
    raise exception 'GAME_NOT_LIVE';
  end if;
  if v_session.round <> 'quickfire' or v_session.phase <> 'question'
     or v_session.current_question_id is distinct from p_question_id then
    raise exception 'QUESTION_CLOSED';
  end if;
  -- 1.5 s grace absorbs network latency; the deadline itself is server time.
  if clock_timestamp() > v_session.question_deadline + interval '1.5 seconds' then
    raise exception 'DEADLINE_PASSED';
  end if;
  if p_choice is null or p_choice not between 0 and 3 then
    raise exception 'INVALID_CHOICE';
  end if;

  select * into v_q from public.questions where id = p_question_id;
  v_ok := v_q.correct_option = p_choice;

  insert into public.participant_answers (session_id, participant_id, homegroup_id, question_id, choice, is_correct, score)
  values (v_session.id, v_p.id, v_p.homegroup_id, p_question_id, p_choice, v_ok,
          case when v_ok then v_q.points_correct else 0 end)
  on conflict (participant_id, question_id) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'ALREADY_ANSWERED';
  end if;

  -- Correctness is deliberately not returned before the reveal.
  return jsonb_build_object('ok', true, 'choice', p_choice);
end;
$$;

-- Become the buzzer operator for my homegroup. A fresh heartbeat from another
-- participant blocks the claim; a stale one (device gone) can be taken over.
create function public.claim_buzzer(p_token text, p_buzzer_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_p     public.participants := private.participant_by_token(p_token);
  v_cred  public.homegroup_credentials;
  v_token text := private.new_token();
  v_hg    uuid;
begin
  select * into v_cred from public.homegroup_credentials where homegroup_id = v_p.homegroup_id;
  if not found or v_cred.buzzer_code_hash is null then
    raise exception 'BUZZER_NOT_CONFIGURED';
  end if;
  if v_cred.buzzer_code_hash <> private.buzzer_hash(v_p.homegroup_id, p_buzzer_code) then
    raise exception 'WRONG_BUZZER_CODE';
  end if;

  insert into public.buzzer_sessions (homegroup_id, session_id, participant_id, token_hash)
  values (v_p.homegroup_id, v_p.session_id, v_p.id, private.hash(v_token))
  on conflict (homegroup_id) do update
     set participant_id = excluded.participant_id, token_hash = excluded.token_hash,
         claimed_at = now(), heartbeat_at = now()
   where buzzer_sessions.heartbeat_at < now() - interval '15 seconds'
      or buzzer_sessions.participant_id is not distinct from excluded.participant_id
  returning homegroup_id into v_hg;
  if v_hg is null then
    raise exception 'BUZZER_IN_USE';
  end if;

  update public.homegroups set buzzer_holder = v_p.name where id = v_p.homegroup_id;
  return jsonb_build_object('buzzer_token', v_token);
end;
$$;

create function public.buzzer_heartbeat(p_buzzer_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_hg uuid;
begin
  update public.buzzer_sessions set heartbeat_at = now()
   where token_hash = private.hash(p_buzzer_token)
  returning homegroup_id into v_hg;
  return jsonb_build_object('ok', v_hg is not null);
end;
$$;

create function public.release_buzzer(p_buzzer_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_hg uuid;
begin
  delete from public.buzzer_sessions where token_hash = private.hash(p_buzzer_token)
  returning homegroup_id into v_hg;
  if v_hg is not null then
    update public.homegroups set buzzer_holder = null where id = v_hg;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- First press that reaches the server wins. The conditional UPDATE takes a row
-- lock on the session, so concurrent presses serialize and exactly one matches
-- buzzer_state = 'open'. p_seq must match the current opening, so a press made
-- for an earlier opening can never win a later one.
create function public.press_buzzer(p_buzzer_token text, p_seq int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_bs      public.buzzer_sessions;
  v_session public.game_sessions;
begin
  update public.buzzer_sessions set heartbeat_at = now()
   where token_hash = private.hash(p_buzzer_token)
  returning * into v_bs;
  if not found then
    raise exception 'BUZZER_REVOKED';
  end if;

  update public.game_sessions
     set buzzer_state = 'locked', buzzer_winner_hg = v_bs.homegroup_id, buzzer_locked_at = clock_timestamp()
   where id = v_bs.session_id
     and status = 'live'
     and round in ('buzzer', 'final')
     and phase = 'question'
     and buzzer_state = 'open'
     and buzzer_seq = p_seq
     and not (v_bs.homegroup_id = any (buzzer_excluded))
     and (question_deadline is null or clock_timestamp() <= question_deadline)
  returning * into v_session;

  if not found then
    select * into v_session from public.game_sessions where id = v_bs.session_id;
    return jsonb_build_object(
      'won', false,
      'reason', case
        when v_bs.homegroup_id = any (v_session.buzzer_excluded) then 'EXCLUDED'
        when v_session.buzzer_state = 'locked' then 'TOO_LATE'
        when v_session.buzzer_seq <> p_seq then 'STALE'
        else 'CLOSED' end,
      'winner', v_session.buzzer_winner_hg);
  end if;

  insert into public.buzzer_attempts (session_id, question_id, homegroup_id, participant_id, buzzer_seq)
  values (v_session.id, v_session.current_question_id, v_bs.homegroup_id, v_bs.participant_id, v_session.buzzer_seq);

  return jsonb_build_object('won', true, 'winner', v_bs.homegroup_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

create function public.admin_save_homegroup(
  p_session_id uuid, p_id uuid, p_name text, p_color text, p_join_code text, p_sort_order int default 0
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := p_id;
begin
  perform private.require_admin();
  if v_id is null then
    insert into public.homegroups (session_id, name, color, sort_order)
    values (p_session_id, btrim(p_name), p_color, p_sort_order) returning id into v_id;
  else
    update public.homegroups set name = btrim(p_name), color = p_color, sort_order = p_sort_order
     where id = v_id and session_id = p_session_id;
  end if;
  insert into public.homegroup_credentials (homegroup_id, join_code)
  values (v_id, private.norm_code(p_join_code))
  on conflict (homegroup_id) do update set join_code = excluded.join_code, updated_at = now();
  return v_id;
end;
$$;

create function public.admin_delete_homegroup(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  if exists (select 1 from public.homegroups h join public.game_sessions s on s.id = h.session_id
              where h.id = p_id and s.roster_locked) then
    raise exception 'ROSTER_LOCKED';
  end if;
  delete from public.homegroups where id = p_id;
end;
$$;

-- Replace a homegroup's official roster with the given names (roster must be open).
create function public.admin_set_roster(p_homegroup_id uuid, p_names text[]) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session uuid;
  v_names   text[];
begin
  perform private.require_admin();
  select h.session_id into v_session from public.homegroups h where h.id = p_homegroup_id;
  if exists (select 1 from public.game_sessions where id = v_session and roster_locked) then
    raise exception 'ROSTER_LOCKED';
  end if;
  select coalesce(array_agg(distinct n), '{}') into v_names
    from (select btrim(regexp_replace(x, '\s+', ' ', 'g')) n from unnest(p_names) x) t where n <> '';
  delete from public.participants where homegroup_id = p_homegroup_id and not (name = any (v_names));
  insert into public.participants (session_id, homegroup_id, name)
  select v_session, p_homegroup_id, n from unnest(v_names) n
  on conflict (homegroup_id, name) do nothing;
end;
$$;

create function public.admin_set_buzzer_code(p_homegroup_id uuid, p_code text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  if length(private.norm_code(p_code)) < 4 then
    raise exception 'CODE_TOO_SHORT';
  end if;
  update public.homegroup_credentials
     set buzzer_code_hash = private.buzzer_hash(p_homegroup_id, p_code), updated_at = now()
   where homegroup_id = p_homegroup_id;
  if not found then
    raise exception 'HOMEGROUP_NOT_FOUND';
  end if;
  -- A new code revokes whoever held the old one.
  delete from public.buzzer_sessions where homegroup_id = p_homegroup_id;
  update public.homegroups set buzzer_holder = null where id = p_homegroup_id;
end;
$$;

create function public.admin_lock_roster(p_session_id uuid, p_locked boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  update public.game_sessions set roster_locked = p_locked where id = p_session_id;
end;
$$;

create function public.admin_update_session(p_session_id uuid, p_name text, p_pack text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  update public.game_sessions set name = btrim(p_name), pack = p_pack where id = p_session_id;
end;
$$;

create function public.admin_set_status(p_session_id uuid, p_status text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  update public.game_sessions
     set status = p_status,
         buzzer_state = case when p_status = 'live' then buzzer_state else 'closed' end
   where id = p_session_id;
end;
$$;

create function public.admin_set_message(p_session_id uuid, p_message text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  update public.game_sessions set message = nullif(btrim(p_message), '') where id = p_session_id;
end;
$$;

-- Move to a round. Entering any playing round locks the roster so the Quick Fire
-- average uses a fixed official member count.
create function public.admin_set_round(p_session_id uuid, p_round text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  perform private.recompute_quickfire(p_session_id);
  update public.game_sessions
     set round = p_round,
         phase = 'idle',
         status = case when p_round = 'results' then 'finished'
                       when p_round = 'lobby' then status
                       else 'live' end,
         roster_locked = roster_locked or p_round <> 'lobby',
         current_question_id = null, public_question = null, reveal = null,
         question_no = 0,
         question_total = (select count(*) from public.questions q
                            where q.pack = game_sessions.pack and q.round = p_round),
         question_started_at = null, question_deadline = null,
         buzzer_state = 'closed', buzzer_winner_hg = null, buzzer_excluded = '{}', last_judgement = null
   where id = p_session_id;
end;
$$;

create function public.admin_show_question(p_session_id uuid, p_question_id uuid) returns void
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

  update public.game_sessions
     set phase = 'question',
         current_question_id = v_q.id,
         question_no = v_no,
         public_question = jsonb_build_object(
           'id', v_q.id, 'round', v_q.round, 'category', v_q.category, 'difficulty', v_q.difficulty,
           'body', v_q.body, 'options', case when v_q.round = 'quickfire' then v_q.options end,
           'duration_sec', v_q.duration_sec, 'points_correct', v_q.points_correct, 'points_wrong', v_q.points_wrong),
         reveal = null,
         question_started_at = clock_timestamp(),
         -- Quick Fire starts its timer now; buzzer rounds start it when the buzzer opens.
         question_deadline = case when v_q.round = 'quickfire'
                                  then clock_timestamp() + make_interval(secs => v_q.duration_sec) end,
         shown_question_ids = case when v_q.id = any (shown_question_ids) then shown_question_ids
                                   else shown_question_ids || v_q.id end,
         buzzer_state = 'closed', buzzer_winner_hg = null, buzzer_excluded = '{}', last_judgement = null
   where id = p_session_id;
end;
$$;

create function public.admin_extend_time(p_session_id uuid, p_seconds int) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  update public.game_sessions
     set question_deadline = greatest(question_deadline, clock_timestamp()) + make_interval(secs => p_seconds)
   where id = p_session_id and question_deadline is not null;
end;
$$;

create function public.admin_end_timer(p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  update public.game_sessions
     set question_deadline = clock_timestamp(),
         buzzer_state = case when buzzer_state = 'open' then 'closed' else buzzer_state end
   where id = p_session_id and question_deadline is not null;
end;
$$;

create function public.admin_reveal(p_session_id uuid) returns void
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
         question_deadline = least(question_deadline, clock_timestamp()),
         reveal = jsonb_build_object(
           'question_id', v_q.id,
           'correct_option', case when v_q.round = 'quickfire' then v_q.correct_option end,
           'answer_text', v_q.answer_text,
           'counts', v_counts,
           'answered', v_total,
           'roster', (select coalesce(sum(member_count), 0) from public.homegroups where session_id = p_session_id))
   where id = p_session_id;
end;
$$;

create function public.admin_open_buzzer(p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session public.game_sessions;
begin
  perform private.require_admin();
  select * into v_session from public.game_sessions where id = p_session_id for update;
  if v_session.round not in ('buzzer', 'final') or v_session.phase <> 'question' then
    raise exception 'BUZZER_NOT_AVAILABLE';
  end if;
  if v_session.status <> 'live' then
    raise exception 'GAME_NOT_LIVE';
  end if;
  update public.game_sessions
     set buzzer_state = 'open',
         buzzer_seq = buzzer_seq + 1,
         buzzer_winner_hg = null,
         buzzer_locked_at = null,
         question_deadline = clock_timestamp()
                             + make_interval(secs => coalesce((public_question ->> 'duration_sec')::int, 30))
   where id = p_session_id;
end;
$$;

create function public.admin_close_buzzer(p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  update public.game_sessions set buzzer_state = 'closed', buzzer_winner_hg = null
   where id = p_session_id and buzzer_state = 'open';
end;
$$;

-- Verdict on the oral answer of the homegroup that won the buzzer.
--   correct → +points, question moves to reveal
--   wrong   → −points, homegroup excluded from this question; optionally reopen
--   void    → no score change (e.g. MC error), buzzer closes, nobody excluded
create function public.admin_judge_buzz(p_session_id uuid, p_result text, p_reopen boolean default false) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session public.game_sessions;
  v_q       public.questions;
  v_attempt public.buzzer_attempts;
  v_delta   int;
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

  v_delta := case p_result when 'correct' then v_q.points_correct
                           when 'wrong' then -v_q.points_wrong
                           else 0 end;

  update public.buzzer_attempts set result = p_result, judged_by = auth.uid(), judged_at = now()
   where id = v_attempt.id;

  if v_delta <> 0 then
    select name into v_hg_name from public.homegroups where id = v_attempt.homegroup_id;
    insert into public.score_events (session_id, homegroup_id, delta, source, reason, attempt_id, question_id, admin_id)
    values (p_session_id, v_attempt.homegroup_id, v_delta,
            case when v_q.round = 'final' then 'final' else 'buzzer' end,
            format('%s soal #%s: %s', initcap(v_q.round), v_session.question_no,
                   case when p_result = 'correct' then 'benar' else 'salah' end),
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

create function public.admin_adjust_score(p_homegroup_id uuid, p_delta int, p_reason text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  insert into public.score_events (session_id, homegroup_id, delta, source, reason, admin_id)
  select h.session_id, h.id, p_delta, 'manual', btrim(p_reason), auth.uid()
    from public.homegroups h where h.id = p_homegroup_id;
end;
$$;

create function public.admin_force_release(p_homegroup_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  delete from public.buzzer_sessions where homegroup_id = p_homegroup_id;
  update public.homegroups set buzzer_holder = null where id = p_homegroup_id;
end;
$$;

-- Everything the control center needs in one round trip.
create function public.admin_dashboard(p_session_id uuid) returns jsonb
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
    'score_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.id desc)
        from (select * from public.score_events where session_id = p_session_id order by id desc limit 200) e),
      '[]'::jsonb));
end;
$$;

-- Wipe all play data for a session (keeps homegroups, roster, codes, questions).
create function public.admin_reset_session(p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  delete from public.score_events where session_id = p_session_id;
  delete from public.buzzer_attempts where session_id = p_session_id;
  delete from public.participant_answers where session_id = p_session_id;
  delete from public.buzzer_sessions where session_id = p_session_id;
  update public.homegroups set quickfire_score = 0, battle_score = 0, buzzer_holder = null
   where session_id = p_session_id;
  update public.game_sessions
     set status = 'lobby', round = 'lobby', phase = 'idle', current_question_id = null,
         question_no = 0, question_total = 0, question_started_at = null, question_deadline = null,
         public_question = null, reveal = null, shown_question_ids = '{}',
         buzzer_state = 'closed', buzzer_winner_hg = null, buzzer_locked_at = null,
         buzzer_excluded = '{}', last_judgement = null, message = null
   where id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.server_time(),
  public.get_join_info(text),
  public.join_game(text, uuid, text, uuid, text),
  public.get_me(text),
  public.submit_answer(text, uuid, int),
  public.claim_buzzer(text, text),
  public.buzzer_heartbeat(text),
  public.release_buzzer(text),
  public.press_buzzer(text, int),
  public.is_admin()
to anon, authenticated;

grant execute on function
  public.admin_save_homegroup(uuid, uuid, text, text, text, int),
  public.admin_delete_homegroup(uuid),
  public.admin_set_roster(uuid, text[]),
  public.admin_set_buzzer_code(uuid, text),
  public.admin_lock_roster(uuid, boolean),
  public.admin_update_session(uuid, text, text),
  public.admin_set_status(uuid, text),
  public.admin_set_message(uuid, text),
  public.admin_set_round(uuid, text),
  public.admin_show_question(uuid, uuid),
  public.admin_extend_time(uuid, int),
  public.admin_end_timer(uuid),
  public.admin_reveal(uuid),
  public.admin_open_buzzer(uuid),
  public.admin_close_buzzer(uuid),
  public.admin_judge_buzz(uuid, text, boolean),
  public.admin_adjust_score(uuid, int, text),
  public.admin_force_release(uuid),
  public.admin_dashboard(uuid),
  public.admin_reset_session(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: clients subscribe to the public state tables.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.game_sessions, public.homegroups;
