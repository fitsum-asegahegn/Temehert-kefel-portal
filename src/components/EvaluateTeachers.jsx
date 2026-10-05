import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { QUESTIONS } from '../lib/evaluation.js'
import { useI18n } from '../i18n.jsx'

// Student side: shown only while a member has the evaluation OPEN. Answers are anonymous.
export default function EvaluateTeachers() {
  const { lang } = useI18n()
  const am = lang === 'am'
  const [list, setList] = useState(null)
  const [openKey, setOpenKey] = useState(null)
  const [answers, setAnswers] = useState({})
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ text: '', bad: false })

  const load = () => supabase.rpc('my_evaluation_list').then(({ data, error }) => setList(error ? [] : data || []))
  useEffect(() => { load() }, [])
  if (!list?.length) return null

  const key = (r) => `${r.r_teacher_id}|${r.r_subject_id}`
  const pending = list.filter((r) => !r.r_done).length
  const complete = QUESTIONS.every((q) => answers[q.id])

  async function submit(r) {
    setBusy(true); setMsg({ text: '', bad: false })
    const { error } = await supabase.rpc('submit_evaluation', { p_teacher: r.r_teacher_id, p_subject: r.r_subject_id, p_answers: answers, p_comment: comment })
    setBusy(false)
    if (error) return setMsg({ text: error.message, bad: true })
    setOpenKey(null); setAnswers({}); setComment('')
    setMsg({ text: am ? 'አመሰግናለሁ — ግምገማዎ ተልኳል ✓' : 'Thank you — your evaluation was sent ✓', bad: false })
    load()
  }

  return (
    <div className="panel">
      <h2>{am ? 'መምህራንን ይገምግሙ' : 'Evaluate your teachers'}{pending > 0 && <span className="pill submitted" style={{ marginLeft: '.5rem' }}>{pending}</span>}</h2>
      <p className="muted">
        {am ? 'ስምዎ አይታወቅም — መምህሩም ሆነ አባላት ማን እንደሰጠ ማወቅ አይችሉም። ሐቀኛ ግምገማ መምህራንን ይረዳል።'
          : 'Your name is never shown — neither the teacher nor the members can tell who answered. Honest answers help teachers improve.'}
      </p>
      {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
      {list.map((r) => (
        <div key={key(r)} style={{ borderTop: '1px solid var(--line)', padding: '.6rem 0' }}>
          <div className="row" style={{ marginBottom: 0 }}>
            <div style={{ flex: 1 }}><strong>{lang === 'en' && r.r_subject_en ? r.r_subject_en : r.r_subject_am}</strong><div className="muted">{r.r_teacher_name}</div></div>
            {r.r_done
              ? <span className="ok">✓ {am ? 'ተገምግሟል' : 'Done'}</span>
              : <button className="btn small" onClick={() => { setOpenKey(openKey === key(r) ? null : key(r)); setAnswers({}); setComment('') }}>{openKey === key(r) ? (am ? 'ዝጋ' : 'Close') : (am ? 'ገምግም' : 'Evaluate')}</button>}
          </div>
          {openKey === key(r) && !r.r_done && (
            <div style={{ marginTop: '.75rem' }}>
              <p className="muted">{am ? '1 = በጣም ዝቅተኛ ... 5 = እጅግ ጥሩ' : '1 = poor ... 5 = excellent'}</p>
              {QUESTIONS.map((q) => (
                <div key={q.id} style={{ marginBottom: '.7rem' }}>
                  <div>{am ? q.am : q.en}</div>
                  <div className="rate" role="radiogroup" aria-label={am ? q.am : q.en}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button type="button" key={n} role="radio" aria-checked={answers[q.id] === n} className={answers[q.id] === n ? 'on' : ''} onClick={() => setAnswers({ ...answers, [q.id]: n })}>{n}</button>
                    ))}
                  </div>
                </div>
              ))}
              <label style={{ display: 'block' }}>
                <span className="muted">{am ? 'አስተያየት (አማራጭ)' : 'Comment (optional)'}</span>
                <textarea maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} style={{ minHeight: '4.5rem' }} />
              </label>
              <button className="btn" disabled={!complete || busy} onClick={() => submit(r)}>{busy ? '…' : (am ? 'ላክ' : 'Send')}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
