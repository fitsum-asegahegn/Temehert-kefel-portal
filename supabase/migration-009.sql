-- Migration 009: PARENT access (read-only).
-- Fresh install? Skip this file — it is already at the end of schema.sql.
-- Already ran schema.sql before? Run just this file once.
--
-- A parent signs in with their phone number and sees ONLY their own child/children (the students linked to them):
-- the profile, the photo and the released results. Parents can change nothing and see no other student.

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
