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
