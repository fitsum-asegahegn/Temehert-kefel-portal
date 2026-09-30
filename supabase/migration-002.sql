-- Migration 002: report-card fields + the ዕቅድ (plan) tables.
-- Fresh install? Skip this file — the same statements are already at the end of schema.sql.
-- Already ran schema.sql earlier? Run just this file once.

alter table public.students
  add column if not exists christian_name text,
  add column if not exists parish text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists kebele text;

insert into public.settings values
  ('parish', 'ደብረ ፀሐይ መድኃኔዓለምና ቅድስት አርሴማ ቤ/ክ'),
  ('school_address', '')
on conflict do nothing;

create table if not exists public.plan_items (
  id bigint generated always as identity primary key,
  year int not null,               -- Ethiopian plan year, e.g. 2019
  no int,
  title text not null,
  details text, description text, timing text, unit text,
  target text, budget text, executor text, weight text,
  sort int not null default 0,
  is_seed boolean not null default false
);
create table if not exists public.plan_log (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.plan_items(id) on delete cascade,
  done_on date not null default current_date,
  note text,
  by_name text,
  by uuid references auth.users(id) default auth.uid()
);
alter table public.plan_items enable row level security;
alter table public.plan_log enable row level security;

create policy plan_items_select on public.plan_items for select using (public.is_manager());
create policy plan_items_insert on public.plan_items for insert with check (public.is_manager());
create policy plan_items_update on public.plan_items for update
  using (public.is_manager()) with check (public.is_manager());
create policy plan_items_delete on public.plan_items for delete using (public.is_admin());

create policy plan_log_select on public.plan_log for select using (public.is_manager());
create policy plan_log_insert on public.plan_log for insert with check (public.is_manager());
create policy plan_log_delete on public.plan_log for delete using (public.is_manager());
