const COLS = [
  ['no', ['ተ.ቁ', 'no']], ['title', ['አብይ ተግባር', 'title']], ['details', ['ዝርዝር ተግባር', 'details']],
  ['description', ['መግለጫ', 'description']], ['timing', ['የጊዜ ገደብ', 'timing']], ['unit', ['መለኪያ', 'unit']],
  ['target', ['እቅድ', 'target']], ['budget', ['በጀት', 'budget']], ['executor', ['ፈጻሚ አካል', 'executor']], ['weight', ['ክብደት', 'weight']],
]

export async function exportPlan(items, year) {
  const XLSX = await import('xlsx')
  const rows = items.map((it) => Object.fromEntries(COLS.map(([k, names]) => [names[0], it[k] ?? ''])))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), String(year))
  XLSX.writeFile(wb, `plan-${year}.xlsx`)
}

export async function parsePlanSheet(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer())
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
  const out = []
  for (const row of raw) {
    const item = {}
    for (const [k, names] of COLS) {
      const key = Object.keys(row).find((h) => names.includes(h.trim().toLowerCase()))
      item[k] = key ? String(row[key]).trim() : ''
    }
    if (item.title) out.push({ ...item, no: Number(item.no) || null })
  }
  return out
}
