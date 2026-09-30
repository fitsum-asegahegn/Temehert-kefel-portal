import { gradeLabel } from './grades.js'
import { H, narrative } from './reportText.js'
import { downloadBlob } from './download.js'

const FONT = 'Nyala' // falls back automatically where Nyala is missing

export async function makeWord(d, lang) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType } = await import('docx')
  const h = H(lang)
  const run = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: FONT, ...o })
  const para = (text, o = {}) => new Paragraph({ children: [run(text, o.run)], spacing: { after: 120 }, alignment: o.align, heading: o.heading })
  const cell = (text, o = {}) => new TableCell({
    children: [new Paragraph({ children: [run(text, { bold: o.bold, size: 20, color: o.color })], alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT })],
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  })
  const table = (head, rows) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((t, i) => cell(t, { bold: true, fill: '16213A', color: 'FFFFFF', right: i > 0 })) }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, { right: i > 0 && (typeof t === 'number' || /^[\d.\-—%]*$/.test(String(t))) })) })),
    ],
  })

  const children = [
    para(d.school, { align: AlignmentType.CENTER, run: { bold: true, size: 32 } }),
    para(h.title(d.year, d.scope), { align: AlignmentType.CENTER, run: { size: 26 } }),
    para(`${h.passMark}: ${d.passMark}%`, { align: AlignmentType.CENTER, run: { color: '5B667A', size: 20 } }),
    para(h.summary, { run: { bold: true, size: 26 } }),
    ...narrative(d, lang).map((l) => para(l)),
  ]

  if (d.grades.length) {
    children.push(para(h.byGrade, { run: { bold: true, size: 26 } }))
    children.push(table(
      [h.grade, h.assessed, h.avg, h.passed, h.failed, h.incomplete, h.passRate, h.top],
      [
        ...d.grades.map((g) => [gradeLabel(g.grade, lang), g.assessed, g.avg, g.passed, g.failed, g.incomplete, g.passRate, g.top ? `${g.top.name} (${g.top.avg}%)` : '—']),
        [h.overall, d.overall.assessed, d.overall.avg, '', '', '', d.overall.passRate, ''],
      ],
    ))
    children.push(para(''))
    children.push(para(h.subjects, { run: { bold: true, size: 26 } }))
    for (const g of d.grades) {
      children.push(para(gradeLabel(g.grade, lang), { run: { bold: true } }))
      children.push(table([h.subject, h.avg], g.subjects.map((s) => [lang === 'en' && s.name_en ? s.name_en : s.name_am, s.avg])))
      children.push(para(''))
    }
  }

  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children }] })
  downloadBlob(await Packer.toBlob(doc), `report-${d.year}-${d.scope}.docx`)
}
