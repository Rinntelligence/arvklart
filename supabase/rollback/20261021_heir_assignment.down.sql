-- Rull tilbake 20261021_heir_assignment.sql: tildeling til konto igjen (assigned_to), ingen mottakerstatus,
-- og avtrykket som i 20261020. Deploy forrige frontend først.
-- Stopper hvis en gjenstand er tildelt en person uten konto (den tildelingen ville gått tapt): angre eller
-- flytt den først. Representasjoner der representantens konto er slettet (user_id null), fjernes.
-- Forslag lagt frem etter 20261021 har et annet avtrykk og vil stå som utdatert etter tilbakerulling.
begin;
do $$ begin
  if exists (select 1 from public.items where status = 'assigned' and assigned_to is null and assigned_heir_id is not null) then
    raise exception 'Gjenstander er tildelt personer uten konto. Angre de tildelingene før tilbakerulling.';
  end if;
end $$;
-- guard_heir_insert: versjonen fra 20261020_distribution_approval.sql
create or replace function public.guard_heir_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    if new.user_id is not null or new.linked_via is not null or new.linked_at is not null then
      raise exception 'Koblingen til en konto settes bare når arvingen selv blir med' using errcode = '42501';
    end if;
    new.must_approve := new.relationship is null or new.relationship not in ('Bobestyrer', 'Advokat', 'Rådgiver');
    new.exclusion_requested_by := null; new.exclusion_reason := null; new.exclusion_requested_at := null;
  end if;
  return new;
end;
$$;
-- guard_item_insert: versjonen fra 20261019_item_disposition.sql
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
-- guard_item_update: versjonen fra 20261019_item_disposition.sql
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
-- assign_items: versjonen fra 20261019_item_disposition.sql
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
-- unassign_item: versjonen fra 20261017_estate_events_and_assignment.sql
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
-- draw_lot: versjonen fra 20261017_estate_events_and_assignment.sql
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
-- guard_heir_change: versjonen fra 20261020_distribution_approval.sql
create or replace function public.guard_heir_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_estate uuid := coalesce(new.estate_id, old.estate_id);
begin
  if tg_op = 'DELETE' then
    -- Hele boet slettes (kaskade): ingen sperre og ingen logg
    if not exists (select 1 from estates where id = old.estate_id) then return old; end if;
    if coalesce(auth.role(), '') = 'authenticated' and old.must_approve
       and (old.user_id is not null or exists (select 1 from distribution_versions v where v.estate_id = old.estate_id and v.required @> jsonb_build_array(jsonb_build_object('heir_id', old.id)))) then
      raise exception 'Arvingen er beslutningstaker og kan ikke slettes. Be om at arvingen tas ut som beslutningstaker først.' using errcode = '42501';
    end if;
    if coalesce(auth.role(), '') = 'authenticated' then
      perform public.log_estate_event(v_estate, null, 'heir_removed', jsonb_build_object('heir_id', old.id, 'name', old.name, 'must_approve', old.must_approve));
    end if;
    return old;
  end if;
  if coalesce(auth.role(), '') = 'authenticated' then
    if tg_op = 'INSERT' then
      perform public.log_estate_event(v_estate, null, 'heir_added', jsonb_build_object('heir_id', new.id, 'name', new.name, 'relationship', new.relationship, 'must_approve', new.must_approve));
    elsif new.name is distinct from old.name or new.email is distinct from old.email or new.relationship is distinct from old.relationship or new.percentage is distinct from old.percentage then
      perform public.log_estate_event(v_estate, null, 'heir_changed', jsonb_build_object('heir_id', new.id, 'name', new.name,
        'changed', (select jsonb_agg(k) from unnest(array['name', 'email', 'relationship', 'percentage']) k
                    where (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k))));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
-- verify_representative: versjonen fra 20261020_distribution_approval.sql
create or replace function public.verify_representative(p_rep uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r heir_representatives%rowtype;
begin
  select * into r from heir_representatives where id = p_rep for update;
  if not found or not public.is_estate_member(r.estate_id) then raise exception 'Fant ikke representasjonen' using errcode = '42501'; end if;
  if not public.estate_is_open(r.estate_id) then raise exception 'Boet er avsluttet' using errcode = '42501'; end if;
  if r.revoked_at is not null or r.verified_at is not null then raise exception 'Representasjonen er allerede avklart' using errcode = '22023'; end if;
  if r.user_id = auth.uid() or r.created_by = auth.uid() then raise exception 'Representanten eller den som registrerte den kan ikke bekrefte selv' using errcode = '42501'; end if;
  if not public.is_estate_decider(r.estate_id) then raise exception 'Bare en annen beslutningstaker kan bekrefte' using errcode = '42501'; end if;
  update heir_representatives set verified_by = auth.uid(), verified_at = now() where id = p_rep;
  perform public.log_estate_event(r.estate_id, null, 'representative_verified', jsonb_build_object('rep_id', p_rep, 'heir_id', r.heir_id, 'user_id', r.user_id));
  return jsonb_build_object('ok', true);
end;
$$;
-- distribution_state: versjonen fra 20261020_distribution_approval.sql
create or replace function public.distribution_state(p_estate uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'status', coalesce(i.status, 'active'), 'assigned_to', i.assigned_to,
        'agreed_value', i.agreed_value, 'disposition', i.disposition,
        'wanted_by', (select count(*) from interests x where x.item_id = i.id)) order by i.id) from items i where i.estate_id = p_estate), '[]'::jsonb),
    'heirs', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'email', h.email, 'relationship', h.relationship, 'percentage', h.percentage,
        'must_approve', h.must_approve, 'user_id', h.user_id) order by h.id) from heirs h where h.estate_id = p_estate), '[]'::jsonb),
    'representatives', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'heir_id', r.heir_id, 'user_id', r.user_id, 'kind', r.kind, 'verified', r.verified_at is not null) order by r.id)
        from heir_representatives r where r.estate_id = p_estate and r.revoked_at is null), '[]'::jsonb),
    'shares_confirmed', (select shares_confirmed from estates where id = p_estate),
    'split_mode', (select split_mode from estates where id = p_estate)
  )
$$;
-- propose_distribution: versjonen fra 20261020_distribution_approval.sql
create or replace function public.propose_distribution(p_estate uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_required jsonb;
  v_no int;
  v_id uuid;
  v_state jsonb;
  v_names jsonb;
begin
  perform public.require_estate_admin(p_estate);
  perform 1 from estates where id = p_estate for update; -- én forslagsrunde om gangen
  select coalesce(jsonb_agg(jsonb_build_object('heir_id', id, 'name', name, 'user_id', user_id) order by name, id), '[]'::jsonb)
    into v_required from heirs where estate_id = p_estate and must_approve;
  if jsonb_array_length(v_required) = 0 then raise exception 'Ingen beslutningstakere på arvelisten' using errcode = '22023'; end if;
  select coalesce(max(version_no), 0) + 1 into v_no from distribution_versions where estate_id = p_estate;
  v_state := public.distribution_state(p_estate);
  select coalesce(jsonb_object_agg(m.user_id, coalesce(p.display_name, '')), '{}'::jsonb) into v_names
    from estate_members m left join profiles p on p.user_id = m.user_id where m.estate_id = p_estate;
  insert into distribution_versions (estate_id, version_no, snapshot, state_hash, required, created_by)
  values (p_estate, v_no, v_state || jsonb_build_object('estate_name', (select name from estates where id = p_estate), 'member_names', v_names),
          md5(v_state::text), v_required, auth.uid())
  returning id into v_id;
  perform public.log_estate_event(p_estate, null, 'distribution_proposed', jsonb_build_object('version_id', v_id, 'version_no', v_no));
  return jsonb_build_object('id', v_id, 'version_no', v_no);
end;
$$;
-- distribution_status: versjonen fra 20261020_distribution_approval.sql
create or replace function public.distribution_status(p_version uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v distribution_versions%rowtype;
  v_outdated boolean;
  v_heirs jsonb := '[]'::jsonb;
  r jsonb;
  h heirs%rowtype;
  last distribution_responses%rowtype;
  v_rep heir_representatives%rowtype;
  n_ok int := 0; n_obj int := 0; n_unreachable int := 0;
  v_state text;
begin
  select * into v from distribution_versions where id = p_version;
  if not found or not public.is_estate_member(v.estate_id) then raise exception 'Fant ikke forslaget' using errcode = '42501'; end if;
  v_outdated := public.distribution_state_hash(v.estate_id) <> v.state_hash;
  for r in select * from jsonb_array_elements(v.required) loop
    select * into h from heirs where id = (r->>'heir_id')::uuid;
    select * into last from distribution_responses where version_id = v.id and heir_id = (r->>'heir_id')::uuid order by id desc limit 1;
    select * into v_rep from heir_representatives where heir_id = (r->>'heir_id')::uuid and revoked_at is null and verified_at is not null order by created_at desc limit 1;
    if last.decision = 'approve' then n_ok := n_ok + 1; elsif last.decision = 'object' then n_obj := n_obj + 1; end if;
    if last.id is null and h.user_id is null and v_rep.id is null then n_unreachable := n_unreachable + 1; end if;
    v_heirs := v_heirs || jsonb_build_array(jsonb_build_object(
      'heir_id', r->>'heir_id', 'name', r->>'name', 'user_id', h.user_id,
      'representative', case when v_rep.id is null then null else jsonb_build_object('id', v_rep.id, 'user_id', v_rep.user_id, 'kind', v_rep.kind) end,
      'decision', last.decision, 'reason', last.reason, 'item_id', last.item_id, 'at', last.created_at,
      'responder', last.responder, 'responder_email', last.responder_email, 'via_representative', last.representative_id is not null));
    last := null; v_rep := null;
  end loop;
  v_state := case
    when v.approved_at is not null then 'approved'
    when v_outdated then 'outdated'
    when n_obj > 0 then 'objected'
    when n_unreachable > 0 then 'not_digitally_approvable'
    else 'pending' end;
  return jsonb_build_object('id', v.id, 'version_no', v.version_no, 'state', v_state, 'outdated', v_outdated, 'approved_at', v.approved_at,
    'created_at', v.created_at, 'required', jsonb_array_length(v.required), 'approved', n_ok, 'objections', n_obj, 'heirs', v_heirs);
end;
$$;
-- respond_distribution: versjonen fra 20261020_distribution_approval.sql
create or replace function public.respond_distribution(p_version uuid, p_heir uuid, p_decision text, p_reason text default null, p_item uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v distribution_versions%rowtype;
  h heirs%rowtype;
  v_rep uuid;
  v_all boolean;
begin
  select * into v from distribution_versions where id = p_version for update;
  if not found or not public.is_estate_member(v.estate_id) then raise exception 'Fant ikke forslaget' using errcode = '42501'; end if;
  if not public.estate_is_open(v.estate_id) then raise exception 'Boet er avsluttet' using errcode = '42501'; end if;
  if v.approved_at is not null then raise exception 'Forslaget er allerede godkjent' using errcode = '22023'; end if;
  if public.distribution_state_hash(v.estate_id) <> v.state_hash then raise exception 'Forslaget er utdatert; alle må svare på en ny versjon' using errcode = '22023'; end if;
  if p_decision not in ('approve', 'object') then raise exception 'Ugyldig svar' using errcode = '22023'; end if;
  if not (v.required @> jsonb_build_array(jsonb_build_object('heir_id', p_heir))) then raise exception 'Arvingen skal ikke godkjenne dette forslaget' using errcode = '22023'; end if;
  select * into h from heirs where id = p_heir;
  if h.user_id is distinct from auth.uid() then
    select id into v_rep from heir_representatives
    where heir_id = p_heir and user_id = auth.uid() and revoked_at is null and verified_at is not null limit 1;
    if v_rep is null then raise exception 'Du kan bare svare for deg selv, eller som bekreftet representant' using errcode = '42501'; end if;
  end if;
  if p_decision = 'object' and length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Skriv hvorfor du ikke er enig' using errcode = '22023'; end if;
  if p_item is not null and not exists (select 1 from items where id = p_item and estate_id = v.estate_id) then raise exception 'Fant ikke gjenstanden' using errcode = '22023'; end if;
  insert into distribution_responses (version_id, heir_id, heir_name, responder, responder_email, representative_id, decision, reason, item_id)
  values (p_version, p_heir, h.name, auth.uid(), auth.email(), v_rep, p_decision, nullif(trim(coalesce(p_reason, '')), ''), p_item);
  perform public.log_estate_event(v.estate_id, p_item, case when p_decision = 'approve' then 'distribution_approved_by' else 'distribution_objected_by' end,
    jsonb_build_object('version_id', p_version, 'heir_id', p_heir, 'name', h.name, 'via_representative', v_rep is not null));
  -- Godkjent når siste svar fra hver påkrevde beslutningstaker er en godkjenning
  select bool_and(coalesce((select d.decision = 'approve' from distribution_responses d where d.version_id = v.id and d.heir_id = (q->>'heir_id')::uuid order by d.id desc limit 1), false))
    into v_all from jsonb_array_elements(v.required) q;
  if v_all then
    update distribution_versions set approved_at = now() where id = v.id;
    perform public.log_estate_event(v.estate_id, null, 'distribution_approved', jsonb_build_object('version_id', v.id, 'version_no', v.version_no));
  end if;
  return public.distribution_status(p_version);
end;
$$;
drop trigger if exists guard_heir_receives on public.heirs;
drop function if exists public.guard_heir_receives();
drop function if exists public.set_receives_items(uuid, boolean);
drop function if exists public.confirm_assignment_recipient(uuid, uuid);
drop function if exists public.distribution_authority_hash(uuid);
alter table public.distribution_versions drop column if exists authority_hash;
delete from public.heir_representatives where user_id is null;
alter table public.heir_representatives drop constraint if exists heir_representatives_user_id_fkey;
alter table public.heir_representatives alter column user_id set not null;
alter table public.heir_representatives add constraint heir_representatives_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
do $$
declare def text;
begin
  def := pg_get_functiondef('public.reset_demo_estate()'::regprocedure);
  def := replace(def, 'assigned_to = null, assigned_heir_id = null, status', 'assigned_to = null, status');
  execute def;
end $$;
delete from public.protected_columns where (table_name = 'items' and column_name = 'assigned_heir_id') or (table_name = 'heirs' and column_name = 'receives_items');
alter table public.items drop column if exists assigned_heir_id;
alter table public.heirs drop column if exists receives_items;
select public.apply_item_update_grants();
select public.apply_update_grants('heirs', public.protected_heir_columns());
notify pgrst, 'reload schema';
commit;
