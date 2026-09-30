-- Migration 003: flexible assessment components per course (assignment, mid, final, ...).
-- Fresh install? Skip this file — it is already at the end of schema.sql.
-- Already ran schema.sql before? Run just this file once.

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
