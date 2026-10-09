-- AI-vurderingen av en gjenstand lagres samlet i items.ai_analysis (jsonb, versjonert):
--   { v, meta: {model, prompt_version, analyzed_at, image_count, lang}, ai: {…AI-forslaget…},
--     review: {title|description|category|condition: accepted|edited|not_suggested}, corrections: {}, valuation: null }
-- AI-forslaget (ai) endres aldri etter lagring; det brukeren har bekreftet står i de vanlige kolonnene
-- (title, description, category_id, condition). Eldre gjenstander har null og skrives ikke om.
--
-- AI-vurderingen er grunnlag for verdianslag og behandles som verdien: bare administrator eller den
-- som la inn gjenstanden kan endre den (guard_item_update). Størrelsen begrenses.
-- Kan kjøres flere ganger. Erstatter guard_item_update() fra 20261008_guard_item_value_disposal.sql.

alter table public.items add column if not exists ai_analysis jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'items_ai_analysis_chk' and conrelid = 'public.items'::regclass) then
    alter table public.items add constraint items_ai_analysis_chk
      check (ai_analysis is null or (jsonb_typeof(ai_analysis) = 'object' and octet_length(ai_analysis::text) <= 20000));
  end if;
end $$;

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
     and (to_jsonb(new) - '{assigned_to,status,marked_for_disposal}'::text[])
         is distinct from (to_jsonb(old) - '{assigned_to,status,marked_for_disposal}'::text[]) then
    raise exception 'Demokontoen kan ikke endre gjenstander' using errcode = '42501';
  end if;
  return new;
end;
$$;
