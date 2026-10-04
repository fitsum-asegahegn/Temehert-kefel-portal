import { supabase, fetchAll } from './supabase.js'

// One Excel workbook with everything that matters (no passwords, no photos). Admin runs it regularly and keeps the file safe.
export async function downloadBackup() {
  const get = (table, cols = '*') => fetchAll(() => supabase.from(table).select(cols))
  const [students, subjects, marks, assessments, scores, assigns, roles, profiles, published, settings, planItems, planLog] = await Promise.all([
    get('students'), get('subjects'), get('marks'), get('assessments'), get('assessment_scores'), get('teacher_assignments'),
    get('user_roles'), get('profiles'), get('published_results'), get('settings'), get('plan_items'), get('plan_log'),
  ])
  const st = Object.fromEntries(students.map((s) => [s.id, s]))
  const sub = Object.fromEntries(subjects.map((s) => [s.id, s]))
  const asm = Object.fromEntries(assessments.map((a) => [a.id, a]))
  const prof = Object.fromEntries(profiles.map((p) => [p.id, p]))
  const role = Object.fromEntries(roles.map((r) => [r.user_id, r.role]))
  const item = Object.fromEntries(planItems.map((p) => [p.id, p]))

  const sheets = {
    Students: students.map((s) => ({ ID: s.code, Name: s.full_name, Grade: s.grade, Section: s.section, Gender: s.gender, 'Christian name': s.christian_name, Parish: s.parish, Address: s.address, City: s.city, Kebele: s.kebele, Guardian: s.guardian_name, 'Guardian phone': s.guardian_phone, Active: s.active ? 'yes' : 'no' })),
    Courses: subjects.map((s) => ({ 'Course (am)': s.name_am, 'Course (en)': s.name_en, 'Out of': s.max_score, Semester: s.term })),
    Marks: marks.map((m) => ({ ID: st[m.student_id]?.code, Name: st[m.student_id]?.full_name, Year: m.year, Semester: m.term, 'Grade then': m.grade, 'Section then': m.section, Course: sub[m.subject_id]?.name_am, Score: m.score, 'Out of': sub[m.subject_id]?.max_score, Status: m.status })),
    Assessments: scores.map((r) => { const a = asm[r.assessment_id]; return { ID: st[r.student_id]?.code, Name: st[r.student_id]?.full_name, Year: a?.year, Semester: a?.term, Grade: a?.grade, Course: sub[a?.subject_id]?.name_am, Assessment: a?.name, 'Out of': a?.max_points, Score: r.score } }),
    Teaching: assigns.map((a) => ({ Teacher: prof[a.teacher_id]?.full_name, Course: sub[a.subject_id]?.name_am, Grade: a.grade })),
    People: profiles.filter((p) => role[p.id] && role[p.id] !== 'student').map((p) => ({ Name: p.full_name, Email: p.email, Role: role[p.id] })),
    Released: published.map((p) => ({ Year: p.year, Semester: p.term, Grade: p.grade, 'Released on': p.published_at })),
    Plan: planItems.map((p) => ({ No: p.no, Year: p.year, Title: p.title, Timing: p.timing, Target: p.target, Executor: p.executor, Weight: p.weight })),
    'Plan done': planLog.map((l) => ({ Item: item[l.item_id]?.title, Date: l.done_on, Note: l.note, By: l.by_name })),
    Settings: settings.map((s) => ({ Key: s.key, Value: s.value })),
  }

  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}])
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  const day = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `backup-${day}.xlsx`)
  localStorage.setItem('lastBackup', day)
  return { students: students.length, marks: marks.length }
}
