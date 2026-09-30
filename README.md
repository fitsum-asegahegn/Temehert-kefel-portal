# ትምህርትና ስልጠና ክፍል — School Portal (v0.1)

Vite + React + Supabase. Four roles, all enforced by Postgres RLS (`supabase/schema.sql`):

| Role | Can do |
|---|---|
| student | See only their own **approved** marks, average, rank, report card |
| teacher | Enter marks for their assigned subject + grade only; locked once approved |
| member | Students, teachers, subjects, assignments, approve marks, conduct, report cards (all / one grade / selected) |
| admin | Everything a member does + users & roles, settings, school summary report |

## Student ID
`FTS/27/####` — 27 is constant. First character of the last four = grade:
`0`=3 … `4`=ቀዳማይ(7) … `9`=ሳድሳይ(12); grade 1 = `A`, grade 2 = `B` (e.g. `FTS/27/A042`).
The last 3 digits are the student's lifelong number. On promotion the first character
changes (new ID, same password, marks history kept). Students sign in with the ID;
behind the scenes it maps to `fts-27-0142@<STUDENT_DOMAIN>` (no email is ever sent).

## Setup
1. Create a Supabase project. **Authentication → Providers → Email**: keep on, and turn
   **off "Allow new users to sign up"** (accounts are created by members/admins only).
2. **SQL Editor**: run `supabase/schema.sql`.
3. Create your first admin: Authentication → Users → *Add user* (email + password), then in SQL Editor:
   `update public.user_roles set role='admin' where user_id='<that user id>';`
   and `update public.profiles set full_name='Your name' where id='<that user id>';`
4. Deploy the Edge Function (Supabase CLI):
   `supabase functions deploy manage-users`
   Optional secret if you change the domain: `supabase secrets set STUDENT_DOMAIN=students.fts-portal.app`
   (`service_role` key is injected automatically — never put it in the app.)
5. Copy `.env.example` to `.env`, fill URL + anon key. Run `npm install && npm run dev`.
6. GitHub Pages: add repo secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   (and `VITE_STUDENT_DOMAIN` if changed), enable Pages → Source: GitHub Actions, push to `main`.

## Marks flow
teacher saves draft → **submits** → member **approves** (students can now see it) → member can **reopen** to correct.
Average = each subject as % of its max, averaged per semester; yearly = mean of the two semesters.
Rank is within grade + section, ties share a rank, pass mark configurable (default 50).

## Admin reports & Excel
- Admin → Reports: pick year + (yearly / semester 1 / semester 2) → **Word**, **PowerPoint**, **Excel**, or Print.
  Built in the browser from approved marks only. Text uses the Nyala font (Windows has it; other viewers substitute).
- Members → Students → **Import Excel**: columns `ሙሉ ስም/Name`, `ክፍል/Grade` (1–12 or ቀዳማይ…), optional
  `ክፍለ/Section`, `ጾታ/Gender`, `የወላጅ ስም`, `የወላጅ ስልክ`. Use the **Template** button. Every import creates new
  accounts (it does not update existing students), and shows the ID + password slips once.

## Report card (from የተማሪዎች_ካርድ.pdf)
One folded sheet per student: page 1 = outside (grading scale, notices, cover with student details),
page 2 = inside (subject scores out of 100, total, average + grade word, rank, signatures, photo box, seal).
- Each subject shows the student's **yearly** score (mean of the two semesters, as % of the subject's max).
  Students also see the semester breakdown on screen.
- Fixed wording lives in `src/lib/cardText.js` — edit once, every card changes.
- Student extras used on the cover (Students → **Details**): ስም ከነ አያት, የክርስትና ስም, አጥቢያ, አድራሻ, ከተማ, ቀበሌ.
  Parish falls back to Users → Settings → Parish; school address is printed from Settings.
- Print: landscape, **double-sided, flip on short edge**, scale 100%. Print ONE card first and fold it to check the alignment.
- Student photo is a blank box to paste into (no photo upload yet).

## ዕቅድ (plan) tab — members & admins
The 17-item 2019 plan from `የ2019የትምህርት_ክፍል_እቅድ.docx` is seeded on first open. Due dates come from each
item's timing text using exact Ethiopian dates: a named month = due by the end of that month, "ታህሳስ 9" = that day,
"ከመስከረም እስከ ነሐሴ" with target 12 = monthly. **ተከናውኗል ✓** logs a note and moves to the next due date.
Excel export/import (matched by title) and admin-only reset are included.

## Database
Fresh install: run `supabase/schema.sql` (already includes everything).
Already ran an older schema.sql? Run only `supabase/migration-002.sql` once, then redeploy the Edge Function.

## Not built yet
Plan completion inside the Word/PowerPoint reports, student photo upload.
