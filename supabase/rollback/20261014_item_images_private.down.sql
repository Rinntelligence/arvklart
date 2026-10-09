-- Rull tilbake 20261014_item_images_private.sql: bøtten blir offentlig igjen (gamle lenker virker),
-- og alle medlemmer kan slette bilder i boets mappe, som i 20261007_security_hardening.sql.
begin;
update storage.buckets set public = true where id = 'item-images';
drop policy if exists "item_images_delete" on storage.objects;
create policy "item_images_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'item-images' and public.is_estate_member(public.try_uuid((storage.foldername(name))[1]))
  and not public.is_demo_user()
);
commit;
