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
- **Download PDF ⬇** (Report cards tab and the student's screen) — pick the fold style next to the button:
  - **Book fold (default)** — landscape A4/Letter sheet, 2 pages per student, folded at the vertical middle →
    the **closed card is PORTRAIT** (like the original template). Page 1 = outside (back cover left, front cover right),
    page 2 = inside (marks left, photo/verse/signature/seal right).
    Print **double-sided, flip on SHORT edge** (landscape), 100 %, then fold in the middle.
  - **Top fold** — portrait sheet, folded across the middle → the closed card is LANDSCAPE; the back cover is printed upside down.
  - **Inside page upside down** (checkbox): turn this on if, after a test print, the inside page comes out rotated 180°
    (some printers/apps flip the back of the sheet the other way).
  Choose A4 or Letter; for big groups do one grade at a time. The browser **Print** button exists only for the book fold.
  Print ONE card first, fold it, and check that the cover and inside line up before printing a whole grade.
- Student photo is a blank box to paste into (no photo upload yet).

## ዕቅድ (plan) tab — members & admins
The 17-item 2019 plan from `የ2019የትምህርት_ክፍል_እቅድ.docx` is seeded on first open. Due dates come from each
item's timing text using exact Ethiopian dates: a named month = due by the end of that month, "ታህሳስ 9" = that day,
"ከመስከረም እስከ ነሐሴ" with target 12 = monthly. **ተከናውኗል ✓** logs a note and moves to the next due date.
Excel export/import (matched by title) and admin-only reset are included.

## Database
Fresh install: run `supabase/schema.sql` (already includes everything).
Already ran an older schema.sql? Run only `supabase/migration-002.sql` once, then redeploy the Edge Function.

## Flexible marks (assignment / mid / final / anything)
Teacher → pick course + semester → **Assessments**: add or remove rows (name + points). The rows must add up to the
subject's maximum (100). Then enter each student's score per row; the total is calculated live and saved as that
student's mark. Submit → member approves (as before). After approval the rows and scores are locked.
Student → taps a course name in the results table → popup with each assessment, the result, and the total (e.g. 69 / 100).
Students see the breakdown only after their mark is approved (enforced by RLS).
Database: fresh install = `schema.sql`; otherwise run `supabase/migration-003.sql` once.

## Student photo (printed on the report card)
- After the first password change, a student **must upload a photo** before seeing anything else. The screen says the photo
  is printed on the report card. The photo is centre-cropped and shrunk on the phone (about 30 KB) before upload.
- The student can **change the photo any time** from the "Change photo" button at the top of their results screen.
- Members/admins can also add or replace a student's photo: Students → **Details** (useful if a student has no phone).
- The photo appears in the photo box on the card, in the PDF download and in the browser print. If a student has no photo yet,
  the box stays empty for pasting.
- Photos are stored in a **private** Supabase Storage bucket (`student-photos`): a student can only reach their own folder;
  members/admins can reach all. Fresh install = `schema.sql`; otherwise run `supabase/migration-004.sql` once.
- Students who already have accounts are asked for a photo the next time they sign in.

## Student passwords (minimum 4 characters)
- A student's first password (on the printed slip) is a random **4-digit** number. At first login they choose their own:
  **at least 4 characters, any letters (Latin or Amharic), numbers or symbols**, and they can make it longer (up to 60).
  Not allowed: all the same character (0000, aaaa) or 1234. Staff (teachers, members, admins) keep strong 8+ character passwords.
- Supabase will not accept passwords shorter than 6, so the app silently adds a fixed ending (`fts-pin`) before sending it —
  students only ever type their own password. The Edge Function and the web app must use the same ending (default is fine;
  only change both together via `PIN_PAD` / `VITE_PIN_PAD`).
- Students created earlier with long passwords can still sign in; they move to the new scheme when they change or reset it.
- Security note: a 4-character password is easy to guess. Supabase rate-limits sign-in attempts, but anyone who knows a
  student's ID could keep trying — encourage longer passwords, and use Reset password if a child shares theirs.

## Print all sign-in slips for a grade
Students tab → pick a grade (or tick some students) → **🖨 Print sign-in slips**. You get every student's ID + first password,
8 slips per A4/Letter page (a page break between grades), straight from the database — no need to print right after creating them.
- The **first** password is stored (visible to members/admins only) **until the student changes it**; at that moment it is
  deleted automatically. Students who already changed theirs, or were created before this feature, are skipped and counted in the note —
  use **Reset password** to get a new slip for them.
- Fresh install = `schema.sql`; otherwise run `supabase/migration-005.sql` once and redeploy the Edge Function.

## One course = one semester
- Every course belongs to **one semester** (Subjects tab → choose Semester 1 or 2 when adding it; old courses show "—" until you set it).
  In the second semester, add the new courses and assign teachers to them.
- Teachers see the semester next to each course and can only enter marks in that semester (the database enforces it).
- The card shows every course once. **Yearly average = mean of all the year's courses**, total = their sum, rank follows the average.
  (A semester view/report still averages just that semester's courses.)
- A student's year shows "Incomplete" until both semesters have some approved marks.
- Fresh install = `schema.sql`; otherwise run `supabase/migration-006.sql` once. Existing courses keep working (they can be used in either
  semester) until you set their semester.

## Offline use
- **Open before, view later:** anything a person has opened while online (results, card, marks lists, photos, plan...) is saved on their
  phone and shown again with no internet, with a yellow "You are offline — showing the last saved copy" strip. The app itself,
  the Ethiopic fonts and the PDF/Word/Excel tools are saved too. Each person has their own saved copy; it is **deleted on sign-out**.
- **Teachers can enter marks offline:** scores, drafts and "submit" are kept on the phone ("⏳ waiting") and upload automatically when
  internet returns (also when the app is opened again, or tap **Upload now**). If a course was approved in the meantime the server refuses
  that change and the strip shows a warning — approved marks never change by accident.
- **Needs internet (shows a clear message instead):** first sign-in, changing password, uploading/changing a photo, creating accounts,
  resets, promotions, approving marks, editing the assessment rows, subjects, plan, settings. Those are not queued on purpose
  (they depend on live data or the server).
- Signing out with unsent changes asks first; the changes stay on the phone and upload the next time that person signs in.
- First-time rule: a page must have been opened once while online to be available offline.
- No database change for this version.

## Rosters (view + Excel)
- **Teachers** — on a course's marks screen: the grid now also shows **Average %**, and **Roster Excel ⬇** downloads
  `Student name | each assessment (mid, final, ...) | Total | Average %` plus a "Class average" row. It exports what is on screen,
  so it also works offline.
- **Members/admins** — tab **Rosters**: pick year, grade and Yearly / Semester 1 / Semester 2 → a table of every student in that grade,
  **one column per course** (each out of 100), then **Total, Average %, Rank**. Order by name or rank, and download as Excel.
  Same maths as the report card (each course once; average = mean of the student's courses; rank within the section, ties share).
  Approved marks only, unless you tick "Include marks not approved yet". For the current year, students with no marks yet are listed too.
- No database change.

## What students see (v0.16)
- **No report card for students.** They cannot see, preview, download or print the printed card — members/admins generate it
  (Report cards tab).
- **My profile (read-only text, folded by default):** one line with the photo, name, ID and grade — tap it to unfold the details (the phone remembers your choice). photo, full name, ID, grade, section, Christian name, parish, address, city, kebele, guardian name/phone.
  Only members/admins can edit these (Students → Details); the database blocks students from editing their row.
  The one thing a student can change is their **own photo**.
- **My results:** yearly average and rank, each course with its semester and mark out of 100, and a tap on a course shows its
  assessment breakdown. Results appear only after a member approves the marks.

## Past years after promotion (v0.17)
- Promotion changes the student's grade and ID, but every mark keeps the grade/section it was entered in, and stays linked to the student's
  hidden account id — so nothing is lost.
- On their results screen a student picks a **Year** and a **Semester** (Yearly / Semester 1 / Semester 2): average, rank and the course list
  follow that choice, and a line shows the grade they were in that year ("previous grade" if different from today).
- Right after a new year starts (nothing approved yet for it), the screen opens on the latest year that has results.
- Rank for an old year is the rank in the grade/section they were in at that time. No database change.

## Deleting users (admin only)
- **Students:** Students tab → tick students → **🗑 Delete selected** (shown only to admins). **Staff (teachers / members):** Users tab → **Delete**.
- Type `DELETE` to confirm. It is permanent: the sign-in, the student record, marks, assessment scores, photo, teacher assignments are removed
  (marks a deleted teacher entered stay, just without a name). Great for clearing test accounts.
- Safety: only admins can do it; you cannot delete yourself; an admin account must first be changed to another role in the Users tab.
- Needs the Edge Function redeployed (your GitHub workflow does it on push). No database change.

## Not built yet
Plan completion inside the Word/PowerPoint reports.
