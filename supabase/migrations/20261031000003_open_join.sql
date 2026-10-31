-- Joining no longer needs a homegroup code. Participants pick their homegroup and
-- their name; the buzzer code still gates the buzzer.
--
-- To stop people from taking over someone else's name, a name that is already
-- signed in on a device is locked. The participant frees it by leaving
-- (leave_game), or an admin frees it (admin_reset_participant), e.g. after a
-- phone change. homegroup_credentials.join_code stays but is no longer checked.

drop function public.join_game(text, uuid, text, uuid, text);

create function public.join_game(
  p_code text, p_homegroup_id uuid,
  p_participant_id uuid default null, p_new_name text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session public.game_sessions;
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

  if p_participant_id is not null then
    -- Atomic claim: of two devices picking the same free name, only one wins.
    update public.participants
       set token_hash = private.hash(v_token), joined_at = coalesce(joined_at, now()), last_seen_at = now()
     where id = p_participant_id and homegroup_id = p_homegroup_id and token_hash is null
    returning * into v_p;
    if not found then
      if exists (select 1 from public.participants where id = p_participant_id and homegroup_id = p_homegroup_id) then
        raise exception 'NAME_IN_USE';
      end if;
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

-- Frees a participant's name (and any buzzer they hold) so it can sign in again.
create function private.sign_out(p_participant_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_hg uuid;
begin
  update public.participants set token_hash = null where id = p_participant_id;
  delete from public.buzzer_sessions where participant_id = p_participant_id
  returning homegroup_id into v_hg;
  if v_hg is not null then
    update public.homegroups set buzzer_holder = null where id = v_hg;
  end if;
end;
$$;

-- "Keluar dari perangkat ini": frees my name for another device.
create function public.leave_game(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from public.participants where token_hash = private.hash(p_token);
  if v_id is not null then
    perform private.sign_out(v_id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin "Reset": signs a participant out of whatever device holds their name.
create function public.admin_reset_participant(p_participant_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  perform private.sign_out(p_participant_id);
end;
$$;

-- Resetting a session (e.g. after the rehearsal) also signs every device out, so
-- names used during the rehearsal are not left locked for the real game.
create or replace function public.admin_reset_session(p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  delete from public.score_events where session_id = p_session_id;
  delete from public.final_wagers where session_id = p_session_id;
  delete from public.buzzer_attempts where session_id = p_session_id;
  delete from public.participant_answers where session_id = p_session_id;
  delete from public.buzzer_sessions where session_id = p_session_id;
  update public.participants set token_hash = null where session_id = p_session_id;
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

revoke execute on function
  public.join_game(text, uuid, uuid, text),
  public.leave_game(text),
  public.admin_reset_participant(uuid)
from public, anon, authenticated;

grant execute on function public.join_game(text, uuid, uuid, text), public.leave_game(text) to anon, authenticated;
grant execute on function public.admin_reset_participant(uuid) to authenticated;
