-- Private bucket for the original scans.
--
-- Object keys follow <family_id>/<recipe_id>/<uuid>.<ext>. The first path
-- segment is therefore the family id, and the policies below read it to decide
-- access. Clients get the bytes through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-scans',
  'recipe-scans',
  false,
  20971520,  -- 20 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "scans readable by family" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recipe-scans'
    and public.is_family_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy "scans insert by family" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-scans'
    and public.is_family_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy "scans update by family" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recipe-scans'
    and public.is_family_member(public.safe_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'recipe-scans'
    and public.is_family_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy "scans delete by family" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-scans'
    and public.is_family_member(public.safe_uuid((storage.foldername(name))[1]))
  );
