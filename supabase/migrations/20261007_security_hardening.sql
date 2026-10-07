-- Tilgangsregler for hele appen, samlet ett sted.
--
-- Kjøres i Supabase SQL Editor ETTER 20261005_* og 20261006_founder_security.sql, og FØR frontend deployes.
-- Founder-tilgangen (is_founder() med tofaktor, founder_dashboard() osv.) fra 20261006 beholdes uendret;
-- founders leser data via de funksjonene, ikke via policies.
-- Scriptet sletter ALLE eksisterende policies på tabellene under og lager dem på nytt, slik at
-- resultatet blir det samme uansett hva som er lagt inn manuelt i dashboardet tidligere.
--
-- Hva som strammes inn:
--   • Bare medlemmer av et bo ser boets data. Profiler er synlige for deg selv og folk du deler bo med.
--   • Admin-handlinger håndheves i databasen: tildeling av gjenstander, arvinger, kategorier, fjerning av medlemmer.
--   • Brukere kan ikke gjøre seg selv til founder eller endre abonnement.
--   • Demokontoene (*.demo@heirsplit.no) kan bare vise interesse, si nei takk og prøve fordelingen.
--   • Dokumenthvelvet (estate-docs) blir privat; filer hentes med tidsbegrensede lenker.
--   • Bildebøtta (item-images) kan ikke lenger listes ut; nye bilder lagres under boets id.

begin;

do $$
begin
  if to_regclass('public.item_passes') is null then
    raise exception 'Kjør 20261005_item_passes.sql før denne migrasjonen.';
  end if;
  if to_regprocedure('public.shares_estate_with(uuid)') is null then
    raise exception 'Kjør 20261006_founder_security.sql før denne migrasjonen.';
  end if;
end $$;

-- ── Hjelpefunksjoner ────────────────────────────────────────────────────────────
-- security definer slik at policies kan slå opp medlemskap uten RLS-rekursjon.

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.is_estate_member(p_estate_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from estate_members where estate_id = p_estate_id and user_id = auth.uid());
$$;

create or replace function public.is_estate_admin(p_estate_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from estate_members where estate_id = p_estate_id and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_estate_owner(p_estate_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from estates where id = p_estate_id and owner_id = auth.uid());
$$;

create or replace function public.item_estate_id(p_item_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select estate_id from items where id = p_item_id;
$$;

create or replace function public.is_demo_user()
returns boolean language sql stable as $$
  select coalesce(lower(auth.email()) like '%.demo@heirsplit.no', false);
$$;

-- anon får også kjøre dem, så spørringer uten innlogging gir tomme svar i stedet for feil.
-- (shares_estate_with() kommer fra 20261006_founder_security.sql.)
grant execute on function
  public.try_uuid(text), public.is_estate_member(uuid), public.is_estate_admin(uuid),
  public.is_estate_owner(uuid), public.item_estate_id(uuid), public.shares_estate_with(uuid),
  public.is_demo_user()
to anon, authenticated;

-- ── Nye kolonner ────────────────────────────────────────────────────────────────

-- Avsluttede bo slettes automatisk 12 måneder etter closed_at (se functions/cleanup-closed-estates).
alter table public.estates add column if not exists closed_at timestamptz;

-- ── Fjern alle gamle policies ───────────────────────────────────────────────────

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in (
      'profiles', 'estates', 'estate_members', 'categories', 'items', 'interests', 'comments',
      'item_passes', 'feedback', 'tasks', 'documents', 'heirs', 'chores', 'goodwill_log'
    )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.profiles       enable row level security;
alter table public.estates        enable row level security;
alter table public.estate_members enable row level security;
alter table public.categories     enable row level security;
alter table public.items          enable row level security;
alter table public.interests      enable row level security;
alter table public.comments       enable row level security;
alter table public.item_passes    enable row level security;
alter table public.feedback       enable row level security;
alter table public.tasks          enable row level security;
alter table public.documents      enable row level security;
alter table public.heirs          enable row level security;
alter table public.chores         enable row level security;
alter table public.goodwill_log   enable row level security;

-- ── Profiler ────────────────────────────────────────────────────────────────────

create policy "profiles_select" on public.profiles for select using (
  user_id = auth.uid() or public.shares_estate_with(user_id)
);
create policy "profiles_insert" on public.profiles for insert with check (
  user_id = auth.uid() and not public.is_demo_user()
);
create policy "profiles_update" on public.profiles for update
  using (user_id = auth.uid() and not public.is_demo_user())
  with check (user_id = auth.uid());

-- Brukeren styrer navn og farge, ikke founder-flagg, abonnement eller e-post. Utvider triggeren fra
-- 20261006: current_user er 'authenticated'/'anon' for kall fra klienten, men eieren inne i
-- security definer-funksjoner (founder_set_plan) – de kan fortsatt endre plan.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_founder := false;
      new.plan := 'free';
    else
      new.user_id := old.user_id;
      new.is_founder := old.is_founder;
      new.plan := old.plan;
    end if;
    new.email := coalesce(auth.email(), new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields before insert or update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ── Bo og medlemmer ─────────────────────────────────────────────────────────────

create policy "estates_select" on public.estates for select using (
  public.is_estate_member(id) or owner_id = auth.uid()
);
create policy "estates_insert" on public.estates for insert with check (
  owner_id = auth.uid() and not public.is_demo_user()
);
create policy "estates_update" on public.estates for update
  using (public.is_estate_admin(id) and not public.is_demo_user())
  with check (public.is_estate_admin(id));

create policy "estate_members_select" on public.estate_members for select using (
  public.is_estate_member(estate_id)
);
-- Andre enn eieren kommer inn via join_estate(), fjernes via remove_estate_member().
create policy "estate_members_insert_owner" on public.estate_members for insert with check (
  user_id = auth.uid() and public.is_estate_owner(estate_id) and not public.is_demo_user()
);
create policy "estate_members_leave" on public.estate_members for delete using (
  user_id = auth.uid() and not public.is_demo_user()
);

-- ── Kategorier ──────────────────────────────────────────────────────────────────

create policy "categories_select" on public.categories for select using (
  estate_id is null or public.is_estate_member(estate_id)
);
create policy "categories_insert" on public.categories for insert with check (
  estate_id is not null and public.is_estate_member(estate_id) and not public.is_demo_user()
);
create policy "categories_delete" on public.categories for delete using (
  public.is_estate_admin(estate_id) and not public.is_demo_user()
);

-- ── Gjenstander ─────────────────────────────────────────────────────────────────

create policy "items_select" on public.items for select using (
  public.is_estate_member(estate_id)
);
create policy "items_insert" on public.items for insert with check (
  public.is_estate_member(estate_id) and added_by = auth.uid() and not public.is_demo_user()
  and coalesce(status, 'active') = 'active' and assigned_to is null
);
create policy "items_update" on public.items for update
  using (public.is_estate_member(estate_id))
  with check (public.is_estate_member(estate_id));
create policy "items_delete" on public.items for delete using (
  not public.is_demo_user() and (public.is_estate_admin(estate_id) or added_by = auth.uid())
);

-- Tildeling er en admin-handling; demokontoen kan bare tildele og merke for kast.
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
  if public.is_demo_user()
     and (to_jsonb(new) - '{assigned_to,status,marked_for_disposal}'::text[])
         is distinct from (to_jsonb(old) - '{assigned_to,status,marked_for_disposal}'::text[]) then
    raise exception 'Demokontoen kan ikke endre gjenstander' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_item_update on public.items;
create trigger guard_item_update before update on public.items
  for each row execute function public.guard_item_update();

-- ── Interesser, nei takk og kommentarer ─────────────────────────────────────────

create policy "interests_select" on public.interests for select using (
  public.is_estate_member(public.item_estate_id(item_id))
);
create policy "interests_insert" on public.interests for insert with check (
  user_id = auth.uid() and public.is_estate_member(public.item_estate_id(item_id))
);
create policy "interests_delete" on public.interests for delete using (user_id = auth.uid());

create policy "item_passes_select" on public.item_passes for select using (
  public.is_estate_member(public.item_estate_id(item_id))
);
create policy "item_passes_insert" on public.item_passes for insert with check (
  user_id = auth.uid() and public.is_estate_member(public.item_estate_id(item_id))
);
create policy "item_passes_delete" on public.item_passes for delete using (user_id = auth.uid());

create policy "comments_select" on public.comments for select using (
  public.is_estate_member(public.item_estate_id(item_id))
);
create policy "comments_insert" on public.comments for insert with check (
  user_id = auth.uid() and public.is_estate_member(public.item_estate_id(item_id)) and not public.is_demo_user()
);
create policy "comments_delete" on public.comments for delete using (
  user_id = auth.uid() and not public.is_demo_user()
);

-- ── Tilbakemeldinger ────────────────────────────────────────────────────────────

create policy "feedback_insert" on public.feedback for insert with check (
  user_id = auth.uid() and not public.is_demo_user()
);
-- Egen tilbakemelding kan leses (dataeksporten); founders leser alt via founder_dashboard().
create policy "feedback_select_own" on public.feedback for select using (user_id = auth.uid());

-- ── Oppgaver, dokumenter, arvinger ──────────────────────────────────────────────

create policy "tasks_select" on public.tasks for select using (public.is_estate_member(estate_id));
create policy "tasks_insert" on public.tasks for insert with check (
  public.is_estate_member(estate_id) and not public.is_demo_user()
);
create policy "tasks_update" on public.tasks for update
  using (public.is_estate_member(estate_id) and not public.is_demo_user())
  with check (public.is_estate_member(estate_id));
create policy "tasks_delete" on public.tasks for delete using (
  public.is_estate_admin(estate_id) and not public.is_demo_user()
);

create policy "documents_select" on public.documents for select using (public.is_estate_member(estate_id));
create policy "documents_insert" on public.documents for insert with check (
  public.is_estate_member(estate_id) and uploaded_by = auth.uid() and not public.is_demo_user()
);
create policy "documents_update" on public.documents for update
  using (public.is_estate_member(estate_id) and not public.is_demo_user())
  with check (public.is_estate_member(estate_id));
create policy "documents_delete" on public.documents for delete using (
  not public.is_demo_user() and (uploaded_by = auth.uid() or public.is_estate_admin(estate_id))
);

-- Arvingenes e-post bestemmer hvem som kan bli med i boet (join_estate), så bare admin endrer dem.
create policy "heirs_select" on public.heirs for select using (public.is_estate_member(estate_id));
create policy "heirs_insert" on public.heirs for insert with check (
  public.is_estate_admin(estate_id) and not public.is_demo_user()
);
create policy "heirs_update" on public.heirs for update
  using (public.is_estate_admin(estate_id) and not public.is_demo_user())
  with check (public.is_estate_admin(estate_id));
create policy "heirs_delete" on public.heirs for delete using (
  public.is_estate_admin(estate_id) and not public.is_demo_user()
);

-- ── Goodwill ────────────────────────────────────────────────────────────────────
-- Poeng skrives bare av complete_chore(), så ingen kan gi seg selv poeng direkte.

create policy "chores_select" on public.chores for select using (public.is_estate_member(estate_id));
create policy "chores_insert" on public.chores for insert with check (
  public.is_estate_member(estate_id) and not public.is_demo_user()
);
create policy "chores_update" on public.chores for update
  using (public.is_estate_member(estate_id) and not public.is_demo_user())
  with check (public.is_estate_member(estate_id));
create policy "chores_delete" on public.chores for delete using (
  public.is_estate_admin(estate_id) and not public.is_demo_user()
);

create policy "goodwill_log_select" on public.goodwill_log for select using (public.is_estate_member(estate_id));

-- ── Funksjoner appen kaller (RPC) ───────────────────────────────────────────────

-- Admin fjerner et medlem. Eieren kan ikke fjernes, og medlemmets åpne interesser og
-- nei takk fjernes, så de ikke lenger teller med i fordelingen.
create or replace function public.remove_estate_member(p_estate_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_estate_admin(p_estate_id) or public.is_demo_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if exists (select 1 from estates where id = p_estate_id and owner_id = p_user_id) then
    raise exception 'cannot_remove_owner';
  end if;
  delete from interests where user_id = p_user_id
    and item_id in (select id from items where estate_id = p_estate_id and status <> 'assigned');
  delete from item_passes where user_id = p_user_id
    and item_id in (select id from items where estate_id = p_estate_id);
  delete from estate_members where estate_id = p_estate_id and user_id = p_user_id;
end;
$$;

-- Fullfører en goodwill-oppgave én gang og gir poeng etter størrelsen på oppgaven.
create or replace function public.complete_chore(p_chore_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c chores%rowtype;
begin
  select * into c from chores where id = p_chore_id for update;
  if not found or not public.is_estate_member(c.estate_id) or public.is_demo_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if c.completed then
    return;
  end if;
  if c.assigned_to is not null and c.assigned_to <> auth.uid() then
    raise exception 'not_assigned';
  end if;
  update chores set completed = true, completed_by = auth.uid(), completed_at = now() where id = c.id;
  insert into goodwill_log (estate_id, user_id, event_type, points, description, reference_id)
  values (
    c.estate_id, auth.uid(), 'chore_' || c.size,
    case c.size when 'small' then 15 when 'large' then 70 when 'dump' then 40 else 35 end,
    'Fullførte: ' || c.title, c.id
  );
end;
$$;

revoke all on function public.remove_estate_member(uuid, uuid), public.complete_chore(uuid) from public, anon;
grant execute on function public.remove_estate_member(uuid, uuid), public.complete_chore(uuid) to authenticated;

-- ── Lagring (Storage) ───────────────────────────────────────────────────────────

-- Dokumenter (testament, ID, dødsattest) skal aldri ligge åpent på nett.
update storage.buckets set public = false where id = 'estate-docs';

-- Fjerner policies for disse bøttene, og policies som ikke er knyttet til noen bøtte (de gjelder
-- også disse, og policies slås sammen med OR).
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and ((coalesce(qual, '') || coalesce(with_check, '')) ~ '(estate-docs|item-images)'
        or (coalesce(qual, '') || coalesce(with_check, '')) !~ 'bucket_id')
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

-- estate-docs: documents/<bo-id>/<fil>
create policy "estate_docs_select" on storage.objects for select to authenticated using (
  bucket_id = 'estate-docs' and public.is_estate_member(public.try_uuid((storage.foldername(name))[2]))
);
create policy "estate_docs_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'estate-docs' and (storage.foldername(name))[1] = 'documents'
  and public.is_estate_member(public.try_uuid((storage.foldername(name))[2]))
  and not public.is_demo_user()
);
create policy "estate_docs_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'estate-docs' and not public.is_demo_user() and (
    public.is_estate_admin(public.try_uuid((storage.foldername(objects.name))[2]))
    or exists (
      select 1 from public.documents d
      where d.file_path = objects.name and d.uploaded_by = auth.uid()
    )
  )
);

-- item-images er fortsatt offentlig (bildene vises med vanlige lenker), men kan ikke listes ut.
-- Nye filer: <bo-id>/<fil>. Eldre filer under items/ og logos/ beholdes som de er.
create policy "item_images_select" on storage.objects for select to authenticated using (
  bucket_id = 'item-images' and public.is_estate_member(public.try_uuid((storage.foldername(name))[1]))
);
create policy "item_images_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'item-images' and public.is_estate_member(public.try_uuid((storage.foldername(name))[1]))
  and not public.is_demo_user()
);
create policy "item_images_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'item-images' and public.is_estate_member(public.try_uuid((storage.foldername(name))[1]))
  and not public.is_demo_user()
);

commit;

notify pgrst, 'reload schema';
