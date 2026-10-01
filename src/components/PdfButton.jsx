import { useState } from 'react'
import { exportSheetsPdf } from '../lib/cardPdf.js'
import { useI18n } from '../i18n.jsx'

// remembers the fold style on this phone
export function useCardLayout() {
  const [layout, setLayout] = useState(() => localStorage.getItem('cardLayout2') || 'side')
  return [layout, (v) => { localStorage.setItem('cardLayout2', v); setLayout(v) }]
}

// Downloads the cards inside rootRef as a PDF (top-fold by default).
export default function PdfButton({ rootRef, name = 'report-cards', disabled, layout, setLayout }) {
  const { lang } = useI18n()
  const [paper, setPaper] = useState(() => localStorage.getItem('paper') || 'a4')
  const [flipBack, setFlipBack] = useState(() => localStorage.getItem('flipBack') === '1')
  const [prog, setProg] = useState(null)
  const [err, setErr] = useState('')

  async function run() {
    setErr(''); setProg([0, 1])
    try {
      await exportSheetsPdf(rootRef.current, { paper, layout, flipBack, filename: `${name}.pdf`, onProgress: (i, n) => setProg([i, n]) })
    } catch (e) { setErr(e.message) }
    setProg(null)
  }

  return (
    <>
      <select value={layout} aria-label={lang === 'am' ? 'የመታጠፊያ አይነት' : 'Fold style'} onChange={(e) => setLayout(e.target.value)}>
        <option value="side">{lang === 'am' ? 'ከጎን መታጠፍ — ሲታጠፍ ቁመት (portrait)' : 'Book fold — closed card portrait'}</option>
        <option value="top">{lang === 'am' ? 'ከላይ-ወደ-ታች መታጠፍ — ሲታጠፍ ወርድ (landscape)' : 'Top fold — closed card landscape'}</option>
      </select>
      <select value={paper} aria-label={lang === 'am' ? 'የወረቀት መጠን' : 'Paper size'} onChange={(e) => { setPaper(e.target.value); localStorage.setItem('paper', e.target.value) }}>
        <option value="a4">A4</option><option value="letter">Letter</option>
      </select>
      <button className="btn" disabled={disabled || !!prog} onClick={run}>
        {prog ? `${prog[0]} / ${prog[1]}…` : (lang === 'am' ? 'PDF አውርድ ⬇' : 'Download PDF ⬇')}
      </button>
      <label style={{ flexDirection: 'row', alignItems: 'center', gap: '.4rem', display: 'flex' }}>
        <input type="checkbox" checked={flipBack} onChange={(e) => { setFlipBack(e.target.checked); localStorage.setItem('flipBack', e.target.checked ? '1' : '0') }} />
        <span>{lang === 'am' ? 'የውስጥ ገጹን ገልብጥ (አታሚው ጀርባውን ተገልብጦ ካተመ)' : 'Inside page upside down (if your printer prints the back rotated)'}</span>
      </label>
      {err && <span className="err" role="alert">{err}</span>}
    </>
  )
}
