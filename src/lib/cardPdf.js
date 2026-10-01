// Makes a real LANDSCAPE PDF (one page per .sheet) no matter what the phone's print dialog does.
// Each sheet is drawn at the exact size of the page, so it fills the whole page.
const PAPER = { a4: [297, 210], letter: [279.4, 215.9] } // landscape width x height, mm
const MARGIN = 6 // mm
const tick = () => new Promise((r) => setTimeout(r, 0))

export async function exportSheetsPdf(root, { paper = 'a4', filename = 'report-cards.pdf', onProgress } = {}) {
  const sheets = [...root.querySelectorAll('.sheet')]
  if (!sheets.length) throw new Error('Nothing to export')
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  const [pw, ph] = PAPER[paper] ?? PAPER.a4
  const cw = pw - 2 * MARGIN
  const ch = ph - 2 * MARGIN
  const px = 96 / 25.4
  const wpx = Math.round(cw * px)
  const hpx = Math.round(ch * px)

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pw, ph], compress: true })
  const stage = document.createElement('div')
  stage.style.cssText = `position:fixed;left:-100000px;top:0;width:${wpx}px;background:#fff;`
  document.body.appendChild(stage)
  try {
    for (let i = 0; i < sheets.length; i++) {
      stage.innerHTML = ''
      const clone = sheets[i].cloneNode(true)
      clone.classList.add('pdf-sheet')
      clone.style.width = wpx + 'px'
      clone.style.height = hpx + 'px'
      stage.appendChild(clone)
      await document.fonts.ready
      const canvas = await html2canvas(clone, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
      if (i > 0) pdf.addPage([pw, ph], 'landscape')
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', MARGIN, MARGIN, cw, ch)
      canvas.width = canvas.height = 0 // free memory on phones
      onProgress?.(i + 1, sheets.length)
      await tick()
    }
    pdf.save(filename)
  } finally {
    stage.remove()
  }
}
