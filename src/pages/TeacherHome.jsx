import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { gradeLabel } from '../lib/grades.js'
import { useI18n } from '../i18n.jsx'

export default function TeacherHome({ ctx }) {
  const { t, lang } = useI18n()
  const [asg, setAsg] = useState(null)
  const [sel, setSel] = useState(null)     // { subject, grade }
  const [term, setTerm] = useState(1)
  const [students, setStudents] = useState([])
  const [rows, setRows] = useState({})     // student_id -> saved mark row
  const [scores, setScores] = useState({}) // student_id -> string being typed
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ text: '', bad: false })

  useEffect(() => {
    supabase.from('teacher_assignments').select('grade, subjects(id, name_am, name_en, max_score)')
      .eq('teacher_id', ctx.uid).order('grade').then(({ data, error }) => {
        if (error) return setMsg({ text: error.message, bad: true })
        const list = data.map((a) => ({ grade: a.grade, subject: a.subjects }))
        setAsg(list)
        if (list.length) setSel(list[0])
      })
  }, [])

  async function load() {
    if (!sel) return
    setMsg({ text: '', bad: false })
    const [st, mk] = await Promise.all([
      supabase.from('students').select('id, full_name, code, section').eq('grade', sel.grade).eq('active', true).order('section').order('full_name'),
      supabase.from('marks').select('*').eq('subject_id', sel.subject.id).eq('grade', sel.grade).eq('year', ctx.year).eq('term', term),
    ])
    if (st.error || mk.error) return setMsg({ text: (st.error || mk.error).message, bad: true })
    const byStudent = Object.fromEntries(mk.data.map((m) => [m.student_id, m]))
    setStudents(st.data)
    setRows(byStudent)
    setScores(Object.fromEntries(mk.data.map((m) => [m.student_id, String(m.score)])))
  }
  useEffect(() => { load() }, [sel, term])

  async function save(status) {
    const max = Number(sel.subject.max_score)
    const out = []
    for (const s of students) {
      const raw = (scores[s.id] ?? '').trim()
      if (raw === '' || rows[s.id]?.status === 'approved') continue
      const v = Number(raw)
      if (Number.isNaN(v) || v < 0 || v > max) return setMsg({ text: `${s.full_name}: 0 – ${max}`, bad: true })
      out.push({ student_id: s.id, subject_id: sel.subject.id, year: ctx.year, term, score: v, status, entered_by: ctx.uid })
    }
    if (!out.length) return setMsg({ text: '—', bad: true })
    setBusy(true)
    const { error } = await supabase.from('marks').upsert(out, { onConflict: 'student_id,subject_id,year,term' })
    setBusy(false)
    if (error) return setMsg({ text: error.message, bad: true })
    setMsg({ text: status === 'submitted' ? t('st_submitted') + ' ✓' : t('st_draft') + ' ✓', bad: false })
    load()
  }

  if (asg === null) return <p className="muted">{t('loading')}</p>
  if (!asg.length) return <div className="panel"><p>{t('noAssignments')}</p></div>

  const name = (s) => (lang === 'en' && s.name_en ? s.name_en : s.name_am)
  const filled = students.filter((s) => (scores[s.id] ?? '') !== '').length

  return (
    <>
      <div className="row">
        <label>{t('subject')}
          <select value={asg.indexOf(sel)} onChange={(e) => setSel(asg[Number(e.target.value)])}>
            {asg.map((a, i) => <option key={i} value={i}>{name(a.subject)} · {gradeLabel(a.grade, lang)}</option>)}
          </select>
        </label>
        <label>{t('term')}
          <select value={term} onChange={(e) => setTerm(Number(e.target.value))}>
            <option value={1}>{t('term1')}</option><option value={2}>{t('term2')}</option>
          </select>
        </label>
        <div className="muted">{t('year')} {ctx.year} · {t('outOf')} {sel.subject.max_score} · {filled}/{students.length}</div>
      </div>

      <div className="panel scroll">
        <table>
          <thead><tr><th>{t('student')}</th><th>{t('section')}</th><th className="num">{t('score')}</th><th>{t('status')}</th></tr></thead>
          <tbody>
            {students.map((s) => {
              const st = rows[s.id]?.status
              return (
                <tr key={s.id}>
                  <td>{s.full_name}<div className="muted">{s.code}</div></td>
                  <td>{s.section}</td>
                  <td className="num">
                    <input className="mark-input" inputMode="decimal" value={scores[s.id] ?? ''} disabled={st === 'approved'}
                      aria-label={`${s.full_name} ${t('score')}`}
                      onChange={(e) => setScores({ ...scores, [s.id]: e.target.value })} />
                  </td>
                  <td>{st ? <span className={'pill ' + st}>{t('st_' + st)}</span> : <span className="muted">{t('st_missing')}</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
      <div className="row">
        <button className="btn ghost" disabled={busy} onClick={() => save('draft')}>{t('save')}</button>
        <button className="btn" disabled={busy} onClick={() => save('submitted')}>{lang === 'am' ? 'ለግምገማ አስገባ' : 'Submit for review'}</button>
      </div>
    </>
  )
}
