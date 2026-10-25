-- Rull tilbake 20261023_settled_assignment_checks.sql: assign_items og draw_lot som i 20261021_heir_assignment.sql,
-- og hjelpefunksjonene fjernes. Tildelinger og logg (også pending_responses) beholdes uendret.
begin;
create or replace function public.assign_items(p_estate uuid, p_assignments jsonb, p_method text default 'manual')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a jsonb;
  v_item items%rowtype;
  v_heir heirs%rowtype;
  v_draw jsonb;
  v_draw_heir uuid;
  n_ok int := 0;
  skipped jsonb := '[]'::jsonb;
begin
  perform public.require_estate_admin(p_estate);
  if p_method not in ('manual', 'lottery', 'snake', 'equal') then raise exception 'Ukjent metode' using errcode = '22023'; end if;
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
    if p_method = 'lottery' then
      select data into v_draw from estate_events where item_id = v_item.id and kind = 'lottery_draw' order by id desc limit 1;
      v_draw_heir := coalesce((v_draw->>'winner_heir')::uuid,
        (select h.id from heirs h where h.estate_id = p_estate and h.user_id = (v_draw->>'winner')::uuid));
      if v_draw is null or v_draw_heir is distinct from v_heir.id then
        raise exception 'Tildelingen må være lik siste loddtrekning' using errcode = '22023';
      end if;
    end if;
    update items set assigned_heir_id = v_heir.id, assigned_to = v_heir.user_id, status = 'assigned', disposition = null where id = v_item.id;
    if v_item.disposition is not null then
      perform public.log_estate_event(p_estate, v_item.id, 'disposition_set', jsonb_build_object('disposition', null, 'previous', v_item.disposition, 'reason', 'assigned'));
    end if;
    perform public.log_estate_event(p_estate, v_item.id, 'assigned',
      jsonb_build_object('to', v_heir.user_id, 'heir_id', v_heir.id, 'name', v_heir.name, 'method', p_method));
    n_ok := n_ok + 1;
  end loop;
  return jsonb_build_object('assigned', n_ok, 'skipped', skipped);
end;
$$;

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

drop function if exists public.item_is_settled(uuid);
drop function if exists public.item_pending_members(uuid);
drop function if exists public.item_interested_members(uuid);
do $$ begin
  if to_regprocedure('public.apply_function_grants()') is not null then perform public.apply_function_grants(); end if;
end $$;
notify pgrst, 'reload schema';
commit;
