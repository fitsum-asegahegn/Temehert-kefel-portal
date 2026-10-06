import { useEffect, useState } from 'react'
import { supabase, manage } from '../../lib/supabase.js'
import { GRADES, gradeLabel } from '../../lib/grades.js'
import { useI18n } from '../../i18n.jsx'

export default function SubjectsTab({ ctx }) {
  const { t, lang } = useI18n()
  const [subjects, setSubjects] = useState([])
  const [teachers, setTeachers] = useState([])
  const [assign, setAssign] = useState([])
  const [msg, setMsg] = useState({ text: '', bad: false })
  const [sf, setSf] = useState({ name_am: '', name_en: '', max_score: 100, term: 1 })
  const [tf, setTf] = useState({ full_name: '', email: '' })
  const [af, setAf] = useState({ teacher_id: '', subject_id: '', grade: 5 })
  const [cred, setCred] = useState(null)

  async function load() {
    const [s, r, a] = await Promise.all([
      supabase.from('subjects').select('*').order('sort').order('id'),
      supabase.from('user_roles').select('user_id').eq('role', 'teacher'),
      supabase.from('teacher_assignments').select('id, teacher_id, subject_id, grade').order('grade'),
    ])
    const err = s.error || r.error || a.error
    if (err) return setMsg({ text: err.message, bad: true })
    const ids = r.data.map((x) => x.user_id)
    const p = ids.length ? await supabase.from('profiles').select('id, full_name, email').in('id', ids) : { data: [] }
    setSubjects(s.data); setAssign(a.data); setTeachers(p.data || [])
  }
  useEffect(() => { load() }, [])

  const fail = (e) => setMsg({ text: e.message, bad: true })
  const subjName = (id) => subjects.find((s) => s.id === id)?.name_am ?? ''
  const teacherName = (id) => teachers.find((x) => x.id === id)?.full_name ?? ''

  async function addSubject(e) {
    e.preventDefault()
    const { error } = await supabase.from('subjects').insert({ name_am: sf.name_am.trim(), name_en: sf.name_en.trim() || null, max_score: Number(sf.max_score), term: Number(sf.term), sort: subjects.length })
    if (error) return fail(error)
    setSf({ name_am: '', name_en: '', max_score: 100, term: sf.term }); load()
  }
  async function setTerm(id, v) {
    const { error } = await supabase.from('subjects').update({ term: Number(v) }).eq('id', id)
    if (error) return fail(error)
    load()
  }
  async function addTeacher(e) {
    e.preventDefault()
    try {
      const r = await manage('create_staff', { ...tf, role: 'teacher' })
      setCred(r.user); setTf({ full_name: '', email: '' }); load()
    } catch (e2) { fail(e2) }
  }
  async function addAssign(e) {
    e.preventDefault()
    const { error } = await supabase.from('teacher_assignments').insert({ teacher_id: af.teacher_id, subject_id: Number(af.subject_id), grade: Number(af.grade) })
    if (error) return fail(error)
    load()
  }
  async function delAssign(id) {
    const { error } = await supabase.from('teacher_assignments').delete().eq('id', id)
    if (error) return fail(error)
    load()
  }

  return (
    <>
      {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="alert">{msg.text}</p>}

      <form className="panel" onSubmit={addSubject}>
        <h2>{t('subject')}</h2>
        <div className="row">
          <label>አማርኛ<input value={sf.name_am} onChange={(e) => setSf({ ...sf, name_am: e.target.value })} required /></label>
          <label>English<input value={sf.name_en} onChange={(e) => setSf({ ...sf, name_en: e.target.value })} /></label>
          <label>{t('outOf')}<input type="number" min="1" value={sf.max_score} onChange={(e) => setSf({ ...sf, max_score: e.target.value })} style={{ width: '6rem' }} /></label>
          <label>{t('term')}
            <select value={sf.term} onChange={(e) => setSf({ ...sf, term: e.target.value })}>
              <option value={1}>{t('term1')}</option><option value={2}>{t('term2')}</option>
            </select>
          </label>
          <button className="btn">{t('save')}</button>
        </div>
        <p className="muted">{lang === 'am' ? 'እያንዳንዱ ትምህርት የሚሰጠው በአንድ መንፈቀ ዓመት ብቻ ነው። በሁለተኛው መንፈቀ ዓመት አዲስ ትምህርት ይጨምሩ።' : 'Each course is taught in one semester only. In the second semester, add the new courses.'}</p>
        <div className="scroll">
          <table>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td>{s.name_am}{s.name_en ? <span className="muted"> · {s.name_en}</span> : null}</td>
                  <td className="num">{s.max_score}</td>
                  <td>
                    <select value={s.term ?? ''} aria-label={s.name_am} onChange={(e) => setTerm(s.id, e.target.value)}>
                      {!s.term && <option value="">—</option>}
                      <option value={1}>{t('term1')}</option><option value={2}>{t('term2')}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </form>

      <form className="panel" onSubmit={addTeacher}>
        <h2>{t('teacher')}</h2>
        <div className="row">
          <label>{lang === 'am' ? 'ሙሉ ስም' : 'Full name'}<input value={tf.full_name} onChange={(e) => setTf({ ...tf, full_name: e.target.value })} required /></label>
          <label>Email<input type="email" value={tf.email} onChange={(e) => setTf({ ...tf, email: e.target.value })} required /></label>
          <button className="btn">{t('save')}</button>
        </div>
        {cred && (
          <p className="ok">
            {cred.full_name}: {cred.email} / <strong style={{ fontFamily: 'monospace' }}>{cred.password}</strong>
            <span className="muted"> — {lang === 'am' ? 'አንዴ ብቻ ይታያል' : 'shown once'}</span>
          </p>
        )}
      </form>

      <div className="panel">
        <h2>{lang === 'am' ? 'መምህር ↔ ትምህርት ↔ ክፍል' : 'Teacher ↔ subject ↔ grade'}</h2>
        <form className="row" onSubmit={addAssign}>
          <label>{t('teacher')}
            <select value={af.teacher_id} onChange={(e) => setAf({ ...af, teacher_id: e.target.value })} required>
              <option value="" />{teachers.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
            </select>
          </label>
          <label>{t('subject')}
            <select value={af.subject_id} onChange={(e) => setAf({ ...af, subject_id: e.target.value })} required>
              <option value="" />{subjects.map((x) => <option key={x.id} value={x.id}>{x.name_am}{x.term ? ` · ${t('term' + x.term)}` : ''}</option>)}
            </select>
          </label>
          <label>{t('grade')}
            <select value={af.grade} onChange={(e) => setAf({ ...af, grade: e.target.value })}>
              {GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g, lang)}</option>)}
            </select>
          </label>
          <button className="btn">{t('save')}</button>
        </form>
        <div className="scroll">
          <table>
            <tbody>
              {assign.map((a) => (
                <tr key={a.id}>
                  <td>{teacherName(a.teacher_id)}</td><td>{subjName(a.subject_id)}</td><td>{gradeLabel(a.grade, lang)}</td>
                  <td><button className="btn ghost small" onClick={() => delAssign(a.id)}>{t('delete')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
