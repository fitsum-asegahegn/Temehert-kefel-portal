import { gradeLabel } from './grades.js'
import { H, narrative } from './reportText.js'

const FONT = 'Nyala'
const NAVY = '16213A', GOLD = 'B8862F', RED = 'A3262A', GREEN = '2F6B4F', GREY = '5B667A'

export async function makePpt(d, lang) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const h = H(lang)
  const p = new PptxGenJS()
  p.layout = 'LAYOUT_WIDE' // 13.33 x 7.5 in

  const base = (title) => {
    const s = p.addSlide()
    s.background = { color: 'F2F4F7' }
    s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: NAVY } })
    s.addShape(p.ShapeType.rect, { x: 0, y: 0.9, w: 13.33, h: 0.05, fill: { color: GOLD } })
    s.addText(title, { x: 0.5, y: 0.1, w: 12.3, h: 0.7, fontFace: FONT, fontSize: 24, bold: true, color: 'FFFFFF' })
    return s
  }
  const head = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontFace: FONT, fontSize: 12 } })
  const c = (t, o = {}) => ({ text: String(t ?? ''), options: { fontFace: FONT, fontSize: 12, color: NAVY, ...o } })

  // Title
  const t = p.addSlide()
  t.background = { color: NAVY }
  t.addText(d.school, { x: 0.8, y: 2.3, w: 11.7, h: 1, fontFace: FONT, fontSize: 36, bold: true, color: 'FFFFFF', align: 'center' })
  t.addText(h.title(d.year, d.scope), { x: 0.8, y: 3.4, w: 11.7, h: 0.8, fontFace: FONT, fontSize: 22, color: 'E6C98A', align: 'center' })

  // Summary
  const s1 = base(h.summary)
  s1.addText(narrative(d, lang).map((l) => ({ text: l, options: { bullet: true, breakLine: true } })),
    { x: 0.7, y: 1.3, w: 12, h: 5.5, fontFace: FONT, fontSize: 20, color: NAVY, valign: 'top', paraSpaceAfter: 10 })

  if (d.grades.length) {
    // Average by grade + pass split
    const s2 = base(h.avg)
    s2.addChart(p.charts.BAR, [{ name: h.avg, labels: d.grades.map((g) => gradeLabel(g.grade, lang)), values: d.grades.map((g) => g.avg) }], {
      x: 0.5, y: 1.2, w: 8, h: 5.8, barDir: 'col', chartColors: [NAVY], catAxisLabelFontFace: FONT, valAxisMaxVal: 100, valAxisMinVal: 0,
      showValue: true, dataLabelFontFace: FONT, showLegend: false,
    })
    const passed = d.grades.reduce((s, g) => s + g.passed, 0)
    const failed = d.grades.reduce((s, g) => s + g.failed, 0)
    const inc = d.grades.reduce((s, g) => s + g.incomplete, 0)
    const labels = [h.passed, h.failed, ...(inc ? [h.incomplete] : [])]
    const values = [passed, failed, ...(inc ? [inc] : [])]
    s2.addChart(p.charts.DOUGHNUT, [{ name: h.passRate, labels, values }], {
      x: 8.6, y: 1.5, w: 4.5, h: 5, chartColors: [GREEN, RED, GREY], showLegend: true, legendPos: 'b', legendFontFace: FONT,
      showPercent: false, showValue: true, dataLabelColor: 'FFFFFF', holeSize: 55,
    })

    // Table by grade, 7 rows per slide
    const rows = d.grades.map((g) => [c(gradeLabel(g.grade, lang), { bold: true }), c(g.assessed), c(g.avg), c(g.passed), c(g.failed), c(g.passRate), c(g.top ? `${g.top.name} (${g.top.avg}%)` : '—')])
    for (let i = 0; i < rows.length; i += 7) {
      const s = base(`${h.byGrade}${rows.length > 7 ? ` (${i / 7 + 1})` : ''}`)
      s.addTable([[h.grade, h.assessed, h.avg, h.passed, h.failed, h.passRate, h.top].map(head), ...rows.slice(i, i + 7)],
        { x: 0.5, y: 1.3, w: 12.3, colW: [2.2, 1.2, 1.3, 1.2, 1.6, 1.4, 3.4], border: { type: 'solid', color: 'D5DAE3', pt: 1 }, rowH: 0.6 })
    }

    // Subject averages, one slide per grade
    for (const g of d.grades) {
      const s = base(`${gradeLabel(g.grade, lang)} — ${h.subjects}`)
      s.addChart(p.charts.BAR, [{ name: h.avg, labels: g.subjects.map((x) => (lang === 'en' && x.name_en ? x.name_en : x.name_am)), values: g.subjects.map((x) => x.avg) }], {
        x: 0.5, y: 1.2, w: 12.3, h: 5.8, barDir: 'bar', chartColors: [GOLD], catAxisLabelFontFace: FONT, valAxisMaxVal: 100, valAxisMinVal: 0,
        showValue: true, dataLabelFontFace: FONT, showLegend: false,
      })
    }
  }

  await p.writeFile({ fileName: `report-${d.year}-${d.scope}.pptx` })
}
