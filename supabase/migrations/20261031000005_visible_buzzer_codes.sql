-- Buzzer codes stay the same and stay visible to admins, so they can be printed
-- or looked up at any time instead of being regenerated. The plain code lives in
-- homegroup_credentials, which only admins can read (RLS); claims still check the hash.

alter table public.homegroup_credentials add column buzzer_code text;

create or replace function public.admin_set_buzzer_code(p_homegroup_id uuid, p_code text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_hash text := private.buzzer_hash(p_homegroup_id, p_code);
  v_old  text;
begin
  perform private.require_admin();
  if length(private.norm_code(p_code)) < 4 then
    raise exception 'CODE_TOO_SHORT';
  end if;
  select buzzer_code_hash into v_old from public.homegroup_credentials where homegroup_id = p_homegroup_id;
  if not found then
    raise exception 'HOMEGROUP_NOT_FOUND';
  end if;
  update public.homegroup_credentials
     set buzzer_code_hash = v_hash, buzzer_code = private.norm_code(p_code), updated_at = now()
   where homegroup_id = p_homegroup_id;
  -- A different code revokes whoever held the old one; re-saving the same code does not.
  if v_old is distinct from v_hash then
    delete from public.buzzer_sessions where homegroup_id = p_homegroup_id;
    update public.homegroups set buzzer_holder = null where id = p_homegroup_id;
  end if;
end;
$$;
