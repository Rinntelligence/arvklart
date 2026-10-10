-- Rull tilbake 20261019_item_disposition.sql: disponering kan ikke lenger settes (forrige frontend).
-- Kolonnen items.disposition og referansene i assign_items/guard-funksjonene beholdes, så ingenting feiler;
-- den står bare ubrukt (null). Deploy forrige frontend først.
begin;
drop function if exists public.set_dispositions(uuid, jsonb);
update public.items set disposition = null where disposition is not null;
notify pgrst, 'reload schema';
commit;
