-- Gjenstandsbilder (item-images) gjøres private (S3). Appen viser dem med tidsbegrensede, signerte URL-er
-- (S1), og eldre filer er flyttet inn i boets mappe (S2). Etter dette svarer gamle offentlige lenker
-- (/storage/v1/object/public/item-images/…) med feil, og bare medlemmer av boet kan lese bildene.
--
-- Samtidig strammes sletteretten inn: før kunne alle medlemmer slette alle bilder i boets mappe.
-- Nå: administrator i boet, eller den som lastet opp filen (owner). Demokontoer kan fortsatt ikke slette.
-- Lese- og opplastingsreglene er uendret (medlem av boet; opplasting under <bo-id>/).
-- Kjøres etter at S1 er i produksjon og S2 er kjørt. Kan kjøres flere ganger.

update storage.buckets set public = false where id = 'item-images';

drop policy if exists "item_images_delete" on storage.objects;
create policy "item_images_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'item-images' and not public.is_demo_user() and (
    public.is_estate_admin(public.try_uuid((storage.foldername(objects.name))[1]))
    or (objects.owner = auth.uid() and public.is_estate_member(public.try_uuid((storage.foldername(objects.name))[1])))
  )
);
