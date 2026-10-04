-- Migration 007: results are RELEASED to students by a member (per year + semester + grade).
-- Fresh install? Skip this file — it is already at the end of schema.sql.
-- Already ran schema.sql before? Run just this file once.
--
-- Before: a student saw a mark as soon as it was approved.
-- Now:    a student sees it only after a member/admin presses "Publish results" for that grade and semester.
-- Everything that is approved TODAY is published by this script, so nothing disappears for students on day one.

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
