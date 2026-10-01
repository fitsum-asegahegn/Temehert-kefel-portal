import { useState } from 'react'
import { exportSheetsPdf } from '../lib/cardPdf.js'
import { useI18n } from '../i18n.jsx'

// Downloads the cards inside rootRef as a landscape PDF.
export default function PdfButton({ rootRef, name = 'report-cards', disabled }) {
  const { lang } = useI18n()
  const [paper, setPaper] = useState(() => localStorage.getItem('paper') || 'a4')
  const [prog, setProg] = useState(null)
  const [err, setErr] = useState('')

  async function run() {
    setErr(''); setProg([0, 1])
    try {
      await exportSheetsPdf(rootRef.current, { paper, filename: `${name}.pdf`, onProgress: (i, n) => setProg([i, n]) })
    } catch (e) { setErr(e.message) }
    setProg(null)
  }

  return (
    <>
      <select value={paper} aria-label={lang === 'am' ? 'የወረቀት መጠን' : 'Paper size'} onChange={(e) => { setPaper(e.target.value); localStorage.setItem('paper', e.target.value) }}>
        <option value="a4">A4</option><option value="letter">Letter</option>
      </select>
      <button className="btn" disabled={disabled || !!prog} onClick={run}>
        {prog ? `${prog[0]} / ${prog[1]}…` : (lang === 'am' ? 'PDF አውርድ ⬇' : 'Download PDF ⬇')}
      </button>
      {err && <span className="err" role="alert">{err}</span>}
    </>
  )
}
