// Fill the teacher's marks grid from an Excel/CSV sheet.
// Columns: a student column (ID like FTS/27/0142, or the full name) + one column per assessment, headed with the
// assessment's name (a trailing "(30)" is ignored, so the roster download can be re-imported).

const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const stripMax = (h) => norm(h).replace(/\s*\(\s*[\d.]+\s*\)\s*$/, '').trim()
const codeKey = (v) => String(v ?? '').toUpperCase().replace(/[\s\-/]+/g, '')

export async function readSheet(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer())
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
}

// rows: objects keyed by header.  students: [{id, full_name, code}].  defs: [{id, name, max_points}]
// locked: Set of student ids whose marks are approved (skipped).
// -> { fill: { "studentId|assessmentId": "text" }, filled, unmatched: [names], bad: [msgs], missingCols: [names], skippedLocked }
export function mapMarksSheet(rows, students, defs, locked = new Set()) {
  const out = { fill: {}, filled: 0, unmatched: [], bad: [], missingCols: [], skippedLocked: 0 }
  if (!rows.length) return out
  const headers = Object.keys(rows[0])
  const idCol = headers.find((h) => /^(student\s*)?id$|መታወቂያ/i.test(norm(h)))
  const nameCol = headers.find((h) => /name|ስም/i.test(norm(h)) && h !== idCol)
  const colFor = new Map() // assessment id -> header
  for (const d of defs) {
    const h = headers.find((x) => stripMax(x) === norm(d.name))
    if (h) colFor.set(d.id, h); else out.missingCols.push(d.name)
  }
  const byCode = new Map(students.map((s) => [codeKey(s.code), s]))
  const byName = new Map(students.map((s) => [norm(s.full_name), s]))

  for (const row of rows) {
    const label = String(row[nameCol] ?? row[idCol] ?? '').trim()
    if (!label && !String(row[idCol] ?? '').trim()) continue // blank line
    const st = (idCol && byCode.get(codeKey(row[idCol]))) || (nameCol && byName.get(norm(row[nameCol])))
    if (!st) { out.unmatched.push(label || String(row[idCol])); continue }
    if (locked.has(st.id)) { out.skippedLocked++; continue }
    let any = false
    for (const d of defs) {
      const h = colFor.get(d.id)
      if (!h) continue
      const raw = row[h]
      if (raw === '' || raw == null) continue
      const v = Number(String(raw).replace(',', '.'))
      if (Number.isNaN(v) || v < 0 || v > Number(d.max_points)) { out.bad.push(`${st.full_name} · ${d.name}: ${raw}`); continue }
      out.fill[`${st.id}|${d.id}`] = String(v); any = true
    }
    if (any) out.filled++
  }
  return out
}

// A blank sheet to fill in: ID + name + one column per assessment.
export async function downloadMarksTemplate(students, defs, filename) {
  const XLSX = await import('xlsx')
  const header = ['Student ID', 'Student name', ...defs.map((d) => `${d.name} (${d.max_points})`)]
  const ws = XLSX.utils.aoa_to_sheet([header, ...students.map((s) => [s.code, s.full_name, ...defs.map(() => '')])])
  ws['!cols'] = header.map((h, i) => ({ wch: i === 1 ? 28 : i === 0 ? 14 : 12 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Marks')
  XLSX.writeFile(wb, filename)
}
