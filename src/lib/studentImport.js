import { GRADE_NAMES } from './grades.js'

const KEYS = {
  name: ['ሙሉ ስም', 'ስም', 'name', 'full name'],
  grade: ['ክፍል', 'grade', 'class'],
  section: ['ክፍለ', 'section', 'ሴክሽን'],
  gender: ['ጾታ', 'gender', 'sex'],
  guardian_name: ['የወላጅ ስም', 'guardian', 'guardian name', 'parent'],
  guardian_phone: ['የወላጅ ስልክ', 'ስልክ', 'phone', 'guardian phone'],
}
const pick = (row, keys) => {
  for (const k of Object.keys(row)) if (keys.includes(k.trim().toLowerCase())) return String(row[k]).trim()
  return ''
}
const parseGrade = (v) => {
  const n = Number(String(v).match(/\d+/)?.[0])
  if (n >= 1 && n <= 12) return n
  const byName = Object.entries(GRADE_NAMES).find(([, name]) => String(v).includes(name))
  return byName ? Number(byName[0]) : null
}
const parseGender = (v) => {
  const s = v.toLowerCase()
  return ['m', 'male', 'ወንድ'].includes(s) ? 'M' : ['f', 'female', 'ሴት'].includes(s) ? 'F' : null
}

export async function parseStudentSheet(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer())
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
  const students = []
  const skipped = []
  rows.forEach((row, i) => {
    const full_name = pick(row, KEYS.name)
    const grade = parseGrade(pick(row, KEYS.grade))
    if (!full_name || !grade) return skipped.push({ row: i + 2, reason: !full_name ? 'name' : 'grade' })
    students.push({
      full_name, grade, section: pick(row, KEYS.section) || 'A', gender: parseGender(pick(row, KEYS.gender)),
      guardian_name: pick(row, KEYS.guardian_name) || null, guardian_phone: pick(row, KEYS.guardian_phone) || null,
    })
  })
  return { students, skipped }
}

export async function downloadStudentTemplate() {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet([{ 'ሙሉ ስም': 'ሙሉ ስም ምሳሌ', 'ክፍል': 5, 'ክፍለ': 'A', 'ጾታ': 'ወንድ', 'የወላጅ ስም': '', 'የወላጅ ስልክ': '' }])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Students')
  XLSX.writeFile(wb, 'students-template.xlsx')
}

export async function exportSummaryXlsx(d, gradeText) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(d.grades.map((g) => ({
    Grade: gradeText(g.grade), Students: g.assessed, 'Average %': g.avg, Passed: g.passed, 'Below pass mark': g.failed,
    Incomplete: g.incomplete, 'Pass rate %': g.passRate, 'Top student': g.top?.name ?? '', 'Top average %': g.top?.avg ?? '',
  })))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  XLSX.writeFile(wb, `summary-${d.year}-${d.scope}.xlsx`)
}
