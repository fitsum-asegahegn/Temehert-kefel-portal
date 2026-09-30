import { supabase, fetchAll } from './supabase.js'
import { buildCard } from './calc.js'

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10)

// scope: 'year' | 1 | 2.  Uses APPROVED marks only.
export async function loadReportData({ year, scope, passMark, school }) {
  const [marks, subjects, students] = await Promise.all([
    fetchAll(() => supabase.from('marks').select('student_id, subject_id, term, score, grade').eq('year', year).eq('status', 'approved')),
    supabase.from('subjects').select('*').order('sort').order('id').then((r) => { if (r.error) throw r.error; return r.data }),
    fetchAll(() => supabase.from('students').select('id, full_name')),
  ])
  const inScope = scope === 'year' ? marks : marks.filter((m) => m.term === scope)
  const subj = Object.fromEntries(subjects.map((s) => [s.id, s]))
  const name = Object.fromEntries(students.map((s) => [s.id, s.full_name]))

  const per = new Map()
  for (const m of inScope) {
    if (!per.has(m.student_id)) per.set(m.student_id, { grade: m.grade, marks: [] })
    per.get(m.student_id).marks.push(m)
  }

  const grades = {}
  for (const [id, { grade, marks: ms }] of per) {
    const card = buildCard({ subjects, marks: ms, passMark })
    const g = (grades[grade] ??= { grade, assessed: 0, sum: 0, passed: 0, failed: 0, incomplete: 0, top: null, subj: {} })
    g.assessed++
    g.sum += card.yearly ?? 0
    if (scope === 'year' && card.status === 'incomplete') g.incomplete++
    else if (card.yearly >= passMark) g.passed++
    else g.failed++
    if (!g.top || card.yearly > g.top.avg) g.top = { name: name[id] ?? '', avg: card.yearly }
    for (const m of ms) (g.subj[m.subject_id] ??= []).push((Number(m.score) / Number(subj[m.subject_id].max_score)) * 100)
  }

  const list = Object.values(grades).sort((a, b) => a.grade - b.grade).map((g) => ({
    grade: g.grade, assessed: g.assessed,
    avg: r1(g.sum / g.assessed), passed: g.passed, failed: g.failed, incomplete: g.incomplete,
    passRate: r1((g.passed / g.assessed) * 100), top: g.top,
    subjects: Object.entries(g.subj).map(([sid, arr]) => ({ name_am: subj[sid].name_am, name_en: subj[sid].name_en, avg: r1(mean(arr)) })),
  }))
  const total = list.reduce((s, g) => s + g.assessed, 0)
  return {
    school, year, scope, passMark, grades: list,
    overall: {
      assessed: total,
      avg: total ? r1(list.reduce((s, g) => s + g.avg * g.assessed, 0) / total) : null,
      passRate: total ? r1((list.reduce((s, g) => s + g.passed, 0) / total) * 100) : null,
    },
  }
}
