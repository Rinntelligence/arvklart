-- Valgfri begrunnelse på eget ønske (D2): arvingen kan legge til, endre og fjerne begrunnelsen
-- etter at ønsket er registrert. Før dette fantes ingen UPDATE-policy på interests, så en oppdatering
-- traff 0 rader uten feilmelding.
--
-- Bare egen rad kan endres (RLS), og bare kolonnen reason (kolonnerettighet), slik at item_id,
-- user_id og created_at aldri kan flyttes eller endres. Begrunnelsen er synlig for alle i boet.
-- Lengden begrenses også i databasen (samme grense som skjemaene i appen, 1000 tegn).
-- Kan kjøres flere ganger.

drop policy if exists "interests_update" on public.interests;
create policy "interests_update" on public.interests for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_estate_member(public.item_estate_id(item_id)));

revoke update on public.interests from anon, authenticated;
grant update (reason) on public.interests to authenticated;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'interests_reason_len' and conrelid = 'public.interests'::regclass) then
    alter table public.interests add constraint interests_reason_len
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;
-- Stopper hele migreringen hvis en eksisterende begrunnelse er lengre enn grensen
alter table public.interests validate constraint interests_reason_len;
