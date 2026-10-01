// Makes a real PDF no matter what the phone's print dialog does. One PDF page per card side.
//   layout 'side' : BOOK fold (default). Landscape sheet, two portrait panels side by side, folded at the vertical
//                   middle -> the closed card is PORTRAIT, like the original template.
//   layout 'top'  : TOP fold. Portrait sheet, two wide panels stacked, folded at the horizontal middle -> the closed
//                   card is LANDSCAPE. The outside page's top panel is printed upside down so it reads right after folding.
//   flipBack      : also turns every inside page upside down (for printers that print the back of the sheet rotated).
const PAPER = { a4: [297, 210], letter: [279.4, 215.9] } // landscape width x height, mm
const MARGIN = 6 // mm
const GAP = 30 // px between the two panels in the top-fold layout
const tick = () => new Promise((r) => setTimeout(r, 0))

// Turn the TOP panel of a captured page upside down, in place (rotated about its own centre).
function flipTopPanel(canvas, panelHpx, cssWidth) {
  const f = canvas.width / cssWidth
  const h = Math.round(panelHpx * f)
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const g = out.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, out.width, out.height)
  g.drawImage(canvas, 0, h, canvas.width, canvas.height - h, 0, h, canvas.width, canvas.height - h)
  g.save()
  g.translate(canvas.width, h)
  g.rotate(Math.PI)
  g.drawImage(canvas, 0, 0, canvas.width, h, 0, 0, canvas.width, h)
  g.restore()
  canvas.width = canvas.height = 0
  return out
}

// Turn a whole captured page upside down (for printers that print the back side of the sheet rotated).
function rotatePage(canvas) {
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const g = out.getContext('2d')
  g.translate(canvas.width, canvas.height)
  g.rotate(Math.PI)
  g.drawImage(canvas, 0, 0)
  canvas.width = canvas.height = 0
  return out
}

export async function exportSheetsPdf(root, { paper = 'a4', layout = 'side', flipBack = false, filename = 'report-cards.pdf', onProgress } = {}) {
  const sheets = [...root.querySelectorAll('.sheet')]
  if (!sheets.length) throw new Error('Nothing to export')
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  const [long, short] = PAPER[paper] ?? PAPER.a4
  const top = layout === 'top'
  const pw = top ? short : long // page width, mm
  const ph = top ? long : short // page height, mm
  const orient = top ? 'portrait' : 'landscape'
  const px = 96 / 25.4
  const cw = pw - 2 * MARGIN
  const ch = ph - 2 * MARGIN
  const wpx = Math.round(cw * px)
  const hpx = Math.round(ch * px)
  const panelH = (hpx - GAP) / 2

  const pdf = new jsPDF({ orientation: orient, unit: 'mm', format: [pw, ph], compress: true })
  const stage = document.createElement('div')
  stage.style.cssText = `position:fixed;left:-100000px;top:0;width:${wpx}px;background:#fff;`
  document.body.appendChild(stage)
  try {
    for (let i = 0; i < sheets.length; i++) {
      stage.innerHTML = ''
      let node
      if (top) {
        node = document.createElement('div')
        node.className = 'pdf-top'
        node.style.cssText = `width:${wpx}px;height:${hpx}px;`
        for (const p of sheets[i].querySelectorAll(':scope > .bk-panel')) node.appendChild(p.cloneNode(true))
      } else {
        node = sheets[i].cloneNode(true)
        node.classList.add('pdf-sheet')
        node.style.width = wpx + 'px'
        node.style.height = hpx + 'px'
      }
      stage.appendChild(node)
      await document.fonts.ready
      let canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
      if (top && sheets[i].dataset.face === 'outside') canvas = flipTopPanel(canvas, panelH, wpx)
      if (flipBack && sheets[i].dataset.face === 'inside') canvas = rotatePage(canvas)
      if (i > 0) pdf.addPage([pw, ph], orient)
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
