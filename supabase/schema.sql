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

-- ===== Report-card fields + plan (same as migration-002.sql) =====
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

-- ===== Assessment components (same as migration-003.sql) =====
create table if not exists public.assessments (
  id bigint generated always as identity primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  grade int not null check (grade between 1 and 12),
  year int not null,
  term int not null check (term in (1,2)),
  name text not null,
  max_points numeric not null check (max_points > 0),
  sort int not null default 0
);
create index if not exists assessments_lookup on public.assessments(subject_id, grade, year, term);

create table if not exists public.assessment_scores (
  assessment_id bigint not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric not null check (score >= 0),
  primary key (assessment_id, student_id)
);

create or replace function public.assessment_score_check() returns trigger
language plpgsql as $$
declare mx numeric;
begin
  select max_points into mx from assessments where id = new.assessment_id;
  if new.score > mx then raise exception 'Score % is above the maximum %', new.score, mx; end if;
  return new;
end $$;
drop trigger if exists assessment_score_check_trg on public.assessment_scores;
create trigger assessment_score_check_trg before insert or update on public.assessment_scores
  for each row execute function public.assessment_score_check();

-- Once any mark of this course/term is approved, its component list is frozen.
create or replace function public.term_locked(p_subject bigint, p_grade int, p_year int, p_term int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from marks where subject_id = p_subject and grade = p_grade
                 and year = p_year and term = p_term and status = 'approved')
$$;
-- A student may see a component list only after THEIR mark for it is approved.
create or replace function public.student_sees_assessment(p_subject bigint, p_grade int, p_year int, p_term int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from marks where student_id = auth.uid() and subject_id = p_subject and grade = p_grade
                 and year = p_year and term = p_term and status = 'approved')
$$;
create or replace function public.a_teaches(p_assessment bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assessments a where a.id = p_assessment and public.teaches(a.subject_id, a.grade))
$$;
create or replace function public.a_visible_to_student(p_assessment bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assessments a where a.id = p_assessment
                 and public.student_sees_assessment(a.subject_id, a.grade, a.year, a.term))
$$;
-- Teachers write component scores only for their course, and only while that student's mark is not approved.
create or replace function public.can_write_score(p_assessment bigint, p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_manager(), false) or (
    public.my_role() = 'teacher' and exists (
      select 1 from assessments a
      where a.id = p_assessment and public.teaches(a.subject_id, a.grade)
        and not exists (select 1 from marks m where m.student_id = p_student and m.subject_id = a.subject_id
                        and m.year = a.year and m.term = a.term and m.status = 'approved')))
$$;

alter table public.assessments enable row level security;
alter table public.assessment_scores enable row level security;

create policy assessments_select on public.assessments for select using (
  public.is_manager()
  or (public.my_role() = 'teacher' and public.teaches(subject_id, grade))
  or (public.my_role() = 'student' and public.student_sees_assessment(subject_id, grade, year, term)));
create policy assessments_insert on public.assessments for insert with check (
  public.is_manager()
  or (public.my_role() = 'teacher' and public.teaches(subject_id, grade) and not public.term_locked(subject_id, grade, year, term)));
create policy assessments_update on public.assessments for update
  using (public.is_manager() or (public.my_role() = 'teacher' and public.teaches(subject_id, grade) and not public.term_locked(subject_id, grade, year, term)))
  with check (public.is_manager() or (public.my_role() = 'teacher' and public.teaches(subject_id, grade) and not public.term_locked(subject_id, grade, year, term)));
create policy assessments_delete on public.assessments for delete
  using (public.is_manager() or (public.my_role() = 'teacher' and public.teaches(subject_id, grade) and not public.term_locked(subject_id, grade, year, term)));

create policy ascores_select on public.assessment_scores for select using (
  public.is_manager()
  or (public.my_role() = 'teacher' and public.a_teaches(assessment_id))
  or (public.my_role() = 'student' and student_id = auth.uid() and public.a_visible_to_student(assessment_id)));
create policy ascores_insert on public.assessment_scores for insert with check (public.can_write_score(assessment_id, student_id));
create policy ascores_update on public.assessment_scores for update
  using (public.can_write_score(assessment_id, student_id)) with check (public.can_write_score(assessment_id, student_id));
create policy ascores_delete on public.assessment_scores for delete using (public.can_write_score(assessment_id, student_id));

-- ===== Student photos (same as migration-004.sql) =====
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

-- ===== Stored first passwords for slip reprints (same as migration-005.sql) =====
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

-- ===== One semester per course (same as migration-006.sql) =====
alter table public.subjects add column if not exists term int check (term in (1,2));

-- A mark can only be entered in the semester its course belongs to.
create or replace function public.marks_before() returns trigger
language plpgsql as $$
declare mx numeric; st int; s record;
begin
  if tg_op = 'INSERT' then
    select grade, section into s from students where id = new.student_id;
    new.grade := s.grade;
    new.section := s.section;
  end if;
  select max_score, term into mx, st from subjects where id = new.subject_id;
  if st is not null and new.term <> st then
    raise exception 'This course is taught in semester %', st;
  end if;
  if new.score > mx then
    raise exception 'Score % is above the maximum %', new.score, mx;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Average = mean of each course's percentage (a course taught in both semesters counts once, as the mean of its two).
create or replace function public._ranking(p_grade int, p_year int, p_term int, p_section text)
returns table(student_id uuid, average numeric, rank int, class_size int)
language sql stable security definer set search_path = public as $$
  with per_subject as (
    select m.student_id, m.subject_id, avg(m.score / s.max_score * 100) as pct
    from marks m join subjects s on s.id = m.subject_id
    where m.status = 'approved' and m.grade = p_grade and m.year = p_year
      and (p_term is null or m.term = p_term)
      and (p_section is null or m.section = p_section)
    group by m.student_id, m.subject_id
  ), per_student as (
    select student_id, round(avg(pct), 2) as average from per_subject group by student_id
  )
  select student_id, average,
         (rank() over (order by average desc))::int,
         (count(*) over ())::int
  from per_student
$$;
revoke execute on function public._ranking(int,int,int,text) from public, anon, authenticated;

-- ===== Publish results to students (same as migration-007.sql) =====
create table if not exists public.published_results (
  year int not null,
  term int not null check (term in (1,2)),
  grade int not null check (grade between 1 and 12),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null default auth.uid(),
  primary key (year, term, grade)
);
alter table public.published_results enable row level security;
create policy published_select on public.published_results for select using (auth.uid() is not null);
create policy published_write on public.published_results for all
  using (public.is_manager()) with check (public.is_manager());

create or replace function public.is_published(p_year int, p_term int, p_grade int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from published_results where year = p_year and term = p_term and grade = p_grade)
$$;

insert into public.published_results (year, term, grade, published_by)
select distinct year, term, grade, null::uuid from public.marks where status = 'approved'
on conflict do nothing;

-- students see only APPROVED + PUBLISHED marks
drop policy if exists marks_select on public.marks;
create policy marks_select on public.marks for select using (
  public.is_manager()
  or (public.my_role() = 'student' and student_id = auth.uid() and status = 'approved'
      and public.is_published(year, term, grade))
  or (public.my_role() = 'teacher' and public.teaches(subject_id, grade))
);

create or replace function public.student_sees_assessment(p_subject bigint, p_grade int, p_year int, p_term int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_published(p_year, p_term, p_grade) and exists (
    select 1 from marks where student_id = auth.uid() and subject_id = p_subject and grade = p_grade
      and year = p_year and term = p_term and status = 'approved')
$$;

-- ranking: students only count published semesters; managers see everything approved
create or replace function public._ranking(p_grade int, p_year int, p_term int, p_section text, p_only_published boolean)
returns table(student_id uuid, average numeric, rank int, class_size int)
language sql stable security definer set search_path = public as $$
  with per_subject as (
    select m.student_id, m.subject_id, avg(m.score / s.max_score * 100) as pct
    from marks m join subjects s on s.id = m.subject_id
    where m.status = 'approved' and m.grade = p_grade and m.year = p_year
      and (p_term is null or m.term = p_term)
      and (p_section is null or m.section = p_section)
      and (not p_only_published or exists (
            select 1 from published_results pr where pr.year = m.year and pr.term = m.term and pr.grade = m.grade))
    group by m.student_id, m.subject_id
  ), per_student as (
    select student_id, round(avg(pct), 2) as average from per_subject group by student_id
  )
  select student_id, average,
         (rank() over (order by average desc))::int,
         (count(*) over ())::int
  from per_student
$$;
revoke execute on function public._ranking(int,int,int,text,boolean) from public, anon, authenticated;

create or replace function public.grade_ranking(p_grade int, p_year int, p_term int default null, p_section text default null)
returns table(student_id uuid, average numeric, rank int, class_size int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Not allowed'; end if;
  return query select * from public._ranking(p_grade, p_year, p_term, p_section, false);
end $$;

create or replace function public.my_rank(p_year int, p_term int default null)
returns table(average numeric, rank int, class_size int, grade int)
language plpgsql security definer set search_path = public as $$
declare g int; sec text;
begin
  select m.grade, m.section into g, sec from marks m
   where m.student_id = auth.uid() and m.year = p_year and m.status = 'approved'
     and public.is_published(m.year, m.term, m.grade) limit 1;
  if g is null then return; end if;
  return query
    select r.average, r.rank, r.class_size, g
    from public._ranking(g, p_year, p_term, sec, true) r
    where r.student_id = auth.uid();
end $$;

drop function if exists public._ranking(int,int,int,text);

-- ===== Teacher evaluation, audit log, announcements (same as migration-008.sql) =====
-- ===================================================================
-- 1) ANONYMOUS TEACHER EVALUATION
-- Students rate their teachers (8 questions, 1-5, optional comment) while a member has it OPEN.
-- Answers and "who already answered" live in two separate tables, so a rating cannot be traced to a student.
-- Nobody reads these tables directly: only the functions below, and a group with fewer than 3 answers shows no averages or comments.
-- ===================================================================
create table if not exists public.teacher_evaluations (
  id bigint generated always as identity primary key,
  year int not null,
  term int not null check (term in (1,2)),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  grade int not null check (grade between 1 and 12),
  answers jsonb not null,
  comment_text text,
  created_on date not null default current_date
);
create table if not exists public.evaluation_done (
  student_id uuid not null references public.students(id) on delete cascade,
  year int not null,
  term int not null,
  teacher_id uuid not null,
  subject_id bigint not null,
  primary key (student_id, year, term, teacher_id, subject_id)
);
alter table public.teacher_evaluations enable row level security;  -- no policies on purpose
alter table public.evaluation_done enable row level security;      -- no policies on purpose

insert into public.settings values ('evaluation_open', '') on conflict do nothing;  -- e.g. '2019-1' = open for semester 1 of 2019

create or replace function public.eval_open_term() returns text
language sql stable security definer set search_path = public as
$$ select nullif(value, '') from settings where key = 'evaluation_open' $$;

-- What the signed-in student can evaluate right now (teachers of their grade, courses of the open semester).
create or replace function public.my_evaluation_list()
returns table(r_year int, r_term int, r_teacher_id uuid, r_teacher_name text, r_subject_id bigint, r_subject_am text, r_subject_en text, r_done boolean)
language plpgsql stable security definer set search_path = public as $$
declare o text; oy int; ot int; sg int;
begin
  if public.my_role() is distinct from 'student' then return; end if;
  o := public.eval_open_term();
  if o is null then return; end if;
  oy := split_part(o, '-', 1)::int;
  ot := split_part(o, '-', 2)::int;
  select st.grade into sg from students st where st.id = auth.uid() and st.active;
  if sg is null then return; end if;
  return query
    select oy, ot, ta.teacher_id, pr.full_name, su.id, su.name_am, su.name_en,
           exists (select 1 from evaluation_done d
                   where d.student_id = auth.uid() and d.year = oy and d.term = ot
                     and d.teacher_id = ta.teacher_id and d.subject_id = su.id)
    from teacher_assignments ta
    join subjects su on su.id = ta.subject_id
    join profiles pr on pr.id = ta.teacher_id
    where ta.grade = sg and (su.term is null or su.term = ot)
    order by su.sort, su.id;
end $$;

create or replace function public.submit_evaluation(p_teacher uuid, p_subject bigint, p_answers jsonb, p_comment text)
returns void
language plpgsql security definer set search_path = public as $$
declare o text; oy int; ot int; sg int; qk text; qv numeric;
begin
  if public.my_role() is distinct from 'student' then raise exception 'Only students can evaluate'; end if;
  o := public.eval_open_term();
  if o is null then raise exception 'The evaluation is closed'; end if;
  oy := split_part(o, '-', 1)::int;
  ot := split_part(o, '-', 2)::int;
  select st.grade into sg from students st where st.id = auth.uid() and st.active;
  if sg is null or not exists (
       select 1 from teacher_assignments ta join subjects su on su.id = ta.subject_id
       where ta.teacher_id = p_teacher and ta.subject_id = p_subject and ta.grade = sg
         and (su.term is null or su.term = ot)) then
    raise exception 'This teacher does not teach you this course';
  end if;
  foreach qk in array array['q1','q2','q3','q4','q5','q6','q7','q8'] loop
    qv := (p_answers ->> qk)::numeric;
    if qv is null or qv < 1 or qv > 5 or qv <> trunc(qv) then raise exception 'Please answer every question (1 to 5)'; end if;
  end loop;
  begin
    insert into evaluation_done (student_id, year, term, teacher_id, subject_id) values (auth.uid(), oy, ot, p_teacher, p_subject);
  exception when unique_violation then
    raise exception 'You already evaluated this teacher for this course';
  end;
  insert into teacher_evaluations (year, term, teacher_id, subject_id, grade, answers, comment_text)
  values (oy, ot, p_teacher, p_subject, sg,
          jsonb_build_object('q1', (p_answers->>'q1')::int, 'q2', (p_answers->>'q2')::int, 'q3', (p_answers->>'q3')::int, 'q4', (p_answers->>'q4')::int,
                             'q5', (p_answers->>'q5')::int, 'q6', (p_answers->>'q6')::int, 'q7', (p_answers->>'q7')::int, 'q8', (p_answers->>'q8')::int),
          nullif(left(trim(coalesce(p_comment, '')), 500), ''));
end $$;

-- Members/admins see every teacher; a teacher sees only their own. Averages appear only with 3+ answers.
create or replace function public.evaluation_summary(p_year int, p_term int)
returns table(r_teacher_id uuid, r_teacher_name text, r_subject_id bigint, r_subject_am text, r_grade int, r_responses int, r_overall numeric, r_per_question jsonb)
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.id, e.teacher_id, e.subject_id, e.grade, kv.key as q, kv.value::numeric as v
    from teacher_evaluations e, jsonb_each_text(e.answers) kv
    where e.year = p_year and e.term = p_term
      and (public.is_manager() or e.teacher_id = auth.uid())
  ), per_q as (
    select teacher_id, subject_id, grade, q, avg(v) as a from ev group by teacher_id, subject_id, grade, q
  ), grp as (
    select teacher_id, subject_id, grade, count(distinct id)::int as n, avg(v) as overall
    from ev group by teacher_id, subject_id, grade
  )
  select g.teacher_id, pr.full_name, g.subject_id, su.name_am, g.grade, g.n,
         case when g.n >= 3 then round(g.overall, 2) end,
         case when g.n >= 3 then (select jsonb_object_agg(pq.q, round(pq.a, 2)) from per_q pq
                                  where pq.teacher_id = g.teacher_id and pq.subject_id = g.subject_id and pq.grade = g.grade) end
  from grp g
  join subjects su on su.id = g.subject_id
  left join profiles pr on pr.id = g.teacher_id
  order by pr.full_name, su.name_am
$$;

-- Written comments: members/admins only, shuffled, and only when the group has 3+ answers.
create or replace function public.evaluation_comments(p_year int, p_term int, p_teacher uuid, p_subject bigint)
returns table(r_comment text)
language sql stable security definer set search_path = public as $$
  select e.comment_text from teacher_evaluations e
  where public.is_manager() and e.year = p_year and e.term = p_term and e.teacher_id = p_teacher and e.subject_id = p_subject
    and e.comment_text is not null
    and (select count(*) from teacher_evaluations x
         where x.year = p_year and x.term = p_term and x.teacher_id = p_teacher and x.subject_id = p_subject) >= 3
  order by random()
$$;

-- ===================================================================
-- 2) AUDIT LOG (admin reads it; nobody can change or delete entries from the app)
-- ===================================================================
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_name text,
  action text not null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at on public.audit_log (at desc);
alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select using (public.is_admin());

-- Changes made through the app are logged by the triggers below. Changes done by the Edge Function
-- (accounts, passwords, promotion, deletes) are logged by the function itself.
create or replace function public.log_audit(p_action text, p_details jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into audit_log (actor, actor_name, action, details)
  values (auth.uid(), (select full_name from profiles where id = auth.uid()), p_action, coalesce(p_details, '{}'::jsonb));
end $$;
revoke execute on function public.log_audit(text, jsonb) from public, anon, authenticated;

-- marks: one entry per STATEMENT and kind of change (e.g. "approved 25 marks"), not one per row
create or replace function public.audit_marks_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select o.status as from_status, n.status as to_status, n.subject_id, n.grade, n.year, n.term,
           count(*)::int as cnt, bool_or(o.score <> n.score) as score_changed
    from old_rows o join new_rows n on n.id = o.id
    where o.status <> n.status or (o.status <> 'draft' and o.score <> n.score)
    group by o.status, n.status, n.subject_id, n.grade, n.year, n.term
  loop
    perform public.log_audit('marks.change', jsonb_build_object(
      'from', r.from_status, 'to', r.to_status, 'subject', (select name_am from subjects where id = r.subject_id),
      'grade', r.grade, 'year', r.year, 'term', r.term, 'count', r.cnt, 'score_changed', r.score_changed));
  end loop;
  return null;
end $$;
drop trigger if exists audit_marks_update_trg on public.marks;
create trigger audit_marks_update_trg after update on public.marks
  referencing old table as old_rows new table as new_rows for each statement execute function public.audit_marks_update();

create or replace function public.audit_marks_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select o.subject_id, o.grade, o.year, o.term, count(*)::int as cnt from old_rows o group by o.subject_id, o.grade, o.year, o.term loop
    perform public.log_audit('marks.delete', jsonb_build_object(
      'subject', (select name_am from subjects where id = r.subject_id), 'grade', r.grade, 'year', r.year, 'term', r.term, 'count', r.cnt));
  end loop;
  return null;
end $$;
drop trigger if exists audit_marks_delete_trg on public.marks;
create trigger audit_marks_delete_trg after delete on public.marks
  referencing old table as old_rows for each statement execute function public.audit_marks_delete();

create or replace function public.audit_published() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('results.release', jsonb_build_object('year', new.year, 'term', new.term, 'grade', new.grade));
  else
    perform public.log_audit('results.unrelease', jsonb_build_object('year', old.year, 'term', old.term, 'grade', old.grade));
  end if;
  return null;
end $$;
drop trigger if exists audit_published_trg on public.published_results;
create trigger audit_published_trg after insert or delete on public.published_results
  for each row execute function public.audit_published();

create or replace function public.audit_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    perform public.log_audit('role.change', jsonb_build_object(
      'name', (select full_name from profiles where id = new.user_id), 'from', old.role, 'to', new.role));
  end if;
  return null;
end $$;
drop trigger if exists audit_role_trg on public.user_roles;
create trigger audit_role_trg after update on public.user_roles for each row execute function public.audit_role();

create or replace function public.audit_student() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb := '{}'::jsonb; k text;
begin
  foreach k in array array['full_name','grade','section','active','gender','christian_name','parish','address','city','kebele','guardian_name','guardian_phone'] loop
    if to_jsonb(old) -> k is distinct from to_jsonb(new) -> k then
      d := d || jsonb_build_object(k, jsonb_build_array(to_jsonb(old) -> k, to_jsonb(new) -> k));
    end if;
  end loop;
  if d <> '{}'::jsonb then
    perform public.log_audit('student.edit', jsonb_build_object('code', new.code, 'name', new.full_name, 'changes', d));
  end if;
  return null;
end $$;
drop trigger if exists audit_student_trg on public.students;
create trigger audit_student_trg after update on public.students for each row execute function public.audit_student();

create or replace function public.audit_subject() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('subject.add', jsonb_build_object('name', new.name_am, 'term', new.term, 'max', new.max_score));
  elsif tg_op = 'UPDATE' then
    if (old.name_am, old.name_en, old.max_score, old.term) is distinct from (new.name_am, new.name_en, new.max_score, new.term) then
      perform public.log_audit('subject.edit', jsonb_build_object('name', new.name_am, 'from_term', old.term, 'to_term', new.term, 'from_max', old.max_score, 'to_max', new.max_score));
    end if;
  else
    perform public.log_audit('subject.delete', jsonb_build_object('name', old.name_am));
  end if;
  return null;
end $$;
drop trigger if exists audit_subject_trg on public.subjects;
create trigger audit_subject_trg after insert or update or delete on public.subjects for each row execute function public.audit_subject();

create or replace function public.audit_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare t_id uuid; s_id bigint; g int; act text;
begin
  if tg_op = 'DELETE' then
    t_id := old.teacher_id; s_id := old.subject_id; g := old.grade; act := 'assignment.remove';
  else
    t_id := new.teacher_id; s_id := new.subject_id; g := new.grade; act := 'assignment.add';
  end if;
  perform public.log_audit(act, jsonb_build_object(
    'teacher', (select full_name from profiles where id = t_id),
    'subject', (select name_am from subjects where id = s_id), 'grade', g));
  return null;
end $$;
drop trigger if exists audit_assignment_trg on public.teacher_assignments;
create trigger audit_assignment_trg after insert or delete on public.teacher_assignments for each row execute function public.audit_assignment();

create or replace function public.audit_setting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('settings.change', jsonb_build_object('key', new.key, 'from', null, 'to', new.value));
  elsif new.value is distinct from old.value then
    perform public.log_audit('settings.change', jsonb_build_object('key', new.key, 'from', old.value, 'to', new.value));
  end if;
  return null;
end $$;
drop trigger if exists audit_setting_trg on public.settings;
create trigger audit_setting_trg after insert or update on public.settings for each row execute function public.audit_setting();

create or replace function public.audit_assessment_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_audit('assessment.delete', jsonb_build_object(
    'name', old.name, 'subject', (select name_am from subjects where id = old.subject_id), 'grade', old.grade, 'year', old.year, 'term', old.term));
  return null;
end $$;
drop trigger if exists audit_assessment_delete_trg on public.assessments;
create trigger audit_assessment_delete_trg after delete on public.assessments for each row execute function public.audit_assessment_delete();

-- ===================================================================
-- 3) ANNOUNCEMENTS
-- ===================================================================
create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null default '',
  audience text not null default 'all' check (audience in ('all','students','teachers')),
  event_date date,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  author_name text
);
alter table public.announcements enable row level security;
create policy announcements_select on public.announcements for select using (
  public.is_manager()
  or audience = 'all'
  or (audience = 'students' and public.my_role() = 'student')
  or (audience = 'teachers' and public.my_role() = 'teacher'));
create policy announcements_write on public.announcements for all
  using (public.is_manager()) with check (public.is_manager());

-- ===== Parent access (same as migration-009.sql) =====
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('pending','student','teacher','member','admin','parent'));

alter table public.announcements drop constraint if exists announcements_audience_check;
alter table public.announcements add constraint announcements_audience_check
  check (audience in ('all','students','teachers','parents'));

-- which parent belongs to which child (made only by members/admins, through the Edge Function)
create table if not exists public.parent_students (
  parent_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);
alter table public.parent_students enable row level security;
create policy parent_students_select on public.parent_students for select
  using (parent_id = auth.uid() or public.is_manager());

create or replace function public.is_parent_of(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parent_students where parent_id = auth.uid() and student_id = p_student)
$$;

-- a parent may open a course's assessment list when one of their children has an approved + released mark for it
create or replace function public.parent_sees_assessment(p_subject bigint, p_grade int, p_year int, p_term int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_published(p_year, p_term, p_grade) and exists (
    select 1 from marks m join parent_students ps on ps.student_id = m.student_id
    where ps.parent_id = auth.uid() and m.subject_id = p_subject and m.grade = p_grade
      and m.year = p_year and m.term = p_term and m.status = 'approved')
$$;
create or replace function public.a_visible_to_parent(p_assessment bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assessments a where a.id = p_assessment
                 and public.parent_sees_assessment(a.subject_id, a.grade, a.year, a.term))
$$;
create or replace function public.parent_can_see_photo(p_folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parent_students where parent_id = auth.uid() and student_id::text = p_folder)
$$;

-- students: add the parent's own children
drop policy if exists students_select on public.students;
create policy students_select on public.students for select using (
  id = auth.uid()
  or public.is_manager()
  or (public.my_role() = 'teacher' and public.teaches_grade(grade))
  or (public.my_role() = 'parent' and public.is_parent_of(id))
);

-- marks: parents see their children's APPROVED + RELEASED marks
drop policy if exists marks_select on public.marks;
create policy marks_select on public.marks for select using (
  public.is_manager()
  or (public.my_role() = 'student' and student_id = auth.uid() and status = 'approved'
      and public.is_published(year, term, grade))
  or (public.my_role() = 'parent' and public.is_parent_of(student_id) and status = 'approved'
      and public.is_published(year, term, grade))
  or (public.my_role() = 'teacher' and public.teaches(subject_id, grade))
);

drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments for select using (
  public.is_manager()
  or (public.my_role() = 'teacher' and public.teaches(subject_id, grade))
  or (public.my_role() = 'student' and public.student_sees_assessment(subject_id, grade, year, term))
  or (public.my_role() = 'parent' and public.parent_sees_assessment(subject_id, grade, year, term)));

drop policy if exists ascores_select on public.assessment_scores;
create policy ascores_select on public.assessment_scores for select using (
  public.is_manager()
  or (public.my_role() = 'teacher' and public.a_teaches(assessment_id))
  or (public.my_role() = 'student' and student_id = auth.uid() and public.a_visible_to_student(assessment_id))
  or (public.my_role() = 'parent' and public.is_parent_of(student_id) and public.a_visible_to_parent(assessment_id)));

-- photos of their own children
drop policy if exists student_photos_select on storage.objects;
create policy student_photos_select on storage.objects for select using (
  bucket_id = 'student-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_manager()
    or public.parent_can_see_photo((storage.foldername(name))[1])));

-- announcements for parents
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select using (
  public.is_manager()
  or audience = 'all'
  or (audience = 'students' and public.my_role() = 'student')
  or (audience = 'teachers' and public.my_role() = 'teacher')
  or (audience = 'parents' and public.my_role() = 'parent'));

-- average + rank of ONE child, for that child's parent (only released semesters, same maths as my_rank)
create or replace function public.child_rank(p_student uuid, p_year int, p_term int default null)
returns table(average numeric, rank int, class_size int, grade int)
language plpgsql security definer set search_path = public as $$
declare g int; sec text;
begin
  if not public.is_parent_of(p_student) then return; end if;
  select m.grade, m.section into g, sec from marks m
   where m.student_id = p_student and m.year = p_year and m.status = 'approved'
     and public.is_published(m.year, m.term, m.grade) limit 1;
  if g is null then return; end if;
  return query
    select r.average, r.rank, r.class_size, g
    from public._ranking(g, p_year, p_term, sec, true) r
    where r.student_id = p_student;
end $$;

-- ===== Telegram (same as migration-010.sql) =====
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
