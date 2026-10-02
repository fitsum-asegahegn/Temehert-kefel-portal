import { useEffect, useState } from 'react'
import { supabase, fetchAll } from '../../lib/supabase.js'
import { GRADES, gradeLabel } from '../../lib/grades.js'
import { useI18n } from '../../i18n.jsx'

export default function ReviewTab({ ctx }) {
  const { t, lang } = useI18n()
  const [year, setYear] = useState(ctx.year)
  const [term, setTerm] = useState(1)
  const [grade, setGrade] = useState(5)
  const [subjects, setSubjects] = useState([])
  const [students, setStudents] = useState([])
  const [marks, setMarks] = useState([])
  const [msg, setMsg] = useState({ text: '', bad: false })

  async function load() {
    try {
      const [sub, st, mk] = await Promise.all([
        supabase.from('subjects').select('*').order('sort').order('id'),
        supabase.from('students').select('id, full_name, code, section').eq('grade', grade).eq('active', true).order('section').order('full_name'),
        fetchAll(() => supabase.from('marks').select('*').eq('grade', grade).eq('year', year).eq('term', term)),
      ])
      if (sub.error || st.error) throw sub.error || st.error
      setSubjects(sub.data); setStudents(st.data); setMarks(mk)
    } catch (e) { setMsg({ text: e.message, bad: true }) }
  }
  useEffect(() => { load() }, [year, term, grade])

  async function setStatus(subjectId, from, to) {
    let q = supabase.from('marks').update({ status: to }).eq('grade', grade).eq('year', year).eq('term', term).eq('status', from)
    if (subjectId) q = q.eq('subject_id', subjectId)
    const { error } = await q
    if (error) return setMsg({ text: error.message, bad: true })
    setMsg({ text: '✓', bad: false }); load()
  }

  const stName = Object.fromEntries(students.map((s) => [s.id, s.full_name]))

  return (
    <>
      <div className="row">
        <label>{t('year')}<input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: '6rem' }} /></label>
        <label>{t('term')}
          <select value={term} onChange={(e) => setTerm(Number(e.target.value))}><option value={1}>{t('term1')}</option><option value={2}>{t('term2')}</option></select>
        </label>
        <label>{t('grade')}
          <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>{GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g, lang)}</option>)}</select>
        </label>
        <button className="btn" onClick={() => setStatus(null, 'submitted', 'approved')}>{lang === 'am' ? 'የቀረቡትን ሁሉ አጽድቅ' : 'Approve all submitted'}</button>
      </div>
      {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}

      {subjects.filter((s) => !s.term || s.term === term).map((s) => {
        const list = marks.filter((m) => m.subject_id === s.id)
        const n = (st) => list.filter((m) => m.status === st).length
        return (
          <details className="panel" key={s.id}>
            <summary>
              <strong>{s.name_am}</strong>{' '}
              <span className="muted">
                {list.length}/{students.length} · {t('st_draft')} {n('draft')} · {t('st_submitted')} {n('submitted')} · {t('st_approved')} {n('approved')}
              </span>
            </summary>
            <div className="row" style={{ marginTop: '.75rem' }}>
              <button className="btn small" disabled={!n('submitted')} onClick={() => setStatus(s.id, 'submitted', 'approved')}>{lang === 'am' ? 'አጽድቅ' : 'Approve'}</button>
              <button className="btn ghost small" disabled={!n('approved')} onClick={() => setStatus(s.id, 'approved', 'draft')}>{lang === 'am' ? 'እንደገና ክፈት' : 'Reopen'}</button>
            </div>
            <table>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id}>
                    <td>{stName[m.student_id] ?? m.student_id}</td>
                    <td className="num">{m.score} / {s.max_score}</td>
                    <td><span className={'pill ' + m.status}>{t('st_' + m.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )
      })}

    </>
  )
}
