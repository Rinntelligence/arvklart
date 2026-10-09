-- Rull tilbake 20261012_items_ai_analysis.sql: guard_item_update() som i 20261008_guard_item_value_disposal.sql.
-- Kolonnen ai_analysis og dataene beholdes (appen virker uten at den brukes). Fjernes for seg med
-- «alter table public.items drop column ai_analysis» hvis det er ønsket.
begin;
alter table public.items drop constraint if exists items_ai_analysis_chk;
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
      or new.estimate_confidence is distinct from old.estimate_confidence)
     and not public.is_estate_admin(old.estate_id)
     and old.added_by is distinct from auth.uid() then
    raise exception 'Bare administrator eller den som la inn gjenstanden kan endre verdien' using errcode = '42501';
  end if;
  if new.marked_for_disposal is distinct from old.marked_for_disposal
     and not public.is_estate_admin(old.estate_id) then
    raise exception 'Bare administratorer kan merke gjenstander for kast' using errcode = '42501';
  end if;
  if public.is_demo_user()
     and (to_jsonb(new) - '{assigned_to,status,marked_for_disposal}'::text[])
         is distinct from (to_jsonb(old) - '{assigned_to,status,marked_for_disposal}'::text[]) then
    raise exception 'Demokontoen kan ikke endre gjenstander' using errcode = '42501';
  end if;
  return new;
end;
$$;
commit;
