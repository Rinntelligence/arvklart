-- F0: sikkerhetsretting før fordelingsfasen.
--
-- 1. Stemmene på verdi (enig/uenig og arvingenes verdiforslag) kunne skrives direkte av alle medlemmer,
--    også over andres stemmer. Nå skrives de bare av vote_item_value(), én stemme per person.
-- 2. Kolonnerettigheter på items: klientene får update bare på kolonnene de skal kunne endre.
--    Fordelingskritiske kolonner (stemmene her, tildeling og fordelingsverdier i senere migreringer)
--    endres bare av databasefunksjoner. Postgres håndhever dette uansett hva klienten sender, og nye
--    kolonner er beskyttet til de eksplisitt gis ut (se protected_item_columns()).
-- 3. Ønsker og «nei takk» kan ikke registreres på gjenstander som allerede er tildelt.
--
-- Kan kjøres flere ganger.

-- ── Kolonnerettigheter ──────────────────────────────────────────────────────────

-- Kolonnene klientene ikke kan oppdatere direkte, per tabell. Migreringer legger bare TIL rader (on conflict
-- do nothing), så en ny kjøring av en eldre migrering aldri fjerner en beskyttelse en senere har lagt til.
create table if not exists public.protected_columns (
  table_name text not null,
  column_name text not null,
  primary key (table_name, column_name)
);
alter table public.protected_columns enable row level security;
revoke all on public.protected_columns from anon, authenticated;
insert into public.protected_columns (table_name, column_name) values
  ('items', 'value_agree_count'), ('items', 'value_disagree_count'), ('items', 'value_voter_ids'), ('items', 'value_suggestions')
on conflict do nothing;

create or replace function public.protected_item_columns()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(column_name order by column_name), '{}') from protected_columns where table_name = 'items'
$$;

-- Gir update på alle kolonner unntatt de beskyttede. Kolonnelisten leses fra databasen, så kolonner som
-- bare finnes i produksjon også tas med.
create or replace function public.apply_item_update_grants()
returns void language plpgsql security definer set search_path = public as $$
declare
  cols text;
begin
  revoke update on public.items from anon, authenticated;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'items'
    and column_name <> all (public.protected_item_columns() || array['id', 'estate_id', 'added_by', 'created_at']);
  execute format('grant update (%s) on public.items to authenticated', cols);
end;
$$;
revoke all on function public.apply_item_update_grants() from public, anon, authenticated;

select public.apply_item_update_grants();

-- ── Stemmer på verdi ────────────────────────────────────────────────────────────

-- Én stemme per person og gjenstand. «Uenig» kan ha et eget forslag (kroner). Demokontoer kan ikke stemme.
-- value_voter_ids er uuid[] i SQL-filene og text[] i produksjon; funksjonen virker med begge.
create or replace function public.vote_item_value(p_item uuid, p_vote text, p_value numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_item items%rowtype;
  v_elem text;
  v_name text;
begin
  if v_uid is null then raise exception 'Du må være logget inn' using errcode = '42501'; end if;
  if p_vote not in ('agree', 'disagree') then raise exception 'Ugyldig stemme' using errcode = '22023'; end if;
  if p_value is not null and (p_value < 0 or p_value > 100000000) then raise exception 'Ugyldig beløp' using errcode = '22023'; end if;
  select * into v_item from items where id = p_item for update;
  if not found or not public.is_estate_member(v_item.estate_id) then
    raise exception 'Fant ikke gjenstanden' using errcode = '42501';
  end if;
  if public.is_demo_user() then raise exception 'Demokontoen kan ikke stemme' using errcode = '42501'; end if;
  if v_uid::text = any (coalesce(v_item.value_voter_ids::text[], '{}')) then
    return jsonb_build_object('ok', false, 'reason', 'already_voted');
  end if;
  select display_name into v_name from profiles where user_id = v_uid;

  select substr(udt_name, 2) into v_elem from information_schema.columns
  where table_schema = 'public' and table_name = 'items' and column_name = 'value_voter_ids';
  execute format(
    'update public.items set value_voter_ids = array_append(coalesce(value_voter_ids, ''{}''), $1::%s) where id = $2', v_elem)
    using v_uid::text, p_item;
  update items set
    value_agree_count = coalesce(value_agree_count, 0) + (case when p_vote = 'agree' then 1 else 0 end),
    value_disagree_count = coalesce(value_disagree_count, 0) + (case when p_vote = 'disagree' then 1 else 0 end),
    value_suggestions = case when p_vote = 'disagree' and p_value is not null
      then coalesce(value_suggestions, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('user_id', v_uid, 'name', coalesce(v_name, ''), 'value', p_value))
      else value_suggestions end
  where id = p_item;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.vote_item_value(uuid, text, numeric) from public, anon;
grant execute on function public.vote_item_value(uuid, text, numeric) to authenticated;

-- ── Ønsker og «nei takk» bare på gjenstander som ikke er tildelt ─────────────────

create or replace function public.item_is_open(p_item uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from items where id = p_item and coalesce(status, 'active') <> 'assigned')
$$;
grant execute on function public.item_is_open(uuid) to authenticated;

drop policy if exists "interests_insert" on public.interests;
create policy "interests_insert" on public.interests for insert with check (
  user_id = auth.uid() and public.is_estate_member(public.item_estate_id(item_id)) and public.item_is_open(item_id)
);
drop policy if exists "item_passes_insert" on public.item_passes;
create policy "item_passes_insert" on public.item_passes for insert with check (
  user_id = auth.uid() and public.is_estate_member(public.item_estate_id(item_id)) and public.item_is_open(item_id)
);

notify pgrst, 'reload schema';
