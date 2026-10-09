-- Fordelingskritiske felt på gjenstander kan ikke endres av hvem som helst i boet via API-et.
-- Før: alle medlemmer kunne endre alle felt unntatt tildeling (items_update krever bare medlemskap).
--   • Verdien (estimated_value, estimate_reasoning, estimate_confidence) brukes i «jevn verdifordeling».
--     Nå: bare administrator eller den som la inn gjenstanden.
--   • Kastmerking (marked_for_disposal) gjelder hele boet. Nå: bare administrator (også for demokontoer).
--   • Sletting: den som la inn gjenstanden kan bare slette den så lenge den ikke er tildelt; administrator alltid.
-- Uendrede felt i en oppdatering (f.eks. «Rediger» som sender samme verdi) er tillatt.
-- Erstatter guard_item_update() fra 20261007_security_hardening.sql; triggeren er den samme.

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

drop policy if exists "items_delete" on public.items;
create policy "items_delete" on public.items for delete using (
  not public.is_demo_user() and (
    public.is_estate_admin(estate_id)
    or (added_by = auth.uid() and assigned_to is null and coalesce(status, 'active') = 'active')
  )
);
