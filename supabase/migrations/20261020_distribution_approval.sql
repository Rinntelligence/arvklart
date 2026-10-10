-- F6: beslutningstakere, representasjon, forslag og godkjenning av fordelingen.
--
-- Hovedregel: fordelingen er godkjent først når ALLE beslutningstakere har registrert sin godkjenning i
-- Arvklart – selv, eller via en representant som en annen beslutningstaker har bekreftet. Godkjenningene er
-- registreringer i Arvklart, ikke juridisk verifiserte elektroniske signaturer. Ingen administrator kan
-- gjøre fordelingen godkjent alene:
--   • heirs.must_approve kan bare settes til false av arvingen selv, eller etter en forespørsel fra admin som
--     en annen beslutningstaker bekrefter. Rådgiverroller (bobestyrer, advokat, rådgiver) er unntatt fra start.
--   • En beslutningstaker som er koblet til en konto, eller som står i et forslag, kan ikke slettes fra arvelisten.
--   • Representasjon (fullmakt/verge) registrert av admin er ubekreftet til en annen beslutningstaker – ikke
--     representanten og ikke den som registrerte den – bekrefter den. Ubekreftet representasjon kan ikke svare.
--   • Forslaget fryser hvem som skal godkjenne. Arvelisten, beslutningstakere, koblinger, representasjon,
--     tildelinger, fordelingsverdier og disponering inngår i et tilstandsavtrykk; endres noe, er forslaget
--     utdatert og alle må godkjenne en ny versjon.
--   • Versjoner og svar kan ikke endres eller slettes fra appen (append-only; godkjenningstidspunktet settes én gang).
-- Arvinger uten konto og uten bekreftet representant gjør at forslaget ikke kan godkjennes digitalt; da tilbys
-- protokollen på papir.
--
-- Kan kjøres flere ganger.

-- ── Beslutningstakere på arvelisten ─────────────────────────────────────────────

alter table public.heirs add column if not exists must_approve boolean;
update public.heirs set must_approve = (relationship is null or relationship not in ('Bobestyrer', 'Advokat', 'Rådgiver')) where must_approve is null;
alter table public.heirs alter column must_approve set not null;
alter table public.heirs alter column must_approve set default true;
alter table public.heirs add column if not exists exclusion_requested_by uuid references auth.users(id) on delete set null;
alter table public.heirs add column if not exists exclusion_reason text;
alter table public.heirs add column if not exists exclusion_requested_at timestamptz;

create or replace function public.protected_heir_columns()
returns text[] language sql immutable as $$
  select array['user_id', 'linked_via', 'linked_at', 'estate_id', 'must_approve', 'exclusion_requested_by', 'exclusion_reason', 'exclusion_requested_at']
$$;
select public.apply_update_grants('heirs', public.protected_heir_columns());

-- Ny arving: rådgiverroller er ikke beslutningstakere; alle andre er det. Koblingen settes aldri ved insert.
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

-- Brukere som er beslutningstakere i boet (koblet til en arving med must_approve)
create or replace function public.is_estate_decider(p_estate uuid, p_user uuid default auth.uid())
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from heirs where estate_id = p_estate and user_id = p_user and must_approve)
$$;
grant execute on function public.is_estate_decider(uuid, uuid) to authenticated;

-- Ta ut en beslutningstaker (true → false) eller legge til (false → true).
--   • Arvingen selv kan ta seg ut (med begrunnelse).
--   • Admin kan legge til uten videre, men bare BE OM å ta ut; en annen beslutningstaker må bekrefte.
create or replace function public.set_must_approve(p_heir uuid, p_value boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h heirs%rowtype;
begin
  select * into h from heirs where id = p_heir for update;
  if not found or not public.is_estate_member(h.estate_id) then raise exception 'Fant ikke arvingen' using errcode = '42501'; end if;
  if not public.estate_is_open(h.estate_id) then raise exception 'Boet er avsluttet' using errcode = '42501'; end if;
  if public.is_demo_user() then raise exception 'Demokontoen kan ikke endre dette' using errcode = '42501'; end if;
  if p_value then
    if not public.is_estate_admin(h.estate_id) and h.user_id is distinct from auth.uid() then raise exception 'Bare administrator kan legge til beslutningstakere' using errcode = '42501'; end if;
    update heirs set must_approve = true, exclusion_requested_by = null, exclusion_reason = null, exclusion_requested_at = null where id = p_heir;
    perform public.log_estate_event(h.estate_id, null, 'decider_added', jsonb_build_object('heir_id', p_heir, 'name', h.name));
    return jsonb_build_object('ok', true, 'must_approve', true);
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Skriv en begrunnelse' using errcode = '22023'; end if;
  if h.user_id = auth.uid() then
    update heirs set must_approve = false, exclusion_requested_by = null, exclusion_reason = null, exclusion_requested_at = null where id = p_heir;
    perform public.log_estate_event(h.estate_id, null, 'decider_removed', jsonb_build_object('heir_id', p_heir, 'name', h.name, 'by_self', true, 'reason', trim(p_reason)));
    return jsonb_build_object('ok', true, 'must_approve', false);
  end if;
  if not public.is_estate_admin(h.estate_id) then raise exception 'Bare arvingen selv eller administrator kan be om dette' using errcode = '42501'; end if;
  update heirs set exclusion_requested_by = auth.uid(), exclusion_reason = trim(p_reason), exclusion_requested_at = now() where id = p_heir;
  perform public.log_estate_event(h.estate_id, null, 'decider_removal_requested', jsonb_build_object('heir_id', p_heir, 'name', h.name, 'reason', trim(p_reason)));
  return jsonb_build_object('ok', true, 'pending', true);
end;
$$;

-- En annen beslutningstaker (ikke den som ba om det) bekrefter at arvingen ikke skal godkjenne
create or replace function public.confirm_decider_removal(p_heir uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h heirs%rowtype;
begin
  select * into h from heirs where id = p_heir for update;
  if not found or not public.is_estate_member(h.estate_id) then raise exception 'Fant ikke arvingen' using errcode = '42501'; end if;
  if not public.estate_is_open(h.estate_id) then raise exception 'Boet er avsluttet' using errcode = '42501'; end if;
  if h.exclusion_requested_by is null then raise exception 'Ingen forespørsel å bekrefte' using errcode = '22023'; end if;
  if h.exclusion_requested_by = auth.uid() then raise exception 'Den som ba om det, kan ikke bekrefte selv' using errcode = '42501'; end if;
  if not (public.is_estate_decider(h.estate_id) or h.user_id = auth.uid()) then
    raise exception 'Bare en annen beslutningstaker eller arvingen selv kan bekrefte' using errcode = '42501';
  end if;
  update heirs set must_approve = false where id = p_heir;
  perform public.log_estate_event(h.estate_id, null, 'decider_removed', jsonb_build_object('heir_id', p_heir, 'name', h.name, 'requested_by', h.exclusion_requested_by, 'reason', h.exclusion_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Representasjon (fullmakt / verge) ───────────────────────────────────────────

create table if not exists public.heir_representatives (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates(id) on delete cascade,
  heir_id uuid not null references public.heirs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fullmakt', 'verge')),
  basis text not null check (length(trim(basis)) between 10 and 1000),
  document_id uuid references public.documents(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz
);
create index if not exists heir_representatives_heir_idx on public.heir_representatives (heir_id);
alter table public.heir_representatives enable row level security;
drop policy if exists "heir_representatives_select" on public.heir_representatives;
create policy "heir_representatives_select" on public.heir_representatives for select using (public.is_estate_member(estate_id));
revoke insert, update, delete on public.heir_representatives from anon, authenticated;
grant select on public.heir_representatives to authenticated;

create or replace function public.add_representative(p_heir uuid, p_user uuid, p_kind text, p_basis text, p_document uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  h heirs%rowtype;
  v_id uuid;
begin
  select * into h from heirs where id = p_heir;
  if not found then raise exception 'Fant ikke arvingen' using errcode = '42501'; end if;
  perform public.require_estate_admin(h.estate_id);
  if public.is_demo_user() then raise exception 'Demokontoen kan ikke endre dette' using errcode = '42501'; end if;
  if not exists (select 1 from estate_members where estate_id = h.estate_id and user_id = p_user) then raise exception 'Representanten må være medlem av boet' using errcode = '22023'; end if;
  if h.user_id = p_user then raise exception 'En arving kan ikke representere seg selv' using errcode = '22023'; end if;
  if p_document is not null and not exists (select 1 from documents where id = p_document and estate_id = h.estate_id) then raise exception 'Dokumentet finnes ikke i boet' using errcode = '22023'; end if;
  if exists (select 1 from heir_representatives where heir_id = p_heir and revoked_at is null) then raise exception 'Arvingen har allerede en representant' using errcode = '22023'; end if;
  insert into heir_representatives (estate_id, heir_id, user_id, kind, basis, document_id, created_by)
  values (h.estate_id, p_heir, p_user, p_kind, trim(p_basis), p_document, auth.uid()) returning id into v_id;
  perform public.log_estate_event(h.estate_id, null, 'representative_added',
    jsonb_build_object('heir_id', p_heir, 'name', h.name, 'user_id', p_user, 'kind', p_kind, 'self', p_user = auth.uid()));
  return v_id;
end;
$$;

-- Bekreftelse: en beslutningstaker som verken er representanten eller den som registrerte representasjonen
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

-- Trekkes tilbake av administrator, representanten eller arvingen selv
create or replace function public.revoke_representative(p_rep uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r heir_representatives%rowtype;
begin
  select * into r from heir_representatives where id = p_rep for update;
  if not found or not public.is_estate_member(r.estate_id) then raise exception 'Fant ikke representasjonen' using errcode = '42501'; end if;
  if r.revoked_at is not null then return jsonb_build_object('ok', true); end if;
  if not (public.is_estate_admin(r.estate_id) or r.user_id = auth.uid() or exists (select 1 from heirs where id = r.heir_id and user_id = auth.uid())) then
    raise exception 'Bare administrator, representanten eller arvingen kan trekke representasjonen' using errcode = '42501';
  end if;
  update heir_representatives set revoked_by = auth.uid(), revoked_at = now() where id = p_rep;
  perform public.log_estate_event(r.estate_id, null, 'representative_revoked', jsonb_build_object('rep_id', p_rep, 'heir_id', r.heir_id, 'user_id', r.user_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Endringer i arvelisten logges, og beslutningstakere kan ikke slettes fritt ───

create or replace function public.guard_heir_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_estate uuid := coalesce(new.estate_id, old.estate_id);
begin
  if tg_op = 'DELETE' then
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

-- ── Forslag og svar ─────────────────────────────────────────────────────────────

create table if not exists public.distribution_versions (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates(id) on delete cascade,
  version_no int not null,
  snapshot jsonb not null,
  state_hash text not null,
  required jsonb not null, -- [{ heir_id, name, user_id }] frosset ved forslaget
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (estate_id, version_no)
);
create table if not exists public.distribution_responses (
  id bigserial primary key,
  version_id uuid not null references public.distribution_versions(id) on delete cascade,
  heir_id uuid not null,
  heir_name text not null,
  responder uuid references auth.users(id) on delete set null,
  responder_email text,
  representative_id uuid references public.heir_representatives(id) on delete set null,
  decision text not null check (decision in ('approve', 'object')),
  reason text check (reason is null or length(reason) <= 2000),
  item_id uuid references public.items(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists distribution_responses_version_idx on public.distribution_responses (version_id, heir_id, id);

alter table public.distribution_versions enable row level security;
alter table public.distribution_responses enable row level security;
drop policy if exists "distribution_versions_select" on public.distribution_versions;
create policy "distribution_versions_select" on public.distribution_versions for select using (public.is_estate_member(estate_id));
drop policy if exists "distribution_responses_select" on public.distribution_responses;
create policy "distribution_responses_select" on public.distribution_responses for select using (
  exists (select 1 from distribution_versions v where v.id = version_id and public.is_estate_member(v.estate_id))
);
revoke insert, update, delete on public.distribution_versions, public.distribution_responses from anon, authenticated;
grant select on public.distribution_versions, public.distribution_responses to authenticated;

-- Uforanderlig: versjoner endres bare ved at godkjenningstidspunktet settes én gang; svar endres aldri.
-- (Sletting skjer bare når boet slettes, eller når demoen nullstilles.)
create or replace function public.guard_distribution_immutable()
returns trigger language plpgsql as $$
declare
  -- Kolonner som kan nulles ut når en bruker, gjenstand eller representasjon slettes (fremmednøkler med
  -- «on delete set null»), og ved kontosletting (anonymize_estate_events). Ellers endres ingenting.
  nullable text[] := array['created_by', 'responder', 'responder_email', 'representative_id', 'item_id'];
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
begin
  if tg_table_name = 'distribution_versions'
     and o->>'approved_at' is null and n->>'approved_at' is not null
     and (n - 'approved_at') = (o - 'approved_at') then
    return new;
  end if;
  if (n - nullable) = (o - nullable) then
    foreach k in array nullable loop
      if (n ? k) and (n->k) is distinct from (o->k) and jsonb_typeof(n->k) <> 'null' then
        raise exception 'Godkjente versjoner og svar kan ikke endres' using errcode = '42501';
      end if;
    end loop;
    return new;
  end if;
  raise exception 'Godkjente versjoner og svar kan ikke endres' using errcode = '42501';
end;
$$;
drop trigger if exists guard_distribution_versions on public.distribution_versions;
create trigger guard_distribution_versions before update on public.distribution_versions for each row execute function public.guard_distribution_immutable();
drop trigger if exists guard_distribution_responses on public.distribution_responses;
create trigger guard_distribution_responses before update on public.distribution_responses for each row execute function public.guard_distribution_immutable();

-- Sperren må kjøre før sletting; loggingen etter innsetting/endring (når must_approve er satt av guard_heir_insert)
drop trigger if exists guard_heir_change on public.heirs;
drop trigger if exists guard_heir_delete on public.heirs;
create trigger guard_heir_delete before delete on public.heirs for each row execute function public.guard_heir_change();
drop trigger if exists log_heir_change on public.heirs;
create trigger log_heir_change after insert or update on public.heirs for each row execute function public.guard_heir_change();

-- Tilstanden fordelingen gjelder, i fast rekkefølge. Avtrykket (md5) avgjør om et forslag er utdatert.
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
revoke all on function public.distribution_state(uuid) from public, anon, authenticated;

create or replace function public.distribution_state_hash(p_estate uuid)
returns text language sql security definer stable set search_path = public as $$
  select md5(public.distribution_state(p_estate)::text)
$$;
revoke all on function public.distribution_state_hash(uuid) from public, anon, authenticated;

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

-- Status for en versjon: pending | objected | approved | outdated | not_digitally_approvable, og per beslutningstaker
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
grant execute on function public.distribution_status(uuid) to authenticated;

-- Svar på et forslag: bare beslutningstakeren selv (koblet konto) eller en bekreftet representant.
-- Innsigelse krever begrunnelse og kan knyttes til en gjenstand. Godkjent når alle har godkjent.
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

revoke all on function public.set_must_approve(uuid, boolean, text), public.confirm_decider_removal(uuid), public.add_representative(uuid, uuid, text, text, uuid),
  public.verify_representative(uuid), public.revoke_representative(uuid), public.propose_distribution(uuid), public.respond_distribution(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.set_must_approve(uuid, boolean, text), public.confirm_decider_removal(uuid), public.add_representative(uuid, uuid, text, text, uuid),
  public.verify_representative(uuid), public.revoke_representative(uuid), public.propose_distribution(uuid), public.respond_distribution(uuid, uuid, text, text, uuid) to authenticated;

-- Kontosletting: også e-posten i svarene fjernes (avsender settes til null av fremmednøkkelen)
create or replace function public.anonymize_estate_events(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update estate_events set data = replace(data::text, p_user::text, '00000000-0000-0000-0000-000000000000')::jsonb
  where data::text like '%' || p_user::text || '%';
  get diagnostics n = row_count;
  update distribution_responses set responder_email = null where responder = p_user and responder_email is not null;
  return n;
end;
$$;
revoke all on function public.anonymize_estate_events(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_estate_events(uuid) to service_role;

-- ── Demo: nullstillingen fjerner forslag og svar (ingen simulerte godkjenninger) ─
do $$
declare def text;
begin
  def := pg_get_functiondef('public.reset_demo_estate()'::regprocedure);
  if position('distribution_versions' in def) = 0 then
    def := replace(def, '  -- Loggen starter tom for hver besøkende.', '  delete from distribution_versions where estate_id = v_estate;
  update heir_representatives set revoked_at = coalesce(revoked_at, now()) where estate_id = v_estate;
  -- Loggen starter tom for hver besøkende.');
    execute def;
  end if;
end $$;

notify pgrst, 'reload schema';
