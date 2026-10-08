-- cleanup_old_closed_estates() ble lagt inn direkte i produksjon (migreringen estate_closed_at_and_cleanup,
-- 2026-09-21) og finnes ikke i repoet. Den er SECURITY DEFINER og sletter gjenstander, interesser og
-- kommentarer i bo som har vært avsluttet i over 12 måneder, men ikke bildene. Alle kunne kalle den,
-- også uten innlogging. Ingen kode eller cron-jobb bruker den; sletting av avsluttede bo går via
-- edge-funksjonen cleanup-closed-estates (service role). Kjørt i produksjon 2026-10-08.

do $$
begin
  if to_regprocedure('public.cleanup_old_closed_estates()') is not null then
    revoke execute on function public.cleanup_old_closed_estates() from public, anon, authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
