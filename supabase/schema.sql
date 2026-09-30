-- Temehert Kefel Portal — run once in Supabase SQL Editor.
-- Roles: pending (no access), student, teacher, member, admin.
-- Every rule below is enforced by Postgres RLS, not by hidden buttons.

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'pending'
    check (role in ('pending','student','teacher','member','admin'))
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  must_change_password boolean not null default false
);

-- Every new auth user starts as 'pending' with no access until a manager/admin sets the role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into user_roles(user_id) values (new.id) on conflict do nothing;
  insert into profiles(id, full_name, email)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''),'@',1)),
          new.email)
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helpers
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from user_roles where user_id = auth.uid() $$;
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() in ('member','admin'), false) $$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'admin', false) $$;

create table public.settings (key text primary key, value text not null);
insert into public.settings values
  ('pass_mark','50'),
  ('current_year','2019'),
  ('school_name','ፍኖተ ጥበብ ሰንበት ትምህርት ቤት')
on conflict do nothing;

create table public.students (
  id uuid primary key references auth.users(id) on delete cascade,
  seq int not null unique check (seq between 1 and 999),   -- lifelong 3-digit number
  code text not null unique,                                -- e.g. FTS/27/0142
  full_name text not null,
  gender text check (gender in ('M','F')),
  grade int not null check (grade between 1 and 12),
  section text not null default 'A',
  guardian_name text,
  guardian_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.subjects (
  id bigint generated always as identity primary key,
  name_am text not null,
  name_en text,
  max_score numeric not null default 100 check (max_score > 0),
  sort int not null default 0
);

create table public.teacher_assignments (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  grade int not null check (grade between 1 and 12),
  unique (teacher_id, subject_id, grade)
);

create table public.marks (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  year int not null,
  term int not null check (term in (1,2)),
  grade int not null,       -- student's grade when the mark was entered (set by trigger)
  section text not null,    -- likewise
  score numeric not null check (score >= 0),
  status text not null default 'draft' check (status in ('draft','submitted','approved')),
  entered_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (student_id, subject_id, year, term)
);

create or replace function public.marks_before() returns trigger
language plpgsql as $$
declare mx numeric; s record;
begin
  if tg_op = 'INSERT' then
    select grade, section into s from students where id = new.student_id;
    new.grade := s.grade;
    new.section := s.section;
  end if;
  select max_score into mx from subjects where id = new.subject_id;
  if new.score > mx then
    raise exception 'Score % is above the maximum %', new.score, mx;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger marks_before_trg before insert or update on public.marks
  for each row execute function public.marks_before();

create table public.conduct (
  student_id uuid not null references public.students(id) on delete cascade,
  year int not null,
  term int not null check (term in (1,2)),
  value text not null check (value in ('A','B','C','D')),
  primary key (student_id, year, term)
);

-- Does the signed-in teacher teach this subject in this grade?
create or replace function public.teaches(p_subject bigint, p_grade int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teacher_assignments
                 where teacher_id = auth.uid() and subject_id = p_subject and grade = p_grade)
$$;
create or replace function public.teaches_grade(p_grade int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teacher_assignments
                 where teacher_id = auth.uid() and grade = p_grade)
$$;

-- ===== RLS =====
alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.marks enable row level security;
alter table public.conduct enable row level security;

create policy roles_select on public.user_roles for select
  using (user_id = auth.uid() or public.is_manager());
create policy roles_update on public.user_roles for update
  using (public.is_admin()) with check (public.is_admin());

create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_manager());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy settings_select on public.settings for select using (auth.uid() is not null);
create policy settings_write on public.settings for all
  using (public.is_manager()) with check (public.is_manager());

create policy students_select on public.students for select using (
  id = auth.uid()
  or public.is_manager()
  or (public.my_role() = 'teacher' and public.teaches_grade(grade))
);
create policy students_update on public.students for update
  using (public.is_manager()) with check (public.is_manager());
create policy students_delete on public.students for delete using (public.is_admin());

create policy subjects_select on public.subjects for select using (auth.uid() is not null);
create policy subjects_write on public.subjects for all
  using (public.is_manager()) with check (public.is_manager());

create policy assign_select on public.teacher_assignments for select
  using (public.is_manager() or teacher_id = auth.uid());
create policy assign_write on public.teacher_assignments for all
  using (public.is_manager()) with check (public.is_manager());

-- Students see only their own APPROVED marks. Teachers touch only their subject+grade,
-- and only while a mark is not yet approved. Members/admins can do everything.
create policy marks_select on public.marks for select using (
  public.is_manager()
  or (public.my_role() = 'student' and student_id = auth.uid() and status = 'approved')
  or (public.my_role() = 'teacher' and public.teaches(subject_id, grade))
);
create policy marks_insert on public.marks for insert with check (
  public.is_manager()
  or (public.my_role() = 'teacher' and status in ('draft','submitted') and public.teaches(subject_id, grade))
);
create policy marks_update on public.marks for update
  using (
    public.is_manager()
    or (public.my_role() = 'teacher' and status in ('draft','submitted') and public.teaches(subject_id, grade))
  )
  with check (
    public.is_manager()
    or (public.my_role() = 'teacher' and status in ('draft','submitted') and public.teaches(subject_id, grade))
  );
create policy marks_delete on public.marks for delete using (public.is_admin());

create policy conduct_select on public.conduct for select
  using (public.is_manager() or student_id = auth.uid());
create policy conduct_write on public.conduct for all
  using (public.is_manager()) with check (public.is_manager());

-- ===== Averages and ranks (approved marks only; ties share a rank) =====
-- Each subject is converted to a percentage of its max score. Term average = mean of
-- those percentages. Yearly average (p_term null) = mean of the term averages.
create or replace function public._ranking(p_grade int, p_year int, p_term int, p_section text)
returns table(student_id uuid, average numeric, rank int, class_size int)
language sql stable security definer set search_path = public as $$
  with per_term as (
    select m.student_id, m.term, avg(m.score / s.max_score * 100) as term_avg
    from marks m join subjects s on s.id = m.subject_id
    where m.status = 'approved' and m.grade = p_grade and m.year = p_year
      and (p_term is null or m.term = p_term)
      and (p_section is null or m.section = p_section)
    group by m.student_id, m.term
  ), per_student as (
    select student_id, round(avg(term_avg), 2) as average from per_term group by student_id
  )
  select student_id, average,
         (rank() over (order by average desc))::int,
         (count(*) over ())::int
  from per_student
$$;
revoke execute on function public._ranking(int,int,int,text) from public, anon, authenticated;

-- Members/admins: ranking for a grade (optionally one section).
create or replace function public.grade_ranking(p_grade int, p_year int, p_term int default null, p_section text default null)
returns table(student_id uuid, average numeric, rank int, class_size int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Not allowed'; end if;
  return query select * from public._ranking(p_grade, p_year, p_term, p_section);
end $$;

-- Students: only their own average and rank (never classmates' numbers).
create or replace function public.my_rank(p_year int, p_term int default null)
returns table(average numeric, rank int, class_size int, grade int)
language plpgsql security definer set search_path = public as $$
declare g int; sec text;
begin
  select m.grade, m.section into g, sec from marks m
   where m.student_id = auth.uid() and m.year = p_year and m.status = 'approved' limit 1;
  if g is null then return; end if;
  return query
    select r.average, r.rank, r.class_size, g
    from public._ranking(g, p_year, p_term, sec) r
    where r.student_id = auth.uid();
end $$;

-- To make the first admin: sign up/create a user in Supabase, then run
--   update public.user_roles set role = 'admin' where user_id = '<that user id>';
