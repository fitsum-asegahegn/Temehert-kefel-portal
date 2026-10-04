import { useEffect, useMemo, useState } from 'react'
import { supabase, fetchAll, manage } from '../../lib/supabase.js'
import { GRADES, gradeLabel } from '../../lib/grades.js'
import { planPromotion } from '../../lib/promotion.js'
import { useI18n } from '../../i18n.jsx'
import CredentialSlips from '../../components/CredentialSlips.jsx'

// Year-end: shows each student's yearly result for a grade, ticks the ones who passed, and promotes them in one go.
export default function PromoteTab({ ctx }) {
  const { t, lang } = useI18n()
  const am = lang === 'am'
  const [year, setYear] = useState(ctx.year)
  const [grade, setGrade] = useState(5)
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ text: '', bad: false })
  const [slips, setSlips] = useState(null)

  async function load() {
    setRows(null); setMsg({ text: '', bad: false })
    try {
      const [marks, subjects, students] = await Promise.all([
        fetchAll(() => supabase.from('marks').select('student_id, subject_id, term, score').eq('grade', grade).eq('year', year).eq('status', 'approved')),
        supabase.from('subjects').select('*').then((r) => { if (r.error) throw r.error; return r.data }),
        fetchAll(() => supabase.from('students').select('id, full_name, code, grade, section, active')),
      ])
      setRows(planPromotion({ marks, subjects, students, grade, passMark: ctx.passMark }))
    } catch (e) { setMsg({ text: e.message, bad: true }) }
  }
  useEffect(() => { load() }, [year, grade])

  const toggle = (id) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, promote: !r.promote } : r)))
  const count = useMemo(() => (rows || []).filter((r) => r.promote).length, [rows])
  const graduating = grade === 12

  async function apply() {
    const chosen = rows.filter((r) => r.promote)
    if (!chosen.length) return
    const ask = graduating
      ? (am ? `${chosen.length} ተማሪዎች ይመረቃሉ (መለያቸው ይዘጋል)። ይቀጥሉ?` : `Graduate ${chosen.length} students? Their accounts will be closed.`)
      : (am ? `${chosen.length} ተማሪዎች ወደ ${gradeLabel(grade + 1, lang)} ይሸጋገራሉ። መታወቂያቸው ይቀየራል (የይለፍ ቃሉ አይቀየርም)። ይቀጥሉ?` : `Promote ${chosen.length} students to ${gradeLabel(grade + 1, lang)}? Their IDs change (passwords stay).`)
    if (!window.confirm(ask)) return
    setBusy(true); setMsg({ text: '', bad: false })
    try {
      const done = [], errors = []
      for (let i = 0; i < chosen.length; i += 25) { // small batches keep each request short
        const r = await manage('promote', { moves: chosen.slice(i, i + 25).map((s) => ({ id: s.id, grade: grade + 1 })) })
        done.push(...r.results); errors.push(...r.errors)
      }
      if (errors.length) setMsg({ text: errors.map((x) => `${x.full_name ?? x.id}: ${x.error}`).join(' | '), bad: true })
      const moved = done.filter((x) => !x.graduated)
      if (moved.length) {
        setSlips({
          items: moved.map((x) => ({ full_name: x.full_name, code: x.new_code, grade: grade + 1 })),
          title: am ? 'አዲስ መታወቂያዎች' : 'New IDs',
          note: am ? 'የይለፍ ቃል አልተቀየረም — አዲሱን መታወቂያ ብቻ ይስጡ።' : 'Passwords are unchanged — hand out the new ID only.',
        })
      } else if (!errors.length) setMsg({ text: `✓ ${done.length}`, bad: false })
      load()
    } catch (e) { setMsg({ text: e.message, bad: true }) }
    setBusy(false)
  }

  async function startNewYear() {
    const next = Number(ctx.settings.current_year) + 1
    if (!window.confirm(am ? `የትምህርት ዘመኑ ወደ ${next} ይቀየር? (ሁሉንም ክፍሎች ካሳደጉ በኋላ ብቻ)` : `Switch the school year to ${next}? Do this only after every grade is promoted.`)) return
    const { error } = await supabase.from('settings').upsert({ key: 'current_year', value: String(next) })
    if (error) return setMsg({ text: error.message, bad: true })
    ctx.setSettings((p) => ({ ...p, current_year: String(next) }))
    setYear(next)
    setMsg({ text: `✓ ${next}`, bad: false })
  }

  if (slips) return <CredentialSlips {...slips} onClose={() => setSlips(null)} />

  const pill = (s) => <span className={'pill ' + (s === 'promoted' ? 'approved' : s === 'repeat' ? 'plan-overdue' : 'submitted')}>{t('res_' + s)}</span>

  return (
    <>
      <p className="muted">
        {am ? 'የዓመቱ መጨረሻ፦ ክፍል ይምረጡ፣ ያለፉት ምልክት ይደረግባቸዋል (የጸደቁ ውጤቶች)። ምልክቱን ማስተካከል ይችላሉ፣ ከዚያ "አሳድግ" ይጫኑ።'
          : 'Year end: pick a grade. Students who passed are ticked (approved marks). Adjust the ticks if needed, then press the button.'}
      </p>
      <div className="row">
        <label>{t('year')}<input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: '6rem' }} /></label>
        <label>{t('grade')}
          <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>{GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g, lang)}</option>)}</select>
        </label>
        <button className="btn ghost small" disabled={!rows} onClick={() => setRows(rows.map((r) => ({ ...r, promote: r.status === 'promoted' })))}>{am ? 'ያለፉትን ምረጥ' : 'Select passed'}</button>
        <button className="btn ghost small" disabled={!rows} onClick={() => setRows(rows.map((r) => ({ ...r, promote: false })))}>{am ? 'ምርጫ አጽዳ' : 'Select none'}</button>
        <button className="btn" disabled={busy || !count} onClick={apply}>
          {graduating ? (am ? `አስመርቅ (${count})` : `Graduate (${count})`) : (am ? `አሳድግ (${count})` : `Promote (${count})`)}
        </button>
      </div>
      {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
      {!rows && !msg.text && <p className="muted">{t('loading')}</p>}
      {rows && !rows.length && <p>{am ? 'በዚህ ክፍል ተማሪ የለም።' : 'No students in this grade.'}</p>}
      {rows && rows.length > 0 && (
        <div className="panel scroll">
          <table>
            <thead><tr><th /><th>{t('student')}</th><th>{t('section')}</th><th className="num">{t('average')} %</th><th>{t('status')}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={r.promote} aria-label={r.name} onChange={() => toggle(r.id)} /></td>
                  <td>{r.name}<div className="muted">{r.code}</div></td><td>{r.section}</td><td className="num">{r.average ?? '—'}</td><td>{pill(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            {am ? `የማለፊያ ውጤት ${ctx.passMark}%። "ያልተሟላ" = አንድ መንፈቀ ዓመት ውጤት የለውም። ያልተመረጡት በክፍላቸው ይቆያሉ።`
              : `Pass mark ${ctx.passMark}%. "Incomplete" = a semester has no approved marks. Students left unticked stay in the grade.`}
          </p>
        </div>
      )}
      <div className="panel">
        <h3>{am ? 'አዲስ የትምህርት ዘመን' : 'Start the new school year'}</h3>
        <p className="muted">{am ? `አሁን፦ ${ctx.settings.current_year}። ሁሉንም ክፍሎች ካሳደጉ በኋላ ይጫኑ።` : `Now: ${ctx.settings.current_year}. Press after every grade has been promoted.`}</p>
        <button className="btn ghost" onClick={startNewYear}>{am ? 'ወደ ቀጣዩ ዘመን ቀይር' : 'Switch to next year'}</button>
      </div>
    </>
  )
}
