-- Migration 008: teacher evaluation (anonymous), audit log, announcements.
-- Fresh install? Skip this file — it is already at the end of schema.sql.
-- Already ran schema.sql before? Run just this file once.

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
