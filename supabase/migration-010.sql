-- Migration 010: results by TELEGRAM for students and parents.
-- Fresh install? Skip this file — it is already at the end of schema.sql.
-- Already ran schema.sql before? Run just this file once.
--
-- A student/parent links their Telegram to their account by tapping a one-time link in the app (signed in).
-- After a member releases results, a member can press "Send on Telegram" and the bot messages every linked student/parent.

create table if not exists public.telegram_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id bigint not null,
  linked_at timestamptz not null default now(),
  primary key (user_id, chat_id)
);
create table if not exists public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;  -- no policies: only the function below / the bot webhook

-- a person sees (and can disconnect) only their own connections; members/admins can count them
create policy telegram_links_select on public.telegram_links for select using (user_id = auth.uid() or public.is_manager());
create policy telegram_links_delete on public.telegram_links for delete using (user_id = auth.uid());

-- one-time code (valid 15 minutes) that the bot exchanges for a link; students and parents only
create or replace function public.create_telegram_link_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if public.my_role() not in ('student','parent') then raise exception 'Not allowed'; end if;
  delete from telegram_link_codes where expires_at < now();
  c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into telegram_link_codes (code, user_id, expires_at) values (c, auth.uid(), now() + interval '15 minutes');
  return c;
end $$;

-- when results were sent on Telegram (so nobody sends them twice by accident)
alter table public.published_results add column if not exists telegram_sent_at timestamptz;
