-- Rull tilbake 20261021_function_grants.sql: gir funksjonene de samme rettighetene som i produksjon før
-- migreringen (lest ut 2026-10-11), og fjerner den faste search_path. Tabellrettighetene på founders,
-- founder_audit_log, ai_usage, protected_columns og cleanup_runs gis ikke tilbake; RLS uten policies
-- stengte dem uansett, og ingen klient bruker dem.
begin;
do $$
declare
  f text;
begin
  -- Hadde EXECUTE for PUBLIC, anon og authenticated
  foreach f in array array[
    'public.distribution_status(uuid)', 'public.estate_is_open(uuid)', 'public.guard_distribution_immutable()',
    'public.guard_heir_change()', 'public.guard_heir_insert()', 'public.guard_item_insert()', 'public.guard_item_update()',
    'public.is_demo_user()', 'public.is_estate_admin(uuid)', 'public.is_estate_decider(uuid,uuid)', 'public.is_estate_member(uuid)',
    'public.is_estate_owner(uuid)', 'public.item_estate_id(uuid)', 'public.item_is_open(uuid)', 'public.log_wish_change()',
    'public.protect_profile_fields()', 'public.protected_heir_columns()', 'public.protected_item_columns()',
    'public.reset_shares_on_heir_change()', 'public.rls_auto_enable()', 'public.set_estate_closed_at()',
    'public.sync_profile_founder_flag()', 'public.try_uuid(text)'] loop
    if to_regprocedure(f) is not null then
      execute format('grant execute on routine %s to public, anon, authenticated', to_regprocedure(f));
    end if;
  end loop;
  grant execute on function public.shares_estate_with(uuid) to anon, authenticated;
  grant execute on function public.is_founder() to authenticated;

  alter function public.try_uuid(text) reset search_path;
  alter function public.is_demo_user() reset search_path;
  alter function public.protect_profile_fields() reset search_path;
  alter function public.guard_distribution_immutable() reset search_path;
  if to_regprocedure('public.set_estate_closed_at()') is not null then
    alter function public.set_estate_closed_at() reset search_path;
  end if;
  if to_regprocedure('public.cleanup_old_closed_estates()') is not null then
    alter function public.cleanup_old_closed_estates() reset search_path;
  end if;
end $$;
drop function if exists public.apply_function_grants();
drop table if exists public.client_functions;
notify pgrst, 'reload schema';
commit;
