// Supabase Edge Function: manage-users
// Creates student/teacher accounts, resets passwords, and re-issues IDs on promotion.
// Needs the service_role key, which Supabase injects here automatically — it never
// goes into the app or config. Callers must be a member or admin.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

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
      return json({ user: { id, full_name: name, email, role, password } })
    }

    // ---- reset_password: {user_id}
    if (body.action === 'reset_password') {
      const { data: target } = await admin.from('user_roles').select('role').eq('user_id', body.user_id).maybeSingle()
      if (!target) return json({ error: 'User not found' }, 404)
      if (['member', 'admin'].includes(target.role) && callerRole !== 'admin')
        return json({ error: 'Only an admin can reset a member' }, 403)
      const shown = target.role === 'student' ? genPin() : genPassword() // what gets printed / shown
      const actual = target.role === 'student' ? shown + PIN_PAD : shown
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: actual })
      if (error) return json({ error: error.message }, 400)
      await admin.from('profiles').update({ must_change_password: true }).eq('id', body.user_id)
      if (target.role === 'student') await admin.from('initial_passwords').upsert({ student_id: body.user_id, password: shown })
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
      return json({ results, errors })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
