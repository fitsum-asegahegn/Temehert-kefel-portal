-- Migration 006: each course belongs to ONE semester.
-- Fresh install? Skip this file — it is already at the end of schema.sql.
-- Already ran schema.sql before? Run just this file once.
--
-- subjects.term: 1 or 2 = the semester the course is taught in. Empty (old courses) = may be used in either semester.
-- The yearly average is now the average over ALL the year's courses (each course once), and the rank follows it.

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
