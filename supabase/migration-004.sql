-- Migration 004: student photos for the report card.
-- Fresh install? Skip this file — it is already at the end of schema.sql.
-- Already ran schema.sql before? Run just this file once.

alter table public.students
  add column if not exists photo_path text,
  add column if not exists photo_updated_at timestamptz;

-- Private bucket: nobody can open a photo without being signed in and allowed by the rules below.
insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', false)
on conflict (id) do nothing;

-- Each person's photos live in a folder named after their own user id: <uid>/<timestamp>.jpg
-- A student can add/replace/delete only inside their own folder; members and admins can handle any folder.
create policy student_photos_select on storage.objects for select using (
  bucket_id = 'student-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_manager()));
create policy student_photos_insert on storage.objects for insert with check (
  bucket_id = 'student-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_manager()));
create policy student_photos_update on storage.objects for update
  using (bucket_id = 'student-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_manager()))
  with check (bucket_id = 'student-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_manager()));
create policy student_photos_delete on storage.objects for delete using (
  bucket_id = 'student-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_manager()));

-- A student may change ONLY their own photo_path (students can't edit the rest of their row).
create or replace function public.set_my_photo(p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_path is null or p_path not like auth.uid()::text || '/%' then
    raise exception 'Invalid photo path';
  end if;
  update students set photo_path = p_path, photo_updated_at = now() where id = auth.uid();
end $$;
revoke execute on function public.set_my_photo(text) from public, anon;
grant execute on function public.set_my_photo(text) to authenticated;
