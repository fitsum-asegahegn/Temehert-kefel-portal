import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { gradeLabel } from '../lib/grades.js'
import { QUESTIONS, MIN_ANSWERS } from '../lib/evaluation.js'
import { useI18n } from '../i18n.jsx'

// Results of the anonymous evaluation. rows = evaluation_summary(); managers can also open the (shuffled) written comments.
export default function EvalSummary({ rows, year, term, isManager }) {
  const { lang } = useI18n()
  const am = lang === 'am'
  const [comments, setComments] = useState({}) // "teacher|subject" -> [text]

  async function loadComments(r) {
    const k = `${r.r_teacher_id}|${r.r_subject_id}`
    if (!isManager || r.r_responses < MIN_ANSWERS || comments[k]) return
    const { data } = await supabase.rpc('evaluation_comments', { p_year: year, p_term: term, p_teacher: r.r_teacher_id, p_subject: r.r_subject_id })
    setComments((c) => ({ ...c, [k]: (data || []).map((x) => x.r_comment) }))
  }

  if (!rows.length) return <p className="muted">{am ? 'እስካሁን ምንም ግምገማ የለም።' : 'No evaluations yet.'}</p>
  return rows.map((r) => {
    const enough = r.r_responses >= MIN_ANSWERS
    const k = `${r.r_teacher_id}|${r.r_subject_id}`
    return (
      <details className="panel" key={k + r.r_grade} onToggle={(e) => e.target.open && loadComments(r)}>
        <summary>
          <strong>{isManager ? `${r.r_teacher_name} · ` : ''}{r.r_subject_am}</strong>{' '}
          <span className="muted">{gradeLabel(r.r_grade, lang)} · {r.r_responses} {am ? 'መልሶች' : 'answers'}</span>{' '}
          {enough ? <strong className="ok">{r.r_overall} / 5</strong> : <span className="err">{am ? `በቂ አይደለም (${r.r_responses}/${MIN_ANSWERS})` : `not enough yet (${r.r_responses}/${MIN_ANSWERS})`}</span>}
        </summary>
        {enough ? (
          <div style={{ marginTop: '.75rem' }}>
            {QUESTIONS.map((q) => (
              <div key={q.id} className="eval-row">
                <div>{am ? q.am : q.en}</div>
                <div className="bar"><span style={{ width: `${((r.r_per_question?.[q.id] ?? 0) / 5) * 100}%` }} /></div>
                <strong>{r.r_per_question?.[q.id]}</strong>
              </div>
            ))}
            {isManager && (comments[k]?.length > 0) && (
              <>
                <h3 style={{ marginTop: '1rem' }}>{am ? 'የተጻፉ አስተያየቶች (በዘፈቀደ ቅደም ተከተል)' : 'Written comments (shuffled)'}</h3>
                <ul>{comments[k].map((c, i) => <li key={i}>{c}</li>)}</ul>
              </>
            )}
          </div>
        ) : (
          <p className="muted" style={{ marginTop: '.5rem' }}>{am ? `ስሙ እንዳይታወቅ ቢያንስ ${MIN_ANSWERS} መልሶች ሲኖሩ ብቻ ውጤቱ ይታያል።` : `To keep answers anonymous, results show only once there are at least ${MIN_ANSWERS} answers.`}</p>
        )}
      </details>
    )
  })
}
