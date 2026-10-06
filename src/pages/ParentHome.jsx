import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { gradeLabel } from '../lib/grades.js'
import { useI18n } from '../i18n.jsx'
import StudentHome from './StudentHome.jsx'
import TelegramConnect from '../components/TelegramConnect.jsx'

// A parent sees only the children linked to them: the same results screen as the student, read-only.
export default function ParentHome({ ctx }) {
  const { lang } = useI18n()
  const am = lang === 'am'
  const [kids, setKids] = useState(null)
  const [sel, setSel] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    ;(async () => {
      const links = await supabase.from('parent_students').select('student_id')
      if (links.error) return setErr(links.error.message)
      const ids = links.data.map((l) => l.student_id)
      if (!ids.length) return setKids([])
      const st = await supabase.from('students').select('id, full_name, code, grade, section').in('id', ids).order('full_name')
      if (st.error) return setErr(st.error.message)
      setKids(st.data); setSel(st.data[0]?.id ?? null)
    })()
  }, [])

  if (err) return <p className="err">{err}</p>
  if (!kids) return <p className="muted">…</p>
  if (!kids.length) {
    return <div className="panel"><p>{am ? 'ወደ መለያዎ የተገናኘ ልጅ እስካሁን የለም። የትምህርት ክፍል አባልን ያነጋግሩ።' : 'No child is linked to your account yet. Please ask a department member.'}</p></div>
  }
  return (
    <>
      <TelegramConnect ctx={ctx} />
      {kids.length > 1 && (
        <div className="row">
          <label>{am ? 'ልጅ' : 'Child'}
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              {kids.map((k) => <option key={k.id} value={k.id}>{k.full_name} · {gradeLabel(k.grade, lang)}</option>)}
            </select>
          </label>
        </div>
      )}
      <StudentHome key={sel} ctx={ctx} studentId={sel} />
    </>
  )
}
