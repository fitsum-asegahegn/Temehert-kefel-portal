import { buildCard } from './calc.js'

const round2 = (n) => Math.round(n * 100) / 100

// One grade, one year: every student with each course's score (out of 100), total, average and rank.
// Same maths as the report card: a course counts once, average = mean of the student's courses,
// rank = within the section, equal averages share a rank.
//   marks: [{student_id, subject_id, term, score, section}]   students: [{id, full_name, grade, section, active}]
//   assigned: subject ids a teacher is assigned to for this grade (so columns exist before marks do)
export function buildRoster({ marks, subjects, students, assigned = [], scope = 'year', grade, includeCurrent = true, passMark = 50, sort = 'name' }) {
  const stById = new Map(students.map((s) => [s.id, s]))
  const byStudent = new Map()
  for (const m of marks) {
    if (!byStudent.has(m.student_id)) byStudent.set(m.student_id, { marks: [], section: m.section })
    byStudent.get(m.student_id).marks.push(m)
  }
  if (includeCurrent) for (const s of students) if (s.active && s.grade === grade && !byStudent.has(s.id)) byStudent.set(s.id, { marks: [], section: s.section })

  const inMarks = new Set(marks.map((m) => m.subject_id))
  const assignedSet = new Set(assigned)
  const columns = subjects.filter((s) => inMarks.has(s.id) || (assignedSet.has(s.id) && (scope === 'year' || !s.term || s.term === scope)))

  const rows = [...byStudent].filter(([id]) => stById.has(id)).map(([id, v]) => {
    const card = buildCard({ subjects: columns, marks: v.marks, passMark })
    const cells = columns.map((c) => card.rows.find((r) => r.subject.id === c.id)?.avg ?? null)
    const present = cells.filter((x) => x != null)
    return {
      id, name: stById.get(id).full_name, section: v.section || stById.get(id).section,
      cells, total: present.length ? round2(present.reduce((a, b) => a + b, 0)) : null, average: card.yearly, rank: null,
    }
  })

  for (const r of rows) {
    if (r.average == null) continue
    r.rank = 1 + rows.filter((o) => o.section === r.section && o.average != null && o.average > r.average).length
  }
  rows.sort(sort === 'rank'
    ? (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name)
    : (a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name))
  return { columns, rows, sections: [...new Set(rows.map((r) => r.section))] }
}
