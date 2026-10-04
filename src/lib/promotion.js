import { buildCard } from './calc.js'

// Year-end promotion plan for ONE grade. Uses APPROVED marks of that year (the ones on the report card).
//   promoted   = both semesters have marks and the yearly average reaches the pass mark   -> ticked by default
//   repeat     = both semesters have marks but the average is below the pass mark         -> stays in the grade
//   incomplete = a semester has no approved marks (or none at all)                         -> stays; needs a look
export function planPromotion({ marks, subjects, students, grade, passMark = 50 }) {
  const byStudent = new Map()
  for (const m of marks) {
    if (!byStudent.has(m.student_id)) byStudent.set(m.student_id, [])
    byStudent.get(m.student_id).push(m)
  }
  return students
    .filter((s) => s.active && s.grade === grade)
    .map((s) => {
      const ms = byStudent.get(s.id) || []
      const card = buildCard({ subjects, marks: ms, passMark })
      const status = ms.length ? card.status : 'incomplete'
      return { id: s.id, name: s.full_name, code: s.code, section: s.section, average: ms.length ? card.yearly : null, status, promote: status === 'promoted' }
    })
    .sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name))
}
