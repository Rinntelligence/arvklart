-- Rull tilbake 20261020_distribution_approval.sql: fjerner forslag, svar, representasjon og
-- beslutningstakere. Deploy forrige frontend først. Forslag og svar slettes – ta en kopi (eller last ned
-- protokollene) hvis de skal beholdes.
begin;
-- Demo-nullstillingen: ta ut linjene som rydder forslag og representasjon
do $$
declare def text;
begin
  def := pg_get_functiondef('public.reset_demo_estate()'::regprocedure);
  def := replace(def, '  delete from distribution_versions where estate_id = v_estate;
  update heir_representatives set revoked_at = coalesce(revoked_at, now()) where estate_id = v_estate;
', '');
  execute def;
end $$;
drop trigger if exists guard_heir_delete on public.heirs;
drop trigger if exists log_heir_change on public.heirs;
drop function if exists public.guard_heir_change();
drop function if exists public.respond_distribution(uuid, uuid, text, text, uuid);
drop function if exists public.distribution_status(uuid);
drop function if exists public.propose_distribution(uuid);
drop function if exists public.distribution_state_hash(uuid);
drop function if exists public.distribution_state(uuid);
drop table if exists public.distribution_responses;
drop table if exists public.distribution_versions;
drop function if exists public.guard_distribution_immutable();
drop function if exists public.revoke_representative(uuid);
drop function if exists public.verify_representative(uuid);
drop function if exists public.add_representative(uuid, uuid, text, text, uuid);
drop table if exists public.heir_representatives;
drop function if exists public.confirm_decider_removal(uuid);
drop function if exists public.set_must_approve(uuid, boolean, text);
drop function if exists public.is_estate_decider(uuid, uuid);
alter table public.heirs drop column if exists exclusion_requested_by, drop column if exists exclusion_reason, drop column if exists exclusion_requested_at, drop column if exists must_approve;
delete from public.protected_columns where table_name = 'heirs' and column_name in ('must_approve', 'exclusion_requested_by', 'exclusion_reason', 'exclusion_requested_at');
select public.apply_update_grants('heirs', public.protected_heir_columns());
create or replace function public.guard_heir_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and (new.user_id is not null or new.linked_via is not null or new.linked_at is not null) then
    raise exception 'Koblingen til en konto settes bare når arvingen selv blir med' using errcode = '42501';
  end if;
  return new;
end;
$$;
-- Kontosletting: uten svarene over (versjonen fra 20261017)
create or replace function public.anonymize_estate_events(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update estate_events set data = replace(data::text, p_user::text, '00000000-0000-0000-0000-000000000000')::jsonb
  where data::text like '%' || p_user::text || '%';
  get diagnostics n = row_count;
  return n;
end;
$$;
notify pgrst, 'reload schema';
commit;
