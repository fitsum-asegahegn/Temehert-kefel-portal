-- Migration 014: PERMANENT student IDs  FTS/<4 digits>/<YY>  (YY = year the student joined ቀዳማይ).
-- Fresh install? Skip this file — it is already at the end of schema.sql.
--
-- cohort = the Ethiopian year the student joined ቀዳማይ (grade 7), e.g. 2019.
-- serial = 1, 2, 3 ... inside that cohort, so the ID reads FTS/0142/19.
-- Students in grades 1-6 keep their temporary IDs (they still use `seq`) until they are promoted into ቀዳማይ.
alter table public.students alter column seq drop not null;   -- permanent IDs do not use the old counter
alter table public.students add column if not exists cohort int check (cohort between 1990 and 2100);
alter table public.students add column if not exists serial int check (serial between 1 and 9999);
create unique index if not exists students_cohort_serial_uidx on public.students (cohort, serial) where cohort is not null;
