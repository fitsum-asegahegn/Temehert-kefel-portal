import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { gradeLabel } from '../lib/grades.js'
import { runOps } from '../lib/sync.js'
import { pendingFor } from '../lib/queue.js'
import { downloadSheet, safeName } from '../lib/rosterExcel.js'
import { readSheet, mapMarksSheet, downloadMarksTemplate } from '../lib/marksImport.js'
import { useI18n } from '../i18n.jsx'

let keyN = 0
const newKey = () => 'n' + ++keyN
const num = (v) => (v === '' || v == null ? NaN : Number(v))
const round2 = (n) => Math.round(n * 100) / 100

export default function TeacherHome({ ctx }) {
  const { t, lang } = useI18n()
  const [asg, setAsg] = useState(null)
  const [sel, setSel] = useState(null)        // { subject, grade }
  const [term, setTerm] = useState(1)
  const [students, setStudents] = useState([])
  const [defs, setDefs] = useState([])        // saved assessment columns
  const [draft, setDraft] = useState([])      // editor rows { key, id?, name, max }
  const [editing, setEditing] = useState(false)
  const [scores, setScores] = useState({})    // `${studentId}|${assessmentId}` -> text
  const [saved, setSaved] = useState({})      // same key -> true when it exists in the database
  const [marks, setMarks] = useState({})      // studentId -> marks row
  const [pendingIds, setPendingIds] = useState(new Set()) // students whose latest save is still waiting for internet
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ text: '', bad: false })

  const bad = (text) => setMsg({ text, bad: true })
  const ok = (text) => setMsg({ text, bad: false })

  useEffect(() => {
    supabase.from('teacher_assignments').select('grade, subjects(id, name_am, name_en, max_score, term)')
      .eq('teacher_id', ctx.uid).order('grade').then(({ data, error }) => {
        if (error) return bad(error.message)
        const list = data.map((a) => ({ grade: a.grade, subject: a.subjects }))
        setAsg(list)
        if (list.length) { setSel(list[0]); if (list[0].subject.term) setTerm(list[0].subject.term) }
      })
  }, [])

  const maxScore = sel ? Number(sel.subject.max_score) : 100
  const locked = Object.values(marks).some((m) => m.status === 'approved')

  async function load() {
    if (!sel) return
    setMsg({ text: '', bad: false })
    const [st, mk, as] = await Promise.all([
      supabase.from('students').select('id, full_name, code, section').eq('grade', sel.grade).eq('active', true).order('section').order('full_name'),
      supabase.from('marks').select('*').eq('subject_id', sel.subject.id).eq('grade', sel.grade).eq('year', ctx.year).eq('term', term),
      supabase.from('assessments').select('*').eq('subject_id', sel.subject.id).eq('grade', sel.grade).eq('year', ctx.year).eq('term', term).order('sort').order('id'),
    ])
    const err = st.error || mk.error || as.error
    if (err) return bad(err.message)
    const ids = as.data.map((a) => a.id)
    const sc = ids.length ? await supabase.from('assessment_scores').select('*').in('assessment_id', ids) : { data: [], error: null }
    if (sc.error) return bad(sc.error.message)

    setStudents(st.data)
    setDefs(as.data)
    const text = {}, exists = {}
    for (const r of sc.data) { text[`${r.student_id}|${r.assessment_id}`] = String(r.score); exists[`${r.student_id}|${r.assessment_id}`] = true }
    // changes saved on this phone but not uploaded yet are shown on top of the saved copy
    const ov = pendingFor(ctx.uid, { assessmentIds: ids, subjectId: sel.subject.id, year: ctx.year, term })
    for (const [k, v] of Object.entries(ov.scores)) { if (v === null) delete text[k]; else text[k] = v }
    const markMap = Object.fromEntries(mk.data.map((m) => [m.student_id, m]))
    for (const [sid, status] of Object.entries(ov.marks)) markMap[sid] = { ...(markMap[sid] || {}), student_id: sid, status }
    setMarks(markMap); setPendingIds(new Set(Object.keys(ov.marks)))
    setScores(text); setSaved(exists)
    if (as.data.length) {
      setDraft(as.data.map((a) => ({ key: newKey(), id: a.id, name: a.name, max: String(a.max_points) })))
      setEditing(false)
    } else {
      setDraft([{ key: newKey(), name: lang === 'am' ? 'ጠቅላላ ውጤት' : 'Total', max: String(maxScore) }])
      setEditing(true)
    }
  }
  useEffect(() => { load() }, [sel, term])
  // when the phone uploads the waiting changes, refresh from the server
  useEffect(() => {
    window.addEventListener('fts-synced', load)
    return () => window.removeEventListener('fts-synced', load)
  }, [sel, term])

  // ---- define the columns (any number of rows, adding up to the subject's maximum) ----
  const draftSum = draft.reduce((s, r) => s + (num(r.max) || 0), 0)
  const setRow = (key, patch) => setDraft(draft.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function saveDefs() {
    const rows = draft.map((r) => ({ ...r, name: r.name.trim(), max: num(r.max) }))
    if (!rows.length || rows.some((r) => !r.name || !(r.max > 0))) return bad(lang === 'am' ? 'ሁሉም ረድፍ ስምና ነጥብ ያስፈልገዋል።' : 'Every row needs a name and points.')
    if (Math.abs(draftSum - maxScore) > 1e-9) return bad(`${t('total')} ${round2(draftSum)} ≠ ${maxScore}`)
    const keep = new Set(rows.filter((r) => r.id).map((r) => r.id))
    const removed = defs.filter((d) => !keep.has(d.id))
    for (const r of rows.filter((x) => x.id)) {
      const tooHigh = Object.entries(scores).find(([k, v]) => k.endsWith('|' + r.id) && num(v) > r.max)
      if (tooHigh) return bad(`${r.name}: ${lang === 'am' ? 'ከተመዘገበ ውጤት በታች ማድረግ አይቻልም' : 'lower than an entered score'}`)
    }
    if (removed.some((d) => Object.keys(saved).some((k) => k.endsWith('|' + d.id))) &&
        !window.confirm(lang === 'am' ? 'የተወገዱ ረድፎች ውጤቶችም ይሰረዛሉ። ይቀጥሉ?' : 'Scores entered under removed rows will be deleted. Continue?')) return
    setBusy(true)
    try {
      for (const d of removed) { const { error } = await supabase.from('assessments').delete().eq('id', d.id); if (error) throw error }
      for (const [i, r] of rows.entries()) {
        const res = r.id
          ? await supabase.from('assessments').update({ name: r.name, max_points: r.max, sort: i }).eq('id', r.id)
          : await supabase.from('assessments').insert({ subject_id: sel.subject.id, grade: sel.grade, year: ctx.year, term, name: r.name, max_points: r.max, sort: i })
        if (res.error) throw res.error
      }
      ok('✓')
      await load()
    } catch (e) { bad(e.message) }
    setBusy(false)
  }

  // ---- enter scores ----
  const key = (sid, aid) => `${sid}|${aid}`
  const totalOf = (sid) => round2(defs.reduce((s, a) => s + (num(scores[key(sid, a.id)]) || 0), 0))
  const hasAny = (sid) => defs.some((a) => (scores[key(sid, a.id)] ?? '') !== '')
  const avgOf = (sid) => (hasAny(sid) ? round2((totalOf(sid) / maxScore) * 100) : null)

  // Fill the grid from an Excel/CSV sheet. Nothing is saved until the teacher presses Save / Submit.
  async function importFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const locked = new Set(students.filter((s) => marks[s.id]?.status === 'approved').map((s) => s.id))
      const r = mapMarksSheet(await readSheet(file), students, defs, locked)
      if (r.filled) setScores((prev) => ({ ...prev, ...r.fill }))
      const am = lang === 'am'
      const parts = [
        am ? `${r.filled} ተማሪዎች ተሞልተዋል — ይመልከቱና "አስቀምጥ" ይጫኑ።` : `${r.filled} students filled — check them, then press Save.`,
        r.missingCols.length && (am ? `አልተገኘም (አምድ): ${r.missingCols.join('፣ ')}` : `Column not found: ${r.missingCols.join(', ')}`),
        r.unmatched.length && (am ? `ያልተገኙ ተማሪዎች: ${r.unmatched.slice(0, 5).join('፣ ')}${r.unmatched.length > 5 ? '…' : ''}` : `Not found in this class: ${r.unmatched.slice(0, 5).join(', ')}${r.unmatched.length > 5 ? '…' : ''}`),
        r.bad.length && (am ? `ከገደብ ውጭ (አልተሞላም): ${r.bad.slice(0, 3).join(' | ')}${r.bad.length > 3 ? '…' : ''}` : `Out of range (skipped): ${r.bad.slice(0, 3).join(' | ')}${r.bad.length > 3 ? '…' : ''}`),
        r.skippedLocked && (am ? `${r.skippedLocked} የጸደቁ ተማሪዎች ተዘለሉ` : `${r.skippedLocked} approved students skipped`),
      ].filter(Boolean)
      setMsg({ text: parts.join(' · '), bad: !r.filled || parts.length > 1 })
    } catch (err) { bad(err.message) }
  }

  // Roster for this course: student name, each assessment, total, average % (what is on the screen now)
  function downloadRoster() {
    const mean = (vals) => { const v = vals.filter((x) => x != null); return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null }
    const rows = students.map((s) => [s.full_name, ...defs.map((a) => { const v = num(scores[key(s.id, a.id)]); return Number.isNaN(v) ? null : v }), hasAny(s.id) ? totalOf(s.id) : null, avgOf(s.id)])
    const cols = (rows[0] || []).length
    const classRow = [lang === 'am' ? 'የክፍሉ አማካይ' : 'Class average', ...Array.from({ length: cols - 1 }, (_, i) => mean(rows.map((r) => r[i + 1])))]
    downloadSheet({
      sheet: `${name(sel.subject)} ${gradeLabel(sel.grade, lang)}`,
      header: [lang === 'am' ? 'የተማሪ ስም' : 'Student name', ...defs.map((a) => `${a.name} (${a.max_points})`), t('total'), `${t('average')} %`],
      rows: [...rows, classRow],
      filename: `roster-g${sel.grade}-S${term}-${safeName(sel.subject.name_en || 'course' + sel.subject.id)}.xlsx`,
    }).catch((e) => bad(e.message))
  }

  async function saveScores(status) {
    const up = [], del = [], mk = []
    for (const s of students) {
      if (marks[s.id]?.status === 'approved') continue
      let any = false, missing = false, total = 0
      for (const a of defs) {
        const raw = (scores[key(s.id, a.id)] ?? '').trim()
        if (raw === '') { missing = true; if (saved[key(s.id, a.id)]) del.push([a.id, s.id]); continue }
        const v = Number(raw)
        if (Number.isNaN(v) || v < 0 || v > Number(a.max_points)) return bad(`${s.full_name} · ${a.name}: 0 – ${a.max_points}`)
        any = true; total += v
        up.push({ assessment_id: a.id, student_id: s.id, score: v })
      }
      if (!any) continue
      if (status === 'submitted' && missing) return bad(`${s.full_name}: ${lang === 'am' ? 'ያልተሞላ ውጤት አለ' : 'some scores are missing'}`)
      mk.push({ student_id: s.id, subject_id: sel.subject.id, year: ctx.year, term, score: round2(total), status, entered_by: ctx.uid })
    }
    if (!mk.length && !del.length) return bad('—')
    setBusy(true)
    try {
      const ops = [
        ...up.map((row) => ({ t: 'upsert', table: 'assessment_scores', row, onConflict: 'assessment_id,student_id' })),
        ...del.map(([aid, sid]) => ({ t: 'delete', table: 'assessment_scores', match: { assessment_id: aid, student_id: sid } })),
        ...mk.map((row) => ({ t: 'upsert', table: 'marks', row, onConflict: 'student_id,subject_id,year,term' })),
      ]
      const res = await runOps(ctx.uid, ops) // no internet? kept on the phone and uploaded later
      if (res.queued) ok(lang === 'am' ? 'በዚህ ስልክ ላይ ተቀምጧል — ኢንተርኔት ሲኖር ይላካል ✓' : 'Saved on this phone — it will upload when you are online ✓')
      else ok(status === 'submitted' ? t('st_submitted') + ' ✓' : t('st_draft') + ' ✓')
      await load()
    } catch (e) { bad(e.message) }
    setBusy(false)
  }

  if (asg === null) return <p className="muted">{t('loading')}</p>
  if (!asg.length) return <div className="panel"><p>{t('noAssignments')}</p></div>

  const name = (s) => (lang === 'en' && s.name_en ? s.name_en : s.name_am)

  return (
    <>
      <div className="row">
        <label>{t('subject')}
          <select value={asg.indexOf(sel)} onChange={(e) => { const a = asg[Number(e.target.value)]; setSel(a); if (a.subject.term) setTerm(a.subject.term) }}>
            {asg.map((a, i) => <option key={i} value={i}>{name(a.subject)} · {gradeLabel(a.grade, lang)}{a.subject.term ? ` · ${t('term' + a.subject.term)}` : ''}</option>)}
          </select>
        </label>
        {sel.subject.term ? (
          <div className="muted">{t('term' + sel.subject.term)}</div> // this course is taught in one semester only
        ) : (
          <label>{t('term')}
            <select value={term} onChange={(e) => setTerm(Number(e.target.value))}>
              <option value={1}>{t('term1')}</option><option value={2}>{t('term2')}</option>
            </select>
          </label>
        )}
        <div className="muted">{t('year')} {ctx.year} · {t('outOf')} {maxScore}</div>
      </div>

      {/* columns */}
      <div className="panel">
        <div className="row" style={{ marginBottom: '.5rem' }}>
          <h2 style={{ flex: 1, margin: 0 }}>{lang === 'am' ? 'የውጤት አካላት' : 'Assessments'}</h2>
          {!editing && <button className="btn ghost small" disabled={locked} onClick={() => setEditing(true)}>{lang === 'am' ? 'አስተካክል' : 'Edit'}</button>}
        </div>
        {editing ? (
          <>
            <p className="muted">{lang === 'am' ? `ለምሳሌ: ምደባ 20፣ መካከለኛ 30፣ ማጠቃለያ 50። ድምሩ ${maxScore} መሆን አለበት።` : `For example: Assignment 20, Mid 30, Final 50. They must add up to ${maxScore}.`}</p>
            {draft.map((r) => (
              <div className="row" key={r.key} style={{ marginBottom: '.4rem' }}>
                <input value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} aria-label={lang === 'am' ? 'ስም' : 'Name'} placeholder={lang === 'am' ? 'ስም' : 'Name'} style={{ flex: 1, minWidth: '8rem' }} />
                <input value={r.max} inputMode="decimal" onChange={(e) => setRow(r.key, { max: e.target.value })} aria-label={lang === 'am' ? 'ነጥብ' : 'Points'} style={{ width: '5rem', textAlign: 'right' }} />
                <button className="btn ghost small" disabled={draft.length === 1} onClick={() => setDraft(draft.filter((x) => x.key !== r.key))} aria-label={t('delete')}>✕</button>
              </div>
            ))}
            <div className="row">
              <button className="btn ghost small" onClick={() => setDraft([...draft, { key: newKey(), name: '', max: '' }])}>+ {lang === 'am' ? 'ረድፍ ጨምር' : 'Add row'}</button>
              <strong className={Math.abs(draftSum - maxScore) < 1e-9 ? 'ok' : 'err'}>{round2(draftSum)} / {maxScore}</strong>
              <button className="btn" disabled={busy} onClick={saveDefs}>{t('save')}</button>
              {defs.length > 0 && <button className="btn ghost" onClick={load}>{t('cancel')}</button>}
            </div>
          </>
        ) : (
          <p style={{ margin: 0 }}>{defs.map((a) => `${a.name} (${a.max_points})`).join(' · ')}{locked && <span className="muted"> — {lang === 'am' ? 'ጸድቋል፣ መቀየር አይቻልም' : 'approved, locked'}</span>}</p>
        )}
      </div>

      {/* grid */}
      {!editing && (
        <>
          <div className="panel scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('student')}</th>
                  {defs.map((a) => <th className="num" key={a.id}>{a.name}<div className="muted">/ {a.max_points}</div></th>)}
                  <th className="num">{t('total')}</th><th className="num">{t('average')} %</th><th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const st = marks[s.id]?.status
                  return (
                    <tr key={s.id}>
                      <td>{s.full_name}<div className="muted">{s.code}</div></td>
                      {defs.map((a) => (
                        <td className="num" key={a.id}>
                          <input className="mark-input" style={{ width: '4.5rem' }} inputMode="decimal" disabled={st === 'approved'}
                            value={scores[key(s.id, a.id)] ?? ''} aria-label={`${s.full_name} ${a.name}`}
                            onChange={(e) => setScores({ ...scores, [key(s.id, a.id)]: e.target.value })} />
                        </td>
                      ))}
                      <td className="num"><strong>{totalOf(s.id)}</strong></td>
                      <td className="num">{avgOf(s.id) ?? ''}</td>
                      <td>{pendingIds.has(s.id) ? <span className="pill">⏳ {lang === 'am' ? 'ይላካል' : 'waiting'}</span> : st ? <span className={'pill ' + st}>{t('st_' + st)}</span> : <span className="muted">{t('st_missing')}</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
          <div className="row">
            <button className="btn ghost" disabled={busy} onClick={() => saveScores('draft')}>{t('save')}</button>
            <button className="btn" disabled={busy} onClick={() => saveScores('submitted')}>{lang === 'am' ? 'ለግምገማ አስገባ' : 'Submit for review'}</button>
            <button className="btn ghost" onClick={downloadRoster} disabled={!students.length}>{lang === 'am' ? 'ዝርዝር Excel ⬇' : 'Roster Excel ⬇'}</button>
            <label className="btn ghost" style={{ cursor: 'pointer', flexDirection: 'row', color: 'var(--ink)' }}>
              {lang === 'am' ? 'ከ Excel አስገባ ⬆' : 'Import Excel ⬆'}
              <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={importFile} />
            </label>
            <button className="btn ghost small" disabled={!students.length}
              onClick={() => downloadMarksTemplate(students, defs, `marks-template-g${sel.grade}-S${term}-${safeName(sel.subject.name_en || 'course' + sel.subject.id)}.xlsx`).catch((e) => bad(e.message))}>
              {lang === 'am' ? 'ናሙና ፋይል' : 'Template'}
            </button>
          </div>
        </>
      )}
      {editing && msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
    </>
  )
}
