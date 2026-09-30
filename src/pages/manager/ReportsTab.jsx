import { useEffect, useState } from 'react'
import { gradeLabel } from '../../lib/grades.js'
import { loadReportData } from '../../lib/reportData.js'
import { scopeName } from '../../lib/reportText.js'
import { exportSummaryXlsx } from '../../lib/studentImport.js'
import { useI18n } from '../../i18n.jsx'

// Admin-only. Period reports built from APPROVED marks, client-side (no server).
export default function ReportsTab({ ctx }) {
  const { t, lang } = useI18n()
  const [year, setYear] = useState(ctx.year)
  const [scope, setScope] = useState('year')
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    setD(null); setErr('')
    loadReportData({ year, scope, passMark: ctx.passMark, school: ctx.school }).then(setD).catch((e) => setErr(e.message))
  }, [year, scope])

  async function run(kind) {
    setBusy(kind); setErr('')
    try {
      if (kind === 'word') (await import('../../lib/reportWord.js')).makeWord(d, lang)
      if (kind === 'ppt') await (await import('../../lib/reportPpt.js')).makePpt(d, lang)
      if (kind === 'xlsx') await exportSummaryXlsx(d, (g) => gradeLabel(g, lang))
    } catch (e) { setErr(e.message) }
    setBusy('')
  }

  return (
    <>
      <div className="row no-print">
        <label>{t('year')}<input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: '6rem' }} /></label>
        <label>{t('term')}
          <select value={scope} onChange={(e) => setScope(e.target.value === 'year' ? 'year' : Number(e.target.value))}>
            <option value="year">{scopeName('year', lang)}</option><option value={1}>{scopeName(1, lang)}</option><option value={2}>{scopeName(2, lang)}</option>
          </select>
        </label>
        <button className="btn" disabled={!d?.grades.length || busy} onClick={() => run('word')}>Word</button>
        <button className="btn" disabled={!d?.grades.length || busy} onClick={() => run('ppt')}>PowerPoint</button>
        <button className="btn ghost" disabled={!d?.grades.length || busy} onClick={() => run('xlsx')}>Excel</button>
        <button className="btn ghost" disabled={!d?.grades.length} onClick={() => window.print()}>{t('print')}</button>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {!d && !err ? <p className="muted">{t('loading')}</p> : d && !d.grades.length ? <p>{t('noResults')}</p> : d && (
        <div className="panel scroll">
          <h2>{d.school} — {year} ዓ/ም · {scopeName(scope, lang)}</h2>
          <table>
            <thead><tr><th>{t('grade')}</th><th className="num">{t('students')}</th><th className="num">{t('average')} %</th><th className="num">{t('res_promoted')}</th><th className="num">&lt; {ctx.passMark}%</th><th className="num">{t('res_incomplete')}</th></tr></thead>
            <tbody>
              {d.grades.map((g) => (
                <tr key={g.grade}>
                  <td>{gradeLabel(g.grade, lang)}</td><td className="num">{g.assessed}</td><td className="num">{g.avg}</td>
                  <td className="num">{g.passed}</td><td className="num">{g.failed}</td><td className="num">{g.incomplete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
