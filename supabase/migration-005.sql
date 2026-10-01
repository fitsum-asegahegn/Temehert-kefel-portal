-- Migration 005: keep each student's FIRST (printed) password so slips can be re-printed for a whole grade.
-- Fresh install? Skip this file — it is already at the end of schema.sql.
-- Already ran schema.sql before? Run just this file once.
--
-- Only the initial password is kept, and only until the student changes it:
-- the moment a student sets their own password, their stored one is deleted automatically.

create table if not exists public.initial_passwords (
  student_id uuid primary key references public.students(id) on delete cascade,
  password text not null,
  created_at timestamptz not null default now()
);
alter table public.initial_passwords enable row level security;

-- Only members and admins can read it. Nobody can write from the app; the Edge Function (service role) does.
create policy initial_passwords_select on public.initial_passwords for select using (public.is_manager());

create or replace function public.clear_initial_password() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.must_change_password = false and old.must_change_password = true then
    delete from initial_passwords where student_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists clear_initial_password_trg on public.profiles;
create trigger clear_initial_password_trg after update of must_change_password on public.profiles
  for each row execute function public.clear_initial_password();
