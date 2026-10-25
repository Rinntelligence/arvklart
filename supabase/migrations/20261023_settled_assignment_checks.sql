-- Fordeling som ikke låser seg, uten at manglende svar regnes som «nei takk».
--
-- En åpen gjenstand er «avklart» når alle beslutningsrelevante medlemmer har sagt «vil ha» eller «nei takk».
-- Beslutningsrelevante er alle medlemmer unntatt dem hvis e-post står på en person med relasjon Bobestyrer,
-- Advokat eller Rådgiver – samme regel som decidingMembers/getUndecided i src/lib/estateProgress.js
-- (test/fixtures/settled_cases.json testes mot begge).
--
-- 1. item_pending_members(item): medlemmene som ikke har svart. item_is_settled(item): ingen mangler.
--    Bare for databasefunksjonene (ikke i client_functions).
-- 2. assign_items:
--    • ny metode 'single' («Tildel alle som bare én ønsker»): gjenstanden må være avklart og ha nøyaktig
--      én interesse fra et nåværende medlem, og mottakeren må være den personen. Ellers hoppes den over.
--    • 'snake' og 'equal': gjenstanden må være avklart, og har den interesser, må mottakeren være blant dem.
--      Ellers avvises hele kallet (ingenting tildeles), så klienten kan laste på nytt.
--    • 'lottery': som før må mottakeren være vinneren i siste trekning, og nå avvises tildelingen også hvis
--      de som ønsker gjenstanden, er endret etter trekningen. Eldre trekninger uten kandidatliste kontrolleres
--      ikke, så eksisterende bo ikke får en regresjon.
--    • 'manual' er uendret: administrator kan tildele også før alle har svart.
--    • Alle tildelinger logger pending_responses: kontoene som ikke hadde svart på gjenstanden da den ble
--      tildelt (tom liste = alle hadde svart). Det betyr ikke at de har sagt nei takk. Kontosletting fjerner
--      id-ene via anonymize_estate_events (som bytter ut konto-id-en overalt i loggdataene).
-- 3. draw_lot: avviser gjenstander som ikke er avklart.
--
-- Ingen eksisterende tildeling, logg, forslag eller avtrykk endres. Kan kjøres flere ganger.
-- Tilbakerulling: rollback/20261023_settled_assignment_checks.down.sql

-- ── 1. Avklart gjenstand ────────────────────────────────────────────────────────

create or replace function public.item_pending_members(p_item uuid)
returns uuid[] language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}'::uuid[])
  from items i
  join estate_members m on m.estate_id = i.estate_id
  left join profiles p on p.user_id = m.user_id
  where i.id = p_item
    and not exists (
      select 1 from heirs h
      where h.estate_id = i.estate_id and h.email is not null
        and h.relationship in ('Bobestyrer', 'Advokat', 'Rådgiver')
        and lower(btrim(h.email, E' \t\n\r')) = lower(btrim(coalesce(p.email, ''), E' \t\n\r')))
    and not exists (select 1 from interests x where x.item_id = i.id and x.user_id = m.user_id)
    and not exists (select 1 from item_passes s where s.item_id = i.id and s.user_id = m.user_id)
$$;

create or replace function public.item_is_settled(p_item uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select cardinality(public.item_pending_members(p_item)) = 0
$$;

-- Kontoene (nåværende medlemmer) som ønsker gjenstanden
create or replace function public.item_interested_members(p_item uuid)
returns uuid[] language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(distinct x.user_id), '{}'::uuid[])
  from items i
  join interests x on x.item_id = i.id
  join estate_members m on m.estate_id = i.estate_id and m.user_id = x.user_id
  where i.id = p_item
$$;

-- ── 2. assign_items ─────────────────────────────────────────────────────────────

-- p_assignments: [{ "item_id": …, "heir_id": … }] (eller det gamle { "item_id", "user_id" }).
-- p_method: manual | single | lottery | snake | equal.
create or replace function public.assign_items(p_estate uuid, p_assignments jsonb, p_method text default 'manual')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a jsonb;
  v_item items%rowtype;
  v_heir heirs%rowtype;
  v_draw jsonb;
  v_draw_heir uuid;
  v_pending uuid[];
  v_interested uuid[];
  v_now_heirs uuid[];
  v_now_users uuid[];
  n_ok int := 0;
  skipped jsonb := '[]'::jsonb;
begin
  perform public.require_estate_admin(p_estate);
  if p_method not in ('manual', 'single', 'lottery', 'snake', 'equal') then raise exception 'Ukjent metode' using errcode = '22023'; end if;
  if jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) > 500 then raise exception 'Ugyldig liste' using errcode = '22023'; end if;
  for a in select * from jsonb_array_elements(p_assignments) loop
    v_heir := null;
    select * into v_item from items where id = (a->>'item_id')::uuid and estate_id = p_estate for update;
    if not found or coalesce(v_item.status, 'active') = 'assigned' then
      skipped := skipped || jsonb_build_array(a->>'item_id'); continue;
    end if;
    if nullif(a->>'heir_id', '') is not null then
      select * into v_heir from heirs where id = (a->>'heir_id')::uuid and estate_id = p_estate;
    elsif nullif(a->>'user_id', '') is not null then
      select * into v_heir from heirs where estate_id = p_estate and user_id = (a->>'user_id')::uuid;
    end if;
    if v_heir.id is null then
      raise exception 'Mottakeren står ikke på listen over personer i boet' using errcode = '22023';
    end if;
    if not v_heir.receives_items then
      raise exception '% er ikke registrert som mottaker av gjenstander', v_heir.name using errcode = '22023';
    end if;

    v_pending := public.item_pending_members(v_item.id);
    v_interested := public.item_interested_members(v_item.id);

    if p_method = 'single' then
      -- Bare avklarte gjenstander som nøyaktig én ønsker, og bare til den personen; ellers hoppes den over
      if cardinality(v_pending) > 0 or cardinality(v_interested) <> 1 or v_heir.user_id is distinct from v_interested[1] then
        skipped := skipped || jsonb_build_array(a->>'item_id'); continue;
      end if;
    elsif p_method in ('snake', 'equal') then
      if cardinality(v_pending) > 0 then
        raise exception 'Ikke alle har tatt stilling til gjenstanden. Last siden på nytt.' using errcode = '22023';
      end if;
      if (p_method = 'snake' or cardinality(v_interested) > 0) and not coalesce(v_heir.user_id = any(v_interested), false) then
        raise exception 'Ønskene er endret. Last siden på nytt.' using errcode = '22023';
      end if;
    elsif p_method = 'lottery' then
      select data into v_draw from estate_events where item_id = v_item.id and kind = 'lottery_draw' order by id desc limit 1;
      v_draw_heir := coalesce((v_draw->>'winner_heir')::uuid,
        (select h.id from heirs h where h.estate_id = p_estate and h.user_id = (v_draw->>'winner')::uuid));
      if v_draw is null or v_draw_heir is distinct from v_heir.id then
        raise exception 'Tildelingen må være lik siste loddtrekning' using errcode = '22023';
      end if;
      -- De som ønsker gjenstanden nå, regnet som i draw_lot
      select coalesce(array_agg(h.id order by h.id), '{}'::uuid[]), coalesce(array_agg(h.user_id order by h.id), '{}'::uuid[])
        into v_now_heirs, v_now_users
      from interests x
      join estate_members m on m.user_id = x.user_id and m.estate_id = p_estate
      join heirs h on h.user_id = x.user_id and h.estate_id = p_estate and h.receives_items
      where x.item_id = v_item.id;
      if (v_draw ? 'candidate_heirs' and
            (select coalesce(array_agg(e::uuid order by e::uuid), '{}'::uuid[]) from jsonb_array_elements_text(v_draw->'candidate_heirs') e)
            is distinct from (select coalesce(array_agg(e order by e), '{}'::uuid[]) from unnest(v_now_heirs) e))
         or (not v_draw ? 'candidate_heirs' and v_draw ? 'candidates' and
            (select coalesce(array_agg(e::uuid order by e::uuid), '{}'::uuid[]) from jsonb_array_elements_text(v_draw->'candidates') e)
            is distinct from (select coalesce(array_agg(e order by e), '{}'::uuid[]) from unnest(v_now_users) e)) then
        raise exception 'Ønskene er endret etter trekningen. Trekk på nytt.' using errcode = '22023';
      end if;
    end if;

    update items set assigned_heir_id = v_heir.id, assigned_to = v_heir.user_id, status = 'assigned', disposition = null where id = v_item.id;
    if v_item.disposition is not null then
      perform public.log_estate_event(p_estate, v_item.id, 'disposition_set', jsonb_build_object('disposition', null, 'previous', v_item.disposition, 'reason', 'assigned'));
    end if;
    perform public.log_estate_event(p_estate, v_item.id, 'assigned',
      jsonb_build_object('to', v_heir.user_id, 'heir_id', v_heir.id, 'name', v_heir.name, 'method', p_method,
        'pending_responses', to_jsonb(v_pending)));
    n_ok := n_ok + 1;
  end loop;
  return jsonb_build_object('assigned', n_ok, 'skipped', skipped);
end;
$$;

-- ── 3. draw_lot bare for avklarte gjenstander ───────────────────────────────────

create or replace function public.draw_lot(p_item uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item items%rowtype;
  v_heirs uuid[];
  v_users uuid[];
  v_idx int;
  v_n int;
  v_prev int;
begin
  select * into v_item from items where id = p_item for update;
  if not found then raise exception 'Fant ikke gjenstanden' using errcode = '42501'; end if;
  perform public.require_estate_admin(v_item.estate_id);
  if coalesce(v_item.status, 'active') = 'assigned' then raise exception 'Gjenstanden er allerede tildelt' using errcode = '22023'; end if;
  if not public.item_is_settled(p_item) then
    raise exception 'Ikke alle har tatt stilling til gjenstanden ennå' using errcode = '22023';
  end if;
  select array_agg(h.id order by h.id), array_agg(h.user_id order by h.id) into v_heirs, v_users
  from interests x
  join estate_members m on m.user_id = x.user_id and m.estate_id = v_item.estate_id
  join heirs h on h.user_id = x.user_id and h.estate_id = v_item.estate_id and h.receives_items
  where x.item_id = p_item;
  v_n := coalesce(array_length(v_heirs, 1), 0);
  if v_n = 0 then raise exception 'Ingen av dem som ønsker gjenstanden, står på listen over mottakere' using errcode = '22023'; end if;
  -- Sterk tilfeldighet fra gen_random_uuid (pg_strong_random), uten skjevhet av betydning for små tall
  v_idx := 1 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint % v_n)::int;
  select count(*) into v_prev from estate_events where item_id = p_item and kind = 'lottery_draw';
  perform public.log_estate_event(v_item.estate_id, p_item, 'lottery_draw',
    jsonb_build_object('candidates', to_jsonb(v_users), 'candidate_heirs', to_jsonb(v_heirs), 'winner', v_users[v_idx],
      'winner_heir', v_heirs[v_idx], 'winner_name', (select name from heirs where id = v_heirs[v_idx]), 'draw_no', v_prev + 1));
  return jsonb_build_object('winner', v_users[v_idx], 'winner_heir', v_heirs[v_idx], 'candidates', to_jsonb(v_users),
    'candidate_heirs', to_jsonb(v_heirs), 'draw_no', v_prev + 1);
end;
$$;

-- Nye funksjoner er stengt for klientene (20261022_function_grants.sql); assign_items og draw_lot står fortsatt
-- i client_functions med samme signatur
do $$ begin
  if to_regprocedure('public.apply_function_grants()') is not null then perform public.apply_function_grants(); end if;
end $$;

notify pgrst, 'reload schema';
