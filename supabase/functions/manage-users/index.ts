// Supabase Edge Function: manage-users
// Creates student/teacher accounts, resets passwords, and re-issues IDs on promotion.
// Needs the service_role key, which Supabase injects here automatically — it never
// goes into the app or config. Callers must be a member or admin.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { buildResultMessages } from './telegram.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SCHOOL = 'FTS'
const BATCH = '27'
const DOMAIN = Deno.env.get('STUDENT_DOMAIN') ?? 'students.fts-portal.app'

// Grades 3..12 -> digits 0..9. Grades 1 and 2 -> letters A and B.
const prefix = (g: number) => (g === 1 ? 'A' : g === 2 ? 'B' : String(g - 3))
const codeOf = (g: number, seq: number) => `${SCHOOL}/${BATCH}/${prefix(g)}${String(seq).padStart(3, '0')}`
const emailOf = (code: string) => code.toLowerCase().replaceAll('/', '-') + '@' + DOMAIN

// Students use a 4-digit PIN. Supabase won't accept passwords shorter than 6, so a fixed ending is added behind the
// scenes (the app does the same when a student signs in). Keep it identical to PIN_PAD in the web app.
const PIN_PAD = Deno.env.get('PIN_PAD') ?? 'fts-pin'
const genPin = () => {
  const b = new Uint32Array(1)
  crypto.getRandomValues(b)
  return String(b[0] % 10000).padStart(4, '0')
}

// Parents sign in with their mobile number (e.g. 0912 345 678). Behind the scenes: p<9 digits>@<PARENT_DOMAIN>.
const PARENT_DOMAIN = Deno.env.get('PARENT_DOMAIN') ?? 'parents.fts-portal.app'
const normPhone = (v: string) => {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.startsWith('251')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return /^[79]\d{8}$/.test(d) ? d : null
}
const parentEmail = (nine: string) => `p${nine}@${PARENT_DOMAIN}`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// 200 = sent, 403/400 = the person blocked the bot or the chat is gone
async function tgSend(token: string, chatId: number, text: string, retry = true): Promise<number> {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  if (r.status === 429 && retry) {
    const j = await r.json().catch(() => ({}))
    await sleep(((j as any)?.parameters?.retry_after ?? 2) * 1000)
    return tgSend(token, chatId, text, false)
  }
  return r.status
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789' // no 0/O/1/l/I
const genPassword = (n = 8) => {
  const b = new Uint32Array(n)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'Not signed in' }, 401)

    const admin = createClient(url, service)
    const { data: me } = await admin.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    const callerRole = me?.role
    if (!['member', 'admin'].includes(callerRole)) return json({ error: 'Not allowed' }, 403)

    const body = await req.json()

    // Edge Function changes are written to the audit log here (database triggers can't tell who the caller was).
    const { data: callerProfile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    const audit = async (action: string, details: Record<string, unknown>) => {
      try { await admin.from('audit_log').insert({ actor: user.id, actor_name: callerProfile?.full_name ?? null, action, details }) } catch { /* never block the action */ }
    }

    // ---- create_students: [{full_name, grade, section?, gender?, guardian_name?, guardian_phone?}]
    if (body.action === 'create_students') {
      const list = body.students as any[]
      if (!Array.isArray(list) || !list.length) return json({ error: 'No students given' }, 400)
      const { data: mx } = await admin.from('students').select('seq').order('seq', { ascending: false }).limit(1)
      let seq = mx?.[0]?.seq ?? 0
      const created: any[] = []
      const errors: any[] = []
      for (const s of list) {
        const name = String(s.full_name ?? '').trim()
        const grade = Number(s.grade)
        if (!name || !(grade >= 1 && grade <= 12)) { errors.push({ full_name: name, error: 'Invalid name or grade' }); continue }
        if (seq >= 999) { errors.push({ full_name: name, error: 'All 999 ID numbers are used' }); continue }
        seq++
        const code = codeOf(grade, seq)
        const pin = genPin()
        const { data: u, error: ue } = await admin.auth.admin.createUser({
          email: emailOf(code), password: pin + PIN_PAD, email_confirm: true, user_metadata: { full_name: name },
        })
        if (ue || !u?.user) { seq--; errors.push({ full_name: name, error: ue?.message ?? 'Could not create account' }); continue }
        const id = u.user.id
        let fail = (await admin.from('user_roles').upsert({ user_id: id, role: 'student' })).error
        if (!fail) fail = (await admin.from('profiles').upsert({ id, full_name: name, must_change_password: true })).error
        if (!fail) {
          fail = (await admin.from('students').insert({
            id, seq, code, full_name: name, grade,
            section: s.section || 'A', gender: s.gender ?? null,
            guardian_name: s.guardian_name ?? null, guardian_phone: s.guardian_phone ?? null,
            christian_name: s.christian_name ?? null, parish: s.parish ?? null,
            address: s.address ?? null, city: s.city ?? null, kebele: s.kebele ?? null,
          })).error
        }
        if (fail) {
          await admin.auth.admin.deleteUser(id)
          seq--
          errors.push({ full_name: name, error: fail.message })
          continue
        }
        // keep the first password so the slip can be re-printed (deleted automatically once the student changes it)
        await admin.from('initial_passwords').upsert({ student_id: id, password: pin })
        created.push({ id, full_name: name, code, grade, password: pin })
      }
      if (created.length) await audit('student.create', { count: created.length, grades: [...new Set(created.map((c) => c.grade))] })
      return json({ created, errors })
    }

    // ---- create_staff: {full_name, email, role: teacher|member|admin}
    if (body.action === 'create_staff') {
      const role = body.role
      if (!['teacher', 'member', 'admin'].includes(role)) return json({ error: 'Invalid role' }, 400)
      if (role !== 'teacher' && callerRole !== 'admin') return json({ error: 'Only an admin can create members' }, 403)
      const email = String(body.email ?? '').trim().toLowerCase()
      const name = String(body.full_name ?? '').trim()
      if (!email || !name) return json({ error: 'Name and email are required' }, 400)
      const password = genPassword()
      const { data: u, error: ue } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: name },
      })
      if (ue || !u?.user) return json({ error: ue?.message ?? 'Could not create account' }, 400)
      const id = u.user.id
      await admin.from('user_roles').upsert({ user_id: id, role })
      await admin.from('profiles').upsert({ id, full_name: name, must_change_password: true })
      await audit('staff.create', { name, role })
      return json({ user: { id, full_name: name, email, role, password } })
    }

    // ---- reset_password: {user_id}
    if (body.action === 'reset_password') {
      const { data: target } = await admin.from('user_roles').select('role').eq('user_id', body.user_id).maybeSingle()
      if (!target) return json({ error: 'User not found' }, 404)
      if (['member', 'admin'].includes(target.role) && callerRole !== 'admin')
        return json({ error: 'Only an admin can reset a member' }, 403)
      const pinRole = target.role === 'student' || target.role === 'parent'
      const shown = pinRole ? genPin() : genPassword() // what gets printed / shown
      const actual = pinRole ? shown + PIN_PAD : shown
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: actual })
      if (error) return json({ error: error.message }, 400)
      await admin.from('profiles').update({ must_change_password: true }).eq('id', body.user_id)
      if (target.role === 'student') await admin.from('initial_passwords').upsert({ student_id: body.user_id, password: shown })
      const { data: tp } = await admin.from('profiles').select('full_name').eq('id', body.user_id).maybeSingle()
      await audit('password.reset', { name: tp?.full_name ?? '', role: target.role })
      return json({ password: shown })
    }

    // ---- promote: moves [{id, grade}]  (grade 13 = graduate: account deactivated, ID unchanged)
    if (body.action === 'promote') {
      const moves = body.moves as { id: string; grade: number }[]
      if (!Array.isArray(moves) || !moves.length) return json({ error: 'No students given' }, 400)
      const results: any[] = []
      const errors: any[] = []
      for (const m of moves) {
        const { data: st } = await admin.from('students').select('id, seq, code, full_name').eq('id', m.id).maybeSingle()
        if (!st) { errors.push({ id: m.id, error: 'Student not found' }); continue }
        if (m.grade > 12) {
          await admin.from('students').update({ active: false }).eq('id', st.id)
          results.push({ id: st.id, full_name: st.full_name, old_code: st.code, new_code: st.code, graduated: true })
          continue
        }
        if (!(m.grade >= 1)) { errors.push({ id: m.id, full_name: st.full_name, error: 'Invalid grade' }); continue }
        const newCode = codeOf(m.grade, st.seq)
        if (newCode !== st.code) {
          const { error: ae } = await admin.auth.admin.updateUserById(st.id, { email: emailOf(newCode), email_confirm: true })
          if (ae) { errors.push({ id: st.id, full_name: st.full_name, error: ae.message }); continue }
        }
        const { error: se } = await admin.from('students').update({ grade: m.grade, code: newCode }).eq('id', st.id)
        if (se) { errors.push({ id: st.id, full_name: st.full_name, error: se.message }); continue }
        results.push({ id: st.id, full_name: st.full_name, old_code: st.code, new_code: newCode, graduated: false })
      }
      if (results.length) {
        const moved = results.filter((r) => !r.graduated)
        if (moved.length) await audit('student.promote', { count: moved.length, graduated: false, to_grade: moves.find((m) => m.id === moved[0].id)?.grade })
        const grads = results.filter((r) => r.graduated)
        if (grads.length) await audit('student.promote', { count: grads.length, graduated: true })
      }
      return json({ results, errors })
    }

    // ---- create_parents: {student_ids: [], phone?}  Creates (or reuses) a parent login from each student's guardian phone
    //      and links it to the child. Brothers/sisters with the same phone share ONE parent account.
    if (body.action === 'create_parents') {
      const ids = body.student_ids as string[]
      if (!Array.isArray(ids) || !ids.length) return json({ error: 'No students given' }, 400)
      if (ids.length > 300) return json({ error: 'At most 300 at a time' }, 400)
      const created = new Map<string, any>()
      const linked: string[] = []
      const skipped: any[] = []
      for (const sid of ids) {
        const { data: st } = await admin.from('students').select('id, full_name, grade, guardian_name, guardian_phone').eq('id', sid).maybeSingle()
        if (!st) { skipped.push({ id: sid, reason: 'Student not found' }); continue }
        const single = ids.length === 1 && body.phone
        const nine = normPhone(single ? String(body.phone) : st.guardian_phone ?? '')
        if (!nine) { skipped.push({ id: sid, full_name: st.full_name, reason: 'No valid guardian phone number' }); continue }
        if (single && !st.guardian_phone) await admin.from('students').update({ guardian_phone: String(body.phone) }).eq('id', sid)
        const email = parentEmail(nine)
        const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
        let parentId: string | undefined = existing?.id
        if (parentId) {
          const { data: pr } = await admin.from('user_roles').select('role').eq('user_id', parentId).maybeSingle()
          if (pr?.role !== 'parent') { skipped.push({ id: sid, full_name: st.full_name, reason: 'That phone number belongs to another kind of account' }); continue }
          if (created.has(parentId)) created.get(parentId).students.push({ name: st.full_name, grade: st.grade })
          else linked.push(st.full_name)
        } else {
          const pin = genPin()
          const display = st.guardian_name || `ወላጅ / Parent of ${st.full_name}`
          const { data: u, error: ue } = await admin.auth.admin.createUser({
            email, password: pin + PIN_PAD, email_confirm: true, user_metadata: { full_name: display },
          })
          if (ue || !u?.user) { skipped.push({ id: sid, full_name: st.full_name, reason: ue?.message ?? 'Could not create account' }); continue }
          parentId = u.user.id
          await admin.from('user_roles').upsert({ user_id: parentId, role: 'parent' })
          await admin.from('profiles').upsert({ id: parentId, full_name: display, must_change_password: true })
          created.set(parentId, { parent_id: parentId, name: display, login: '0' + nine, password: pin, students: [{ name: st.full_name, grade: st.grade }] })
        }
        await admin.from('parent_students').upsert({ parent_id: parentId, student_id: sid })
      }
      if (created.size || linked.length) await audit('parent.create', { created: created.size, linked: linked.length })
      return json({ created: [...created.values()], linked, skipped })
    }

    // ---- unlink_parent: {parent_id, student_id}  (a parent left with no child is removed)
    if (body.action === 'unlink_parent') {
      await admin.from('parent_students').delete().match({ parent_id: body.parent_id, student_id: body.student_id })
      const { count } = await admin.from('parent_students').select('*', { count: 'exact', head: true }).eq('parent_id', body.parent_id)
      let removed = false
      if (!count) { const { error } = await admin.auth.admin.deleteUser(body.parent_id); removed = !error }
      await audit('parent.unlink', { removed })
      return json({ removed })
    }

    // ---- notify_release: {year, term, grade, skip?}  Sends the released results to every linked student/parent on Telegram.
    //      Works in slices of 400 messages; call again with `skip: next` until `next` is null.
    if (body.action === 'notify_release') {
      const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
      if (!token) return json({ error: 'The Telegram bot is not set up yet (TELEGRAM_BOT_TOKEN is missing).' }, 400)
      const year = Number(body.year), term = Number(body.term), grade = Number(body.grade)
      const { data: pub } = await admin.from('published_results').select('year').match({ year, term, grade }).maybeSingle()
      if (!pub) return json({ error: 'Release the results to students first.' }, 400)

      const all = async (q: () => any) => { // read past the 1000-row limit
        let out: any[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await q().range(from, from + 999)
          if (error) throw new Error(error.message)
          out = out.concat(data)
          if (data.length < 1000) return out
        }
      }
      const marks = await all(() => admin.from('marks').select('student_id, subject_id, score, section').match({ year, term, grade, status: 'approved' }))
      const students = await all(() => admin.from('students').select('id, full_name'))
      const { data: subjects } = await admin.from('subjects').select('id, name_am, max_score')
      const { data: parentLinks } = await admin.from('parent_students').select('parent_id, student_id')
      const { data: links } = await admin.from('telegram_links').select('user_id, chat_id')
      const { data: sch } = await admin.from('settings').select('value').eq('key', 'school_name').maybeSingle()

      const built = buildResultMessages({ year, term, grade, marks, subjects: subjects ?? [], students, parentLinks: parentLinks ?? [], links: links ?? [], school: sch?.value || undefined, appUrl: Deno.env.get('APP_URL') || undefined })
      const skip = Math.max(0, Number(body.skip ?? 0))
      const slice = built.messages.slice(skip, skip + 400)
      let sent = 0, blocked = 0, failed = 0
      for (let i = 0; i < slice.length; i += 20) { // ~25 messages a second, under Telegram's limit
        const group = slice.slice(i, i + 20)
        const codes = await Promise.all(group.map((m) => tgSend(token, m.chat_id, m.text).catch(() => 0)))
        codes.forEach((c, k) => {
          if (c === 200) sent++
          else if (c === 403 || c === 400) { blocked++; admin.from('telegram_links').delete().eq('chat_id', group[k].chat_id).then(() => {}) }
          else failed++
        })
        await sleep(800)
      }
      const next = skip + 400 < built.messages.length ? skip + 400 : null
      if (next === null) {
        await admin.from('published_results').update({ telegram_sent_at: new Date().toISOString() }).match({ year, term, grade })
        await audit('telegram.notify', { year, term, grade, messages: built.messages.length })
      }
      return json({ total: built.messages.length, sent, blocked, failed, next, students: built.students, withoutLink: built.withoutLink })
    }

    // ---- delete_users: {user_ids: []}  ADMIN ONLY. Removes the account and everything tied to it
    //      (student record, marks, assessment scores, photo, teacher assignments...). Cannot be undone.
    if (body.action === 'delete_users') {
      if (callerRole !== 'admin') return json({ error: 'Only an admin can delete users' }, 403)
      const ids = body.user_ids as string[]
      if (!Array.isArray(ids) || !ids.length) return json({ error: 'No users given' }, 400)
      if (ids.length > 200) return json({ error: 'Delete at most 200 at a time' }, 400)
      const deleted: string[] = []
      const errors: any[] = []
      const { data: nameRows } = await admin.from('profiles').select('id, full_name').in('id', ids)
      const nameOf = Object.fromEntries((nameRows ?? []).map((r: any) => [r.id, r.full_name]))
      for (const id of ids) {
        if (id === user.id) { errors.push({ id, error: 'You cannot delete your own account' }); continue }
        const { data: target } = await admin.from('user_roles').select('role').eq('user_id', id).maybeSingle()
        if (target?.role === 'admin') { errors.push({ id, error: 'Change this admin to another role first, then delete' }); continue }
        try {
          // photo files (students)
          const { data: files } = await admin.storage.from('student-photos').list(id)
          if (files?.length) await admin.storage.from('student-photos').remove(files.map((f) => `${id}/${f.name}`))
        } catch { /* no photos */ }
        // these two columns point at users without cascading; clear them so the delete is not blocked
        await admin.from('marks').update({ entered_by: null }).eq('entered_by', id)
        await admin.from('plan_log').update({ by: null }).eq('by', id)
        const { error } = await admin.auth.admin.deleteUser(id)
        if (error) errors.push({ id, error: error.message })
        else deleted.push(id)
      }
      if (deleted.length) await audit('user.delete', { count: deleted.length, names: deleted.map((id) => nameOf[id] ?? id) })
      return json({ deleted, errors })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
