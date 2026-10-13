-- Migration 013: send announcements on Telegram (teachers can connect Telegram too).
-- Fresh install? Skip this file — it is already at the end of schema.sql.
alter table public.announcements add column if not exists telegram_sent_at timestamptz;

-- teachers may now connect Telegram as well (so "for teachers" announcements can reach them)
create or replace function public.create_telegram_link_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if public.my_role() not in ('student','parent','teacher') then raise exception 'Not allowed'; end if;
  delete from telegram_link_codes where expires_at < now();
  c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into telegram_link_codes (code, user_id, expires_at) values (c, auth.uid(), now() + interval '15 minutes');
  return c;
end $$;
