import { useEffect, useState } from 'react'
import { supabase, fetchAll, manage } from '../../lib/supabase.js'
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
  const [published, setPublished] = useState(null) // released to students? { published_at } | null
  const [msg, setMsg] = useState({ text: '', bad: false })

  async function load() {
    try {
      const [sub, st, mk, pub] = await Promise.all([
        supabase.from('subjects').select('*').order('sort').order('id'),
        supabase.from('students').select('id, full_name, code, section').eq('grade', grade).eq('active', true).order('section').order('full_name'),
        fetchAll(() => supabase.from('marks').select('*').eq('grade', grade).eq('year', year).eq('term', term)),
        supabase.from('published_results').select('published_at, telegram_sent_at').eq('year', year).eq('term', term).eq('grade', grade).maybeSingle(),
      ])
      if (sub.error || st.error) throw sub.error || st.error
      setSubjects(sub.data); setStudents(st.data); setMarks(mk); setPublished(pub.data || null)
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

  // Students see approved marks only after this is pressed (per year + semester + grade).
  async function setReleased(release) {
    const key = { year, term, grade }
    const res = release ? await supabase.from('published_results').upsert(key) : await supabase.from('published_results').delete().match(key)
    if (res.error) return setMsg({ text: res.error.message, bad: true })
    setMsg({ text: '✓', bad: false }); load()
  }
  // After releasing: message every student/parent who connected Telegram (in slices, so a big grade never times out).
  const [tg, setTg] = useState({ busy: false, text: '', bad: false })
  async function sendTelegram() {
    const am = lang === 'am'
    const again = published?.telegram_sent_at
    if (!window.confirm(again
      ? (am ? 'ለዚህ ክፍል አስቀድሞ ተልኳል። እንደገና ይላክ?' : 'Already sent for this grade. Send again?')
      : (am ? 'ውጤቱ ለተገናኙ ተማሪዎችና ወላጆች በቴሌግራም ይላክ?' : 'Send the results on Telegram to every connected student and parent?'))) return
    setTg({ busy: true, text: '', bad: false })
    try {
      const sum = { sent: 0, blocked: 0, failed: 0, total: 0, withoutLink: 0, students: 0 }
      for (let skip = 0; ;) {
        const r = await manage('notify_release', { year, term, grade, skip })
        sum.sent += r.sent; sum.blocked += r.blocked; sum.failed += r.failed; sum.total = r.total; sum.withoutLink = r.withoutLink; sum.students = r.students
        if (r.next == null) break
        skip = r.next
      }
      setTg({ busy: false, bad: sum.failed > 0, text: am
        ? `✓ ${sum.sent} / ${sum.total} መልእክቶች ተልከዋል${sum.blocked ? ` · ${sum.blocked} ቦቱን አግደዋል` : ''}${sum.failed ? ` · ${sum.failed} አልተላኩም` : ''} · ከ${sum.students} ተማሪዎች ${sum.withoutLink} ቴሌግራም አላገናኙም`
        : `✓ ${sum.sent} of ${sum.total} messages sent${sum.blocked ? ` · ${sum.blocked} blocked the bot` : ''}${sum.failed ? ` · ${sum.failed} failed` : ''} · ${sum.withoutLink} of ${sum.students} students have nobody connected` })
      load()
    } catch (e) { setTg({ busy: false, text: e.message, bad: true }) }
  }
  const notApproved = marks.filter((m) => m.status !== 'approved').length

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

      <div className="panel">
        <div className="row" style={{ marginBottom: '.25rem' }}>
          <div style={{ flex: 1 }}>
            <strong>{lang === 'am' ? 'ውጤቱን ለተማሪዎች ልቀቅ' : 'Release results to students'}</strong>
            <div className={published ? 'ok' : 'muted'}>
              {published
                ? (lang === 'am' ? `ተለቋል — ተማሪዎች ማየት ይችላሉ (${new Date(published.published_at).toLocaleDateString()})` : `Released — students can see it (${new Date(published.published_at).toLocaleDateString()})`)
                : (lang === 'am' ? 'አልተለቀቀም — ተማሪዎች ገና ማየት አይችሉም።' : 'Not released — students cannot see these results yet.')}
            </div>
            {!published && notApproved > 0 && <div className="err">{lang === 'am' ? `${notApproved} ውጤቶች ገና አልጸደቁም።` : `${notApproved} marks are not approved yet.`}</div>}
          </div>
          {published
            ? <button className="btn ghost" onClick={() => setReleased(false)}>{lang === 'am' ? 'ልቀቱን አንሳ' : 'Take back'}</button>
            : <button className="btn" disabled={!marks.length} onClick={() => setReleased(true)}>{lang === 'am' ? 'ልቀቅ' : 'Release'}</button>}
        </div>
        {published && (
          <div className="row" style={{ marginBottom: 0, marginTop: '.5rem' }}>
            <div className="muted" style={{ flex: 1 }}>📨 Telegram: {published.telegram_sent_at
              ? (lang === 'am' ? `ተልኳል (${new Date(published.telegram_sent_at).toLocaleDateString()})` : `sent (${new Date(published.telegram_sent_at).toLocaleDateString()})`)
              : (lang === 'am' ? 'ገና አልተላከም' : 'not sent yet')}</div>
            <button className="btn ghost small" disabled={tg.busy} onClick={sendTelegram}>{tg.busy ? '…' : (lang === 'am' ? 'በቴሌግራም ላክ' : 'Send on Telegram')}</button>
          </div>
        )}
        {tg.text && <p className={tg.bad ? 'err' : 'ok'} role="status">{tg.text}</p>}
      </div>

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
