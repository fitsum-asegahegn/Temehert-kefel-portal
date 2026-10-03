import { useEffect, useMemo, useState } from 'react'
import { supabase, fetchAll } from '../../lib/supabase.js'
import { GRADES, gradeLabel } from '../../lib/grades.js'
import { buildRoster } from '../../lib/roster.js'
import { scopeName } from '../../lib/reportText.js'
import { downloadSheet, safeName } from '../../lib/rosterExcel.js'
import { useI18n } from '../../i18n.jsx'

// Roster of one grade: every student, a column per course, total, average and rank. View it or download it as Excel.
export default function RosterTab({ ctx }) {
  const { t, lang } = useI18n()
  const [year, setYear] = useState(ctx.year)
  const [grade, setGrade] = useState(5)
  const [scope, setScope] = useState('year')
  const [unapproved, setUnapproved] = useState(false)
  const [sort, setSort] = useState('name')
  const [raw, setRaw] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let off = false
    setRaw(null); setErr('')
    ;(async () => {
      try {
        const [marks, subjects, students, assigns] = await Promise.all([
          fetchAll(() => {
            let b = supabase.from('marks').select('student_id, subject_id, term, score, section').eq('grade', grade).eq('year', year)
            if (!unapproved) b = b.eq('status', 'approved')
            if (scope !== 'year') b = b.eq('term', scope)
            return b
          }),
          supabase.from('subjects').select('*').order('sort').order('id').then((r) => { if (r.error) throw r.error; return r.data }),
          fetchAll(() => supabase.from('students').select('id, full_name, grade, section, active').order('full_name')),
          supabase.from('teacher_assignments').select('subject_id').eq('grade', grade).then((r) => { if (r.error) throw r.error; return r.data }),
        ])
        if (!off) setRaw({ marks, subjects, students, assigned: assigns.map((a) => a.subject_id) })
      } catch (e) { if (!off) setErr(e.message) }
    })()
    return () => { off = true }
  }, [year, grade, scope, unapproved])

  const roster = useMemo(() => raw && buildRoster({
    ...raw, scope, grade, sort, passMark: ctx.passMark,
    includeCurrent: year === ctx.year, // for the current year also list students who have no marks yet
  }), [raw, scope, grade, sort, year])

  const multi = roster?.sections.length > 1
  const courseName = (c) => (lang === 'en' && c.name_en ? c.name_en : c.name_am)
  const header = roster && [lang === 'am' ? 'የተማሪ ስም' : 'Student name', ...(multi ? [t('section')] : []), ...roster.columns.map(courseName), t('total'), `${t('average')} %`, t('rank')]
  const body = roster && roster.rows.map((r) => [r.name, ...(multi ? [r.section] : []), ...r.cells, r.total, r.average, r.rank])

  const download = () => downloadSheet({
    sheet: `${gradeLabel(grade, lang)} ${year}`, header, rows: body,
    filename: `roster-grade${grade}-${year}-${scope === 'year' ? 'year' : 'S' + scope}.xlsx`,
  }).catch((e) => setErr(e.message))

  return (
    <>
      <div className="row">
        <label>{t('year')}<input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: '6rem' }} /></label>
        <label>{t('grade')}
          <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>{GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g, lang)}</option>)}</select>
        </label>
        <label>{t('term')}
          <select value={scope} onChange={(e) => setScope(e.target.value === 'year' ? 'year' : Number(e.target.value))}>
            <option value="year">{scopeName('year', lang)}</option><option value={1}>{scopeName(1, lang)}</option><option value={2}>{scopeName(2, lang)}</option>
          </select>
        </label>
        <label>{lang === 'am' ? 'ቅደም ተከተል' : 'Order'}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">{lang === 'am' ? 'በስም' : 'By name'}</option><option value="rank">{t('rank')}</option>
          </select>
        </label>
        <button className="btn" disabled={!roster?.rows.length} onClick={download}>Excel ⬇</button>
      </div>
      <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.75rem' }}>
        <input type="checkbox" checked={unapproved} onChange={(e) => setUnapproved(e.target.checked)} />
        <span className="muted">{lang === 'am' ? 'ገና ያልጸደቁ ውጤቶችንም አካትት' : 'Include marks not approved yet'}</span>
      </label>

      {err && <p className="err" role="alert">{err}</p>}
      {!roster && !err && <p className="muted">{t('loading')}</p>}
      {roster && !roster.rows.length && <p>{t('noResults')}</p>}
      {roster && roster.rows.length > 0 && (
        <div className="panel scroll">
          <table>
            <thead><tr>{header.map((h, i) => <th key={i} className={i === 0 || (multi && i === 1) ? '' : 'num'}>{h}</th>)}</tr></thead>
            <tbody>
              {body.map((r, i) => (
                <tr key={roster.rows[i].id}>
                  {r.map((c, j) => <td key={j} className={j === 0 || (multi && j === 1) ? '' : 'num'}>{c ?? ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            {lang === 'am'
              ? `እያንዳንዱ ትምህርት ከ100። አማካይ = የተማሪው ትምህርቶች አማካይ፤ ደረጃ በክፍለ (section) ውስጥ። ${unapproved ? 'ያልጸደቁ ውጤቶች ተካትተዋል።' : 'የጸደቁ ውጤቶች ብቻ።'}`
              : `Each course is out of 100. Average = mean of the student's courses; rank is within the section. ${unapproved ? 'Includes marks not yet approved.' : 'Approved marks only.'}`}
          </p>
        </div>
      )}
    </>
  )
}
