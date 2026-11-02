-- Resetting a session returns it to a fresh lobby, so the roster opens again and
-- participants can type their own names (it locks automatically when Quick Fire starts).
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
     set status = 'lobby', round = 'lobby', phase = 'idle', roster_locked = false, current_question_id = null,
         question_no = 0, question_total = 0, question_started_at = null, question_deadline = null,
         public_question = null, reveal = null, shown_question_ids = '{}', wagered_hgs = '{}',
         buzzer_state = 'closed', buzzer_winner_hg = null, buzzer_locked_at = null,
         buzzer_excluded = '{}', last_judgement = null, message = null
   where id = p_session_id;
end;
$$;
