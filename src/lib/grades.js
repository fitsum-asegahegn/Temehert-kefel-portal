const STUDENT_DOMAIN = import.meta.env?.VITE_STUDENT_DOMAIN || 'students.fts-portal.app'

// Grades 7-12 use the traditional names.
export const GRADE_NAMES = { 7: 'ቀዳማይ', 8: 'ካልዓይ', 9: 'ሳልሳይ', 10: 'ራብዓይ', 11: 'ሀምሳይ', 12: 'ሳድሳይ' }
export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export function gradeLabel(g, lang = 'am') {
  if (GRADE_NAMES[g]) return lang === 'en' ? `Grade ${g} (${GRADE_NAMES[g]})` : GRADE_NAMES[g]
  return lang === 'en' ? `Grade ${g}` : `${g}ኛ ክፍል`
}

export const CONDUCT = {
  A: { am: 'እጅግ በጣም ጥሩ', en: 'Excellent' },
  B: { am: 'በጣም ጥሩ', en: 'Very good' },
  C: { am: 'ጥሩ', en: 'Good' },
  D: { am: 'መሻሻል ያስፈልጋል', en: 'Needs improvement' },
}

// ID: FTS/27/#### — 27 is constant; the first character encodes the grade:
// grades 3..12 -> digits 0..9, grade 1 -> A, grade 2 -> B. Last 3 digits stay for life.
// Student passwords: at least 4 characters, any letters / numbers / symbols (the first one printed on the slip is 4 digits).
// Supabase refuses passwords under 6 characters, so the app quietly adds a fixed ending before sending it.
// Students only ever type their own password. Must match PIN_PAD in the Edge Function.
export const PIN_PAD = import.meta.env?.VITE_PIN_PAD || 'fts-pin'
export const studentPassword = (pw) => String(pw) + PIN_PAD
export const MIN_STUDENT_PW = 4
export const MAX_STUDENT_PW = 60 // keeps the padded password within Supabase's 72-byte limit
export const isStudentPassword = (v) =>
  v.length >= MIN_STUDENT_PW && v.length <= MAX_STUDENT_PW && !/^(.)\1+$/.test(v) && v !== '1234'

// Parents sign in with their mobile number; it maps to a hidden email, just like student IDs do.
export const PARENT_DOMAIN = import.meta.env?.VITE_PARENT_DOMAIN || 'parents.fts-portal.app'
export function normalizePhone(input) {
  let d = String(input ?? '').replace(/\D/g, '')
  if (d.startsWith('251')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return /^[79]\d{8}$/.test(d) ? d : null
}
export const parentEmail = (nine) => `p${nine}@${PARENT_DOMAIN}`
export const phoneFromEmail = (email) => { const m = /^p(\d{9})@/.exec(email || ''); return m ? '0' + m[1] : '' }

export const SCHOOL = 'FTS'
export const BATCH = '27'
export const prefixFor = (g) => (g === 1 ? 'A' : g === 2 ? 'B' : String(g - 3))
export const codeFor = (g, seq) => `${SCHOOL}/${BATCH}/${prefixFor(g)}${String(seq).padStart(3, '0')}`
export const emailForCode = (code) => code.toLowerCase().replaceAll('/', '-') + '@' + STUDENT_DOMAIN

export function gradeFromCode(code) {
  const c = code.split('/')[2]?.[0]
  if (c === 'A') return 1
  if (c === 'B') return 2
  return c >= '0' && c <= '9' ? Number(c) + 3 : null
}

// Accepts "fts/27/0142", "FTS-27-0142", "fts 27 0142" ... returns canonical code or null.
export function normalizeCode(input) {
  const m = String(input).toUpperCase().trim()
    .match(/^FTS[\s/\-]*27[\s/\-]*([AB]\d{3}|\d{4})$/)
  return m ? `${SCHOOL}/${BATCH}/${m[1]}` : null
}
