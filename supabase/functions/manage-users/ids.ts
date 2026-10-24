// Student ID rules (pure, so they can be tested without Deno).
//   Grades 1-6   : temporary ID  FTS/27/<grade letter or digit><3 digits>   (changes when the student is promoted)
//   Grades 7-12  : PERMANENT ID  FTS/<4-digit number>/<YY>                  (never changes again)
//                  YY = last two digits of the Ethiopian year the student joined ቀዳማይ (grade 7).
//                  Someone who joins ቀዳማይ in 2019 gets /19, the next year's group gets /20, and so on.
export const SCHOOL = 'FTS'
export const OLD_BATCH = '27'

// Grades 3..12 -> digits 0..9. Grades 1 and 2 -> letters A and B.
export const prefix = (g: number) => (g === 1 ? 'A' : g === 2 ? 'B' : String(g - 3))
export const oldCode = (g: number, seq: number) => `${SCHOOL}/${OLD_BATCH}/${prefix(g)}${String(seq).padStart(3, '0')}`
export const permanentCode = (cohort: number, serial: number) =>
  `${SCHOOL}/${String(serial).padStart(4, '0')}/${String(cohort % 100).padStart(2, '0')}`

// The cohort of a student who is in `grade` during Ethiopian school year `schoolYear` (grade 7 = joined this year).
export const cohortFor = (grade: number, schoolYear: number) => schoolYear - (grade - 7)

export const emailFor = (code: string, domain: string) => code.toLowerCase().replaceAll('/', '-') + '@' + domain
