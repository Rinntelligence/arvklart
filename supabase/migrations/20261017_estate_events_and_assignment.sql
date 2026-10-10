-- F1: beslutningslogg og sikre tildelinger.
--
-- 1. estate_events: felles logg per bo (tildeling, loddtrekning, ønsker, «nei takk»). Medlemmer leser;
--    klientene kan aldri skrive, endre eller slette. Bare databasefunksjonene under skriver.
-- 2. Tildeling går bare via assign_items() og unassign_item(): én transaksjon, låsing av raden, bare
--    ledige gjenstander, mottakeren må være medlem, og alt logges med metode. assigned_to og status er
--    nå beskyttede kolonner (kolonnerettigheter, se 20261016), så direkte oppdatering avvises også for admin.
-- 3. draw_lot(): loddtrekningen gjøres av databasen (gen_random_uuid, sterk tilfeldighet) blant dem som
--    ønsker gjenstanden, og logges med kandidatene. assign_items(…, 'lottery') krever at tildelingen er
--    lik siste trekning. En ny trekning er mulig, men står i loggen.
-- 4. Nye gjenstander kan ikke opprettes med andres stemmer eller tildeling (before insert-trigger).
--
-- Lukket bo: ingen tildeling. Demo: demokontoene er administratorer i demoboet og kan prøve fordelingen.
-- Kan kjøres flere ganger.

create table if not exists public.estate_events (
  id bigserial primary key,
  estate_id uuid not null references public.estates(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  actor uuid references auth.users(id) on delete set null,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists estate_events_estate_idx on public.estate_events (estate_id, created_at);
create index if not exists estate_events_item_idx on public.estate_events (item_id, created_at) where item_id is not null;

alter table public.estate_events enable row level security;
drop policy if exists "estate_events_select" on public.estate_events;
create policy "estate_events_select" on public.estate_events for select using (public.is_estate_member(estate_id));
revoke insert, update, delete on public.estate_events from anon, authenticated;
grant select on public.estate_events to authenticated;

-- Intern: skriver én hendelse. Ikke tilgjengelig for klienter.
create or replace function public.log_estate_event(p_estate uuid, p_item uuid, p_kind text, p_data jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into estate_events (estate_id, item_id, actor, kind, data) values (p_estate, p_item, auth.uid(), p_kind, coalesce(p_data, '{}'::jsonb))
$$;
revoke all on function public.log_estate_event(uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.estate_is_open(p_estate uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from estates where id = p_estate and coalesce(status, 'active') <> 'closed')
$$;
grant execute on function public.estate_is_open(uuid) to authenticated;

-- Felles sjekk for fordelingsfunksjonene: innlogget administrator i et åpent bo
create or replace function public.require_estate_admin(p_estate uuid)
returns void language plpgsql security definer stable set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Du må være logget inn' using errcode = '42501'; end if;
  if not public.is_estate_admin(p_estate) then raise exception 'Bare administrator kan gjøre dette' using errcode = '42501'; end if;
  if not public.estate_is_open(p_estate) then raise exception 'Boet er avsluttet' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.require_estate_admin(uuid) from public, anon, authenticated;

-- ── Beskytt tildelingen ─────────────────────────────────────────────────────────

insert into public.protected_columns (table_name, column_name) values ('items', 'assigned_to'), ('items', 'status') on conflict do nothing;
select public.apply_item_update_grants();

-- Ny gjenstand: ingen tildeling og høyst egen stemme (opprettelsen kan ta med skaperens egen vurdering)
create or replace function public.guard_item_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if coalesce(new.status, 'active') <> 'active' or new.assigned_to is not null then
    raise exception 'En ny gjenstand kan ikke være tildelt' using errcode = '42501';
  end if;
  if coalesce(array_length(new.value_voter_ids, 1), 0) > 1
     or (new.value_voter_ids is not null and not (new.value_voter_ids::text[] <@ array[auth.uid()::text]))
     or coalesce(new.value_agree_count, 0) + coalesce(new.value_disagree_count, 0) > coalesce(array_length(new.value_voter_ids, 1), 0)
     or exists (select 1 from jsonb_array_elements(coalesce(new.value_suggestions, '[]'::jsonb)) s where s->>'user_id' is distinct from auth.uid()::text) then
    raise exception 'En ny gjenstand kan bare ha skaperens egen stemme' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_item_insert on public.items;
create trigger guard_item_insert before insert on public.items for each row execute function public.guard_item_insert();

-- ── Tildeling ───────────────────────────────────────────────────────────────────

-- p_assignments: [{ "item_id": …, "user_id": … }]. p_method: manual | lottery | snake | equal.
-- Gjenstander som allerede er tildelt (eller ikke finnes i boet) hoppes over og telles som skipped.
create or replace function public.assign_items(p_estate uuid, p_assignments jsonb, p_method text default 'manual')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a jsonb;
  v_item items%rowtype;
  v_user uuid;
  v_draw jsonb;
  n_ok int := 0;
  skipped jsonb := '[]'::jsonb;
begin
  perform public.require_estate_admin(p_estate);
  if p_method not in ('manual', 'lottery', 'snake', 'equal') then raise exception 'Ukjent metode' using errcode = '22023'; end if;
  if jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) > 500 then raise exception 'Ugyldig liste' using errcode = '22023'; end if;
  for a in select * from jsonb_array_elements(p_assignments) loop
    v_user := (a->>'user_id')::uuid;
    select * into v_item from items where id = (a->>'item_id')::uuid and estate_id = p_estate for update;
    if not found or coalesce(v_item.status, 'active') = 'assigned' then
      skipped := skipped || jsonb_build_array(a->>'item_id'); continue;
    end if;
    if not exists (select 1 from estate_members where estate_id = p_estate and user_id = v_user) then
      raise exception 'Mottakeren er ikke medlem av boet' using errcode = '22023';
    end if;
    if p_method = 'lottery' then
      select data into v_draw from estate_events where item_id = v_item.id and kind = 'lottery_draw' order by id desc limit 1;
      if v_draw is null or (v_draw->>'winner')::uuid is distinct from v_user then
        raise exception 'Tildelingen må være lik siste loddtrekning' using errcode = '22023';
      end if;
    end if;
    update items set assigned_to = v_user, status = 'assigned' where id = v_item.id;
    perform public.log_estate_event(p_estate, v_item.id, 'assigned', jsonb_build_object('to', v_user, 'method', p_method));
    n_ok := n_ok + 1;
  end loop;
  return jsonb_build_object('assigned', n_ok, 'skipped', skipped);
end;
$$;

create or replace function public.unassign_item(p_item uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item items%rowtype;
begin
  select * into v_item from items where id = p_item for update;
  if not found then raise exception 'Fant ikke gjenstanden' using errcode = '42501'; end if;
  perform public.require_estate_admin(v_item.estate_id);
  if coalesce(v_item.status, 'active') <> 'assigned' then return jsonb_build_object('ok', false, 'reason', 'not_assigned'); end if;
  update items set assigned_to = null, status = 'active' where id = p_item;
  perform public.log_estate_event(v_item.estate_id, p_item, 'unassigned', jsonb_build_object('from', v_item.assigned_to));
  return jsonb_build_object('ok', true);
end;
$$;

-- Loddtrekning blant medlemmene som ønsker gjenstanden. Tildeler ikke: resultatet bekreftes med
-- assign_items(…, 'lottery'). Hver trekning logges med kandidatene, også om den trekkes på nytt.
create or replace function public.draw_lot(p_item uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item items%rowtype;
  v_candidates uuid[];
  v_winner uuid;
  v_n int;
  v_prev int;
begin
  select * into v_item from items where id = p_item for update;
  if not found then raise exception 'Fant ikke gjenstanden' using errcode = '42501'; end if;
  perform public.require_estate_admin(v_item.estate_id);
  if coalesce(v_item.status, 'active') = 'assigned' then raise exception 'Gjenstanden er allerede tildelt' using errcode = '22023'; end if;
  select array_agg(x.user_id order by x.user_id) into v_candidates
  from interests x join estate_members m on m.user_id = x.user_id and m.estate_id = v_item.estate_id
  where x.item_id = p_item;
  v_n := coalesce(array_length(v_candidates, 1), 0);
  if v_n = 0 then raise exception 'Ingen ønsker denne gjenstanden' using errcode = '22023'; end if;
  -- Sterk tilfeldighet fra gen_random_uuid (pg_strong_random), uten skjevhet av betydning for små tall
  v_winner := v_candidates[1 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint % v_n)::int];
  select count(*) into v_prev from estate_events where item_id = p_item and kind = 'lottery_draw';
  perform public.log_estate_event(v_item.estate_id, p_item, 'lottery_draw',
    jsonb_build_object('candidates', to_jsonb(v_candidates), 'winner', v_winner, 'draw_no', v_prev + 1));
  return jsonb_build_object('winner', v_winner, 'candidates', to_jsonb(v_candidates), 'draw_no', v_prev + 1);
end;
$$;

revoke all on function public.assign_items(uuid, jsonb, text) from public, anon;
revoke all on function public.unassign_item(uuid) from public, anon;
revoke all on function public.draw_lot(uuid) from public, anon;
grant execute on function public.assign_items(uuid, jsonb, text) to authenticated;
grant execute on function public.unassign_item(uuid) to authenticated;
grant execute on function public.draw_lot(uuid) to authenticated;

-- ── Ønsker og «nei takk» i loggen ───────────────────────────────────────────────

create or replace function public.log_wish_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record := coalesce(new, old);
  v_estate uuid;
begin
  -- Bare handlinger fra innloggede brukere (ikke kontosletting, demo-nullstilling eller andre tjenestejobber)
  if coalesce(auth.role(), '') <> 'authenticated' then return null; end if;
  select estate_id into v_estate from items where id = r.item_id;
  if v_estate is null then return null; end if;
  perform public.log_estate_event(v_estate, r.item_id,
    case when tg_table_name = 'interests' then (case when tg_op = 'INSERT' then 'wish_added' else 'wish_removed' end)
         else (case when tg_op = 'INSERT' then 'pass_added' else 'pass_removed' end) end,
    jsonb_build_object('user_id', r.user_id));
  return null;
end;
$$;
drop trigger if exists log_interest_change on public.interests;
create trigger log_interest_change after insert or delete on public.interests for each row execute function public.log_wish_change();
drop trigger if exists log_pass_change on public.item_passes;
create trigger log_pass_change after insert or delete on public.item_passes for each row execute function public.log_wish_change();

-- ── Kontosletting: brukerens id fjernes fra loggens innhold ─────────────────────
-- actor settes til null av fremmednøkkelen når brukeren slettes; her fjernes id-en fra data (mottaker,
-- kandidater osv.). Kalles av delete-account (service_role) før brukeren slettes.
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
revoke all on function public.anonymize_estate_events(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_estate_events(uuid) to service_role;

-- ── Demo: nullstillingen fjerner også loggen ────────────────────────────────────

create or replace function public.reset_demo_estate()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_estate constant uuid := 'deed0001-0000-0000-0000-000000000001';
  v_owner uuid;
  v_kari uuid;
  v_lars uuid;
  v_mona uuid;
begin
  select owner_id into v_owner from estates where id = v_estate;
  select id into v_kari from auth.users where email = 'kari.demo@heirsplit.no';
  select id into v_lars from auth.users where email = 'lars.demo@heirsplit.no';
  select id into v_mona from auth.users where email = 'mona.demo@heirsplit.no';
  if v_owner is null or v_kari is null or v_lars is null or v_mona is null then
    return; -- demoen er ikke satt opp i denne databasen
  end if;

  delete from comments where user_id = v_mona and item_id in (select id from items where estate_id = v_estate);
  delete from interests where item_id in (select id from items where estate_id = v_estate);
  delete from item_passes where item_id in (select id from items where estate_id = v_estate);
  update items set assigned_to = null, status = 'active', marked_for_disposal = false where estate_id = v_estate;

  insert into interests (item_id, user_id, reason)
  select s.item_id, case s.who when 'owner' then v_owner when 'kari' then v_kari when 'lars' then v_lars else v_mona end, s.reason
  from (values
    ('face0001-0000-0000-0000-000000000001'::uuid, 'owner', 'Jeg husker den fra barndommen — bestemor satt alltid der og strikket'),
    ('face0001-0000-0000-0000-000000000001'::uuid, 'kari',  'Mamma elsket den stolen. Jeg vil ta vare på den til barna mine'),
    ('face0002-0000-0000-0000-000000000002'::uuid, 'lars',  'Vi har plass til det i stua og det vil passe perfekt med vår stil'),
    ('face0002-0000-0000-0000-000000000002'::uuid, 'mona',  'Vi mangler et skikkelig spisebord — dette er drømmen'),
    ('face0004-0000-0000-0000-000000000004'::uuid, 'owner', 'Det hørte alltid til i stua. Jeg kan ikke forestille meg det noe annet sted'),
    ('face0004-0000-0000-0000-000000000004'::uuid, 'lars',  'Pappa var veldig glad i dette maleriet. Jeg vil beholde minnet'),
    ('face0004-0000-0000-0000-000000000004'::uuid, 'mona',  'Det er det mest verdifulle i boet — og det er vakkert'),
    ('face0006-0000-0000-0000-000000000006'::uuid, 'kari',  'Pappa hadde den på seg hver dag. Den betyr mye for meg'),
    ('face0006-0000-0000-0000-000000000006'::uuid, 'mona',  'Jeg er den eneste som bruker ur, og det er et klassisk stykke'),
    ('face0008-0000-0000-0000-000000000008'::uuid, 'owner', 'Jeg bruker musikkanlegg daglig og dette er av fantastisk kvalitet'),
    ('face0008-0000-0000-0000-000000000008'::uuid, 'lars',  'Er stor B&O-fan. Har alltid likt dette anlegget'),
    ('face0011-0000-0000-0000-000000000011'::uuid, 'kari',  'Bildene betyr alt. Jeg vil skanne dem og dele digitalt med alle'),
    ('face0011-0000-0000-0000-000000000011'::uuid, 'lars',  'Vi bør alle ha tilgang — men noen må oppbevare originalene'),
    ('face0011-0000-0000-0000-000000000011'::uuid, 'mona',  'Jeg har barn som ikke har sett disse bildene ennå'),
    ('face0005-0000-0000-0000-000000000005'::uuid, 'kari',  'Har alltid vært fascinert av den. Vil gjerne ha den i hylla mi'),
    ('face0007-0000-0000-0000-000000000007'::uuid, 'mona',  'Jeg er eneste datter som bruker smykker — og det er mors smykke'),
    ('face0003-0000-0000-0000-000000000003'::uuid, 'lars',  'Jeg er den eneste som har plass til den — og jeg er bibliofil'),
    ('face0009-0000-0000-0000-000000000009'::uuid, 'mona',  'Stavangerflint er en norsk klassiker. Vil bruke det til jul')
  ) as s(item_id, who, reason)
  where exists (select 1 from items where id = s.item_id and estate_id = v_estate)
  on conflict (item_id, user_id) do nothing;

  -- Alle andre enn Mona har sagt nei takk til det de ikke vil ha.
  insert into item_passes (item_id, user_id)
  select i.id, m.user_id
  from items i
  join estate_members m on m.estate_id = i.estate_id
  where i.estate_id = v_estate and m.user_id <> v_mona
    and not exists (select 1 from interests x where x.item_id = i.id and x.user_id = m.user_id)
  on conflict (item_id, user_id) do nothing;

  -- Loggen starter tom for hver besøkende. Dynamisk, så nullstillingen også virker om loggen rulles tilbake.
  if to_regclass('public.estate_events') is not null then
    execute 'delete from public.estate_events where estate_id = $1' using v_estate;
  end if;
end;
$$;
revoke all on function public.reset_demo_estate() from public, anon, authenticated;
grant execute on function public.reset_demo_estate() to service_role;

notify pgrst, 'reload schema';
