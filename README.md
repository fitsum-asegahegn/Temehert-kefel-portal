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

## Not built yet
Real report-card template (current one is a placeholder), Ethiopian-calendar ዕቅድ tab
(needs this department's plan document and `ethiopian-calendar.js`).
