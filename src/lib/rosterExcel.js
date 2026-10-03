// Saves a simple table as an .xlsx file. Numbers stay numbers (so Excel can add them up); empty = blank cell.
export async function downloadSheet({ sheet, header, rows, filename, firstColWidth = 28 }) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  ws['!cols'] = header.map((h, i) => ({ wch: i === 0 ? firstColWidth : Math.max(9, Math.min(24, String(h).length + 2)) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, String(sheet).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || 'Roster')
  XLSX.writeFile(wb, filename)
}
export const safeName = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'roster'
