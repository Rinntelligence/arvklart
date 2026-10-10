-- F4: gjenstander ingen vil ha – salg, gave eller kassering som felles, foreløpig beslutning.
--
-- items.disposition: null = uavklart, ellers sell | donate | discard. Settes bare av administrator via
-- set_dispositions() for gjenstander som ikke er tildelt, og logges. Beslutningen er foreløpig til
-- fordelingen er godkjent av alle (F6). marked_for_disposal migreres IKKE: et gammelt kastemerke er ikke
-- et vedtak om kassering, og slike gjenstander står som uavklarte til familien velger.
-- Tildeles en gjenstand med disponering til en arving, fjernes disponeringen (logges).
--
-- Kan kjøres flere ganger.

alter table public.items add column if not exists disposition text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'items_disposition_chk' and conrelid = 'public.items'::regclass) then
    alter table public.items add constraint items_disposition_chk check (disposition is null or disposition in ('sell', 'donate', 'discard'));
  end if;
end $$;

create or replace function public.protected_item_columns()
returns text[] language sql immutable as $$
  select array['value_agree_count', 'value_disagree_count', 'value_voter_ids', 'value_suggestions', 'assigned_to', 'status',
               'agreed_value', 'agreed_value_source', 'disposition']
$$;
select public.apply_item_update_grants();

create or replace function public.guard_item_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if coalesce(new.status, 'active') <> 'active' or new.assigned_to is not null then
    raise exception 'En ny gjenstand kan ikke være tildelt' using errcode = '42501';
  end if;
  if new.agreed_value is not null or new.agreed_value_source is not null or new.disposition is not null then
    raise exception 'Fordelingsverdi og disponering settes bare av administrator etter at gjenstanden er lagt inn' using errcode = '42501';
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

-- p_values: [{ "item_id": …, "disposition": "sell" | "donate" | "discard" | null }]. null = uavklart igjen.
-- Demokontoene kan prøve dette i demoboet (de er administratorer der); nullstillingen fjerner det.
create or replace function public.set_dispositions(p_estate uuid, p_values jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  v_item items%rowtype;
  v_disp text;
  n int := 0;
begin
  perform public.require_estate_admin(p_estate);
  if jsonb_typeof(p_values) <> 'array' or jsonb_array_length(p_values) > 1000 then raise exception 'Ugyldig liste' using errcode = '22023'; end if;
  for v in select * from jsonb_array_elements(p_values) loop
    v_disp := nullif(v->>'disposition', '');
    if v_disp is not null and v_disp not in ('sell', 'donate', 'discard') then raise exception 'Ukjent valg' using errcode = '22023'; end if;
    select * into v_item from items where id = (v->>'item_id')::uuid and estate_id = p_estate for update;
    if not found then raise exception 'Fant ikke gjenstanden i boet' using errcode = '22023'; end if;
    if coalesce(v_item.status, 'active') = 'assigned' then raise exception 'Gjenstanden er tildelt en arving' using errcode = '22023'; end if;
    if v_item.disposition is not distinct from v_disp then continue; end if;
    update items set disposition = v_disp where id = v_item.id;
    perform public.log_estate_event(p_estate, v_item.id, 'disposition_set', jsonb_build_object('disposition', v_disp, 'previous', v_item.disposition));
    n := n + 1;
  end loop;
  return jsonb_build_object('updated', n);
end;
$$;
revoke all on function public.set_dispositions(uuid, jsonb) from public, anon;
grant execute on function public.set_dispositions(uuid, jsonb) to authenticated;

-- Tildeling fjerner en foreløpig disponering (gjenstanden går da til en arving)
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
    update items set assigned_to = v_user, status = 'assigned', disposition = null where id = v_item.id;
    if v_item.disposition is not null then
      perform public.log_estate_event(p_estate, v_item.id, 'disposition_set', jsonb_build_object('disposition', null, 'previous', v_item.disposition, 'reason', 'assigned'));
    end if;
    perform public.log_estate_event(p_estate, v_item.id, 'assigned', jsonb_build_object('to', v_user, 'method', p_method));
    n_ok := n_ok + 1;
  end loop;
  return jsonb_build_object('assigned', n_ok, 'skipped', skipped);
end;
$$;

-- Demokontoene kan prøve disponering i demoboet, som tildeling (resten av guard_item_update som i 20261012)
create or replace function public.guard_item_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if new.estate_id is distinct from old.estate_id then
    raise exception 'Gjenstanden kan ikke flyttes til et annet bo' using errcode = '42501';
  end if;
  if (new.assigned_to is distinct from old.assigned_to or new.status is distinct from old.status)
     and not public.is_estate_admin(old.estate_id) then
    raise exception 'Bare administratorer kan tildele gjenstander' using errcode = '42501';
  end if;
  if (new.estimated_value is distinct from old.estimated_value
      or new.estimate_reasoning is distinct from old.estimate_reasoning
      or new.estimate_confidence is distinct from old.estimate_confidence
      or new.ai_analysis is distinct from old.ai_analysis)
     and not public.is_estate_admin(old.estate_id)
     and old.added_by is distinct from auth.uid() then
    raise exception 'Bare administrator eller den som la inn gjenstanden kan endre verdien eller AI-vurderingen' using errcode = '42501';
  end if;
  if new.marked_for_disposal is distinct from old.marked_for_disposal
     and not public.is_estate_admin(old.estate_id) then
    raise exception 'Bare administratorer kan merke gjenstander for kast' using errcode = '42501';
  end if;
  if public.is_demo_user()
     and (to_jsonb(new) - '{assigned_to,status,marked_for_disposal,disposition}'::text[])
         is distinct from (to_jsonb(old) - '{assigned_to,status,marked_for_disposal,disposition}'::text[]) then
    raise exception 'Demokontoen kan ikke endre gjenstander' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Demo: nullstillingen fjerner også disponeringene (resten som i 20261017)
do $$
declare def text;
begin
  def := pg_get_functiondef('public.reset_demo_estate()'::regprocedure);
  if position('disposition = null' in def) = 0 then
    def := replace(def, 'marked_for_disposal = false where estate_id = v_estate;', 'marked_for_disposal = false, disposition = null where estate_id = v_estate;');
    execute def;
  end if;
end $$;

notify pgrst, 'reload schema';
