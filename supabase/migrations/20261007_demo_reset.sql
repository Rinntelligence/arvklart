-- Nullstiller demo-boet «Fam. Hansen sitt bo» til utgangspunktet fra seed/demo_estate.sql.
-- Kalles av edge-funksjonen demo-login hver gang noen åpner demoen, så hver besøkende starter likt.
--
-- Utgangspunktet: Kari, Lars og eieren har tatt stilling til alle gjenstander (interesse eller
-- nei takk). Mona – den besøkende – har noen interesser og må selv ta stilling til resten.
-- Når det er gjort, åpnes Løsningsmetoder.

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
end;
$$;

revoke all on function public.reset_demo_estate() from public, anon, authenticated;
grant execute on function public.reset_demo_estate() to service_role;

notify pgrst, 'reload schema';
