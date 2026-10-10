-- F3: fordelingsverdi, kobling arving–konto og bekreftede arveandeler.
--
-- 1. items.agreed_value (fordelingsverdi) holdes atskilt fra AI-anslaget (estimated_value/ai_analysis)
--    og arvingenes forslag (value_suggestions). Settes bare av administrator via set_agreed_values(),
--    med kilde (ai | heir | manual), og logges. Er «foreslått» til fordelingen er godkjent (F6).
--    Manglende verdi er null, aldri 0 kr; 0 kr må settes eksplisitt.
-- 2. heirs.user_id: kobling mellom arving og konto. Settes når arvingen selv blir med via invitasjonen
--    (join_estate sjekker e-posten ved innlogging). Eksisterende medlemmer kobles én gang her, med samme
--    kontroll. Admin kan ikke sette eller endre koblingen (kolonnerettigheter).
-- 3. estates.shares_confirmed: administrator bekrefter at arveandelene (heirs.percentage) gjelder
--    fordelingen av innbo og løsøre. Først da kan jevn fordeling vektes etter andel. Endres en andel,
--    nullstilles bekreftelsen automatisk.
--
-- Kan kjøres flere ganger.

-- ── Generell hjelper for kolonnerettigheter (som apply_item_update_grants, for andre tabeller) ──
create or replace function public.apply_update_grants(p_table text, p_protected text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  cols text;
begin
  execute format('revoke update on public.%I from anon, authenticated', p_table);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table and column_name <> all (p_protected || array['id']);
  execute format('grant update (%s) on public.%I to authenticated', cols, p_table);
end;
$$;
revoke all on function public.apply_update_grants(text, text[]) from public, anon, authenticated;

-- ── Fordelingsverdi ─────────────────────────────────────────────────────────────

alter table public.items add column if not exists agreed_value numeric(14, 2);
alter table public.items add column if not exists agreed_value_source text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'items_agreed_value_chk' and conrelid = 'public.items'::regclass) then
    alter table public.items add constraint items_agreed_value_chk check (
      (agreed_value is null or (agreed_value >= 0 and agreed_value <= 100000000))
      and (agreed_value_source is null or agreed_value_source in ('ai', 'heir', 'manual'))
    );
  end if;
end $$;

create or replace function public.protected_item_columns()
returns text[] language sql immutable as $$
  select array['value_agree_count', 'value_disagree_count', 'value_voter_ids', 'value_suggestions', 'assigned_to', 'status',
               'agreed_value', 'agreed_value_source']
$$;
select public.apply_item_update_grants();

create or replace function public.guard_item_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if coalesce(new.status, 'active') <> 'active' or new.assigned_to is not null then
    raise exception 'En ny gjenstand kan ikke være tildelt' using errcode = '42501';
  end if;
  if new.agreed_value is not null or new.agreed_value_source is not null then
    raise exception 'Fordelingsverdi settes bare av administrator etter at gjenstanden er lagt inn' using errcode = '42501';
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

-- p_values: [{ "item_id": …, "value": 1500 | null, "source": "ai" | "heir" | "manual" }]. null fjerner verdien.
create or replace function public.set_agreed_values(p_estate uuid, p_values jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  v_item items%rowtype;
  v_value numeric;
  v_source text;
  n int := 0;
begin
  perform public.require_estate_admin(p_estate);
  if public.is_demo_user() then raise exception 'Demokontoen kan ikke endre verdier' using errcode = '42501'; end if;
  if jsonb_typeof(p_values) <> 'array' or jsonb_array_length(p_values) > 1000 then raise exception 'Ugyldig liste' using errcode = '22023'; end if;
  for v in select * from jsonb_array_elements(p_values) loop
    select * into v_item from items where id = (v->>'item_id')::uuid and estate_id = p_estate for update;
    if not found then raise exception 'Fant ikke gjenstanden i boet' using errcode = '22023'; end if;
    v_value := case when v->'value' is null or jsonb_typeof(v->'value') = 'null' then null else (v->>'value')::numeric end;
    v_source := case when v_value is null then null else coalesce(v->>'source', 'manual') end;
    if v_value is not null and (v_value < 0 or v_value > 100000000) then raise exception 'Ugyldig beløp' using errcode = '22023'; end if;
    if v_source is not null and v_source not in ('ai', 'heir', 'manual') then raise exception 'Ukjent kilde' using errcode = '22023'; end if;
    if v_item.agreed_value is not distinct from v_value and v_item.agreed_value_source is not distinct from v_source then continue; end if;
    update items set agreed_value = v_value, agreed_value_source = v_source where id = v_item.id;
    perform public.log_estate_event(p_estate, v_item.id, 'agreed_value_set',
      jsonb_build_object('value', v_value, 'source', v_source, 'previous', v_item.agreed_value));
    n := n + 1;
  end loop;
  return jsonb_build_object('updated', n);
end;
$$;
revoke all on function public.set_agreed_values(uuid, jsonb) from public, anon;
grant execute on function public.set_agreed_values(uuid, jsonb) to authenticated;

-- ── Kobling arving–konto ────────────────────────────────────────────────────────

alter table public.heirs add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.heirs add column if not exists linked_via text;
alter table public.heirs add column if not exists linked_at timestamptz;
create index if not exists heirs_user_idx on public.heirs (user_id) where user_id is not null;

-- Én gang: medlemmer som allerede har blitt med, kobles til arvingen med samme e-post (samme kontroll som
-- join_estate gjorde da de ble med). Eieren kobles hvis eieren også står på arvelisten.
update public.heirs h set user_id = u.id, linked_via = 'existing_member', linked_at = now()
from public.estate_members m join auth.users u on u.id = m.user_id
where h.user_id is null and m.estate_id = h.estate_id and lower(trim(h.email)) = lower(trim(u.email))
  and not exists (select 1 from public.heirs h2 where h2.estate_id = h.estate_id and h2.user_id = u.id);

-- Arvelisten: admin kan ikke sette koblingen (eller bekreftelsen under) selv
create or replace function public.protected_heir_columns()
returns text[] language sql immutable as $$ select array['user_id', 'linked_via', 'linked_at', 'estate_id'] $$;
select public.apply_update_grants('heirs', public.protected_heir_columns());

-- Koblingen kan ikke settes ved insert heller
create or replace function public.guard_heir_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and (new.user_id is not null or new.linked_via is not null or new.linked_at is not null) then
    raise exception 'Koblingen til en konto settes bare når arvingen selv blir med' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_heir_insert on public.heirs;
create trigger guard_heir_insert before insert on public.heirs for each row execute function public.guard_heir_insert();

create or replace function public.join_estate(p_code text)
returns table (estate_id uuid, estate_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.email(), '')));
  v_estate estates%rowtype;
  v_heir uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_estate from estates where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'invalid_code';
  end if;
  select h.id into v_heir from heirs h
  where h.estate_id = v_estate.id and v_email <> '' and lower(trim(h.email)) = v_email
  order by (h.user_id = v_uid) desc nulls last, h.user_id nulls first limit 1;
  if not exists (select 1 from estate_members m where m.estate_id = v_estate.id and m.user_id = v_uid) then
    if v_heir is null then
      raise exception 'not_invited';
    end if;
    insert into estate_members (estate_id, user_id, role) values (v_estate.id, v_uid, 'member');
  end if;
  -- Arvingen kobles til kontoen som logget inn med e-posten (én gang; en kobling overstyres aldri)
  if v_heir is not null and not exists (select 1 from heirs hx where hx.estate_id = v_estate.id and hx.user_id = v_uid) then
    update heirs hu set user_id = v_uid, linked_via = 'join_estate', linked_at = now() where hu.id = v_heir and hu.user_id is null;
    if found then
      perform public.log_estate_event(v_estate.id, null, 'heir_linked', jsonb_build_object('heir_id', v_heir, 'user_id', v_uid));
    end if;
  end if;
  return query select v_estate.id, v_estate.name;
end;
$$;
revoke all on function public.join_estate(text) from public, anon;
grant execute on function public.join_estate(text) to authenticated;

-- ── Bekreftede arveandeler ──────────────────────────────────────────────────────

alter table public.estates add column if not exists shares_confirmed boolean not null default false;
alter table public.estates add column if not exists shares_confirmed_at timestamptz;
alter table public.estates add column if not exists shares_confirmed_by uuid references auth.users(id) on delete set null;
select public.apply_update_grants('estates', array['shares_confirmed', 'shares_confirmed_at', 'shares_confirmed_by', 'owner_id']);

create or replace function public.confirm_shares(p_estate uuid, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sum numeric;
begin
  perform public.require_estate_admin(p_estate);
  if public.is_demo_user() then raise exception 'Demokontoen kan ikke endre andelene' using errcode = '42501'; end if;
  if p_confirmed then
    select coalesce(sum(percentage), 0) into v_sum from heirs where estate_id = p_estate;
    if abs(v_sum - 100) > 0.5 then raise exception 'Andelene må summere til 100 %%' using errcode = '22023'; end if;
  end if;
  update estates set shares_confirmed = p_confirmed, shares_confirmed_at = case when p_confirmed then now() end,
    shares_confirmed_by = case when p_confirmed then auth.uid() end where id = p_estate;
  perform public.log_estate_event(p_estate, null, case when p_confirmed then 'shares_confirmed' else 'shares_unconfirmed' end,
    (select jsonb_build_object('shares', coalesce(jsonb_agg(jsonb_build_object('heir_id', id, 'name', name, 'percentage', percentage) order by name), '[]'::jsonb))
     from heirs where estate_id = p_estate));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.confirm_shares(uuid, boolean) from public, anon;
grant execute on function public.confirm_shares(uuid, boolean) to authenticated;

-- Endres arvelisten eller en andel, er bekreftelsen ikke lenger gyldig
create or replace function public.reset_shares_on_heir_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_estate uuid := coalesce(new.estate_id, old.estate_id);
begin
  if tg_op = 'UPDATE' and new.percentage is not distinct from old.percentage then return null; end if;
  update estates set shares_confirmed = false, shares_confirmed_at = null, shares_confirmed_by = null
  where id = v_estate and shares_confirmed;
  if found then perform public.log_estate_event(v_estate, null, 'shares_unconfirmed', jsonb_build_object('reason', 'heirs_changed')); end if;
  return null;
end;
$$;
drop trigger if exists reset_shares_on_heir_change on public.heirs;
create trigger reset_shares_on_heir_change after insert or update or delete on public.heirs
  for each row execute function public.reset_shares_on_heir_change();

-- ── Demo: fordelingsverdier fra demoens anslag, så jevn fordeling kan prøves ────
update public.items set agreed_value = nullif(regexp_replace(estimated_value::text, '[^0-9]', '', 'g'), '')::numeric, agreed_value_source = 'ai'
where estate_id = 'deed0001-0000-0000-0000-000000000001' and agreed_value is null and estimated_value is not null
  and nullif(regexp_replace(estimated_value::text, '[^0-9]', '', 'g'), '') is not null;

notify pgrst, 'reload schema';
