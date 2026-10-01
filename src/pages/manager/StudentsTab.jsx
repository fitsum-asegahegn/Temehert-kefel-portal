import { useEffect, useMemo, useState } from 'react'
import { supabase, fetchAll, manage } from '../../lib/supabase.js'
import { GRADES, gradeLabel } from '../../lib/grades.js'
import { useI18n } from '../../i18n.jsx'
import CredentialSlips from '../../components/CredentialSlips.jsx'
import PhotoUpload from '../../components/PhotoUpload.jsx'
import { photoUrl } from '../../lib/photos.js'
import { parseStudentSheet, downloadStudentTemplate } from '../../lib/studentImport.js'

export default function StudentsTab({ ctx }) {
  const { t, lang } = useI18n()
  const [list, setList] = useState([])
  const [gradeF, setGradeF] = useState(5)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(new Set())
  const [slips, setSlips] = useState(null)
  const [msg, setMsg] = useState({ text: '', bad: false })
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)
  const [editPhoto, setEditPhoto] = useState(null)
  useEffect(() => { setEditPhoto(null); if (edit?.photo_path) photoUrl(edit.photo_path).then(setEditPhoto) }, [edit?.id, edit?.photo_path])
  const [form, setForm] = useState({ names: '', grade: 1, section: 'A' })

  async function load() {
    try {
      setList(await fetchAll(() => supabase.from('students').select('*').eq('active', true).order('grade').order('section').order('full_name')))
    } catch (e) { setMsg({ text: e.message, bad: true }) }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => list.filter((s) =>
    (gradeF === 0 || s.grade === gradeF) &&
    (!q || (s.full_name + s.code).toLowerCase().includes(q.toLowerCase()))), [list, gradeF, q])

  async function add(e) {
    e.preventDefault()
    const students = form.names.split('\n').map((n) => n.trim()).filter(Boolean)
      .map((full_name) => ({ full_name, grade: Number(form.grade), section: form.section.trim() || 'A' }))
    if (!students.length) return
    setBusy(true); setMsg({ text: '', bad: false })
    try {
      const r = await manage('create_students', { students })
      if (r.errors.length) setMsg({ text: r.errors.map((x) => `${x.full_name}: ${x.error}`).join(' | '), bad: true })
      if (r.created.length) { setSlips({ items: r.created, title: t('tab_students'), note: lang === 'am' ? 'የይለፍ ቃሎች አንዴ ብቻ ይታያሉ። አሁን ያትሙ።' : 'Passwords are shown only once. Print them now.' }); setForm({ ...form, names: '' }) }
      load()
    } catch (e2) { setMsg({ text: e2.message, bad: true }) }
    setBusy(false)
  }

  async function importFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg({ text: '', bad: false })
    try {
      const { students, skipped } = await parseStudentSheet(file)
      if (!students.length) return setMsg({ text: lang === 'am' ? 'ትክክለኛ ረድፍ አልተገኘም። ሙሉ ስም እና ክፍል ያስፈልጋሉ።' : 'No valid rows. Each row needs a name and a grade.', bad: true })
      const ask = lang === 'am' ? `${students.length} ተማሪዎች ይጨመሩ?` : `Add ${students.length} students?`
      if (!window.confirm(ask + (skipped.length ? ` (${skipped.length} ${lang === 'am' ? 'ረድፎች ተዘለሉ' : 'rows skipped'})` : ''))) return
      setBusy(true)
      const created = []
      const errors = []
      for (let i = 0; i < students.length; i += 25) { // small batches keep each request short
        const r = await manage('create_students', { students: students.slice(i, i + 25) })
        created.push(...r.created); errors.push(...r.errors)
      }
      if (skipped.length) errors.push({ full_name: '', error: (lang === 'am' ? 'የተዘለሉ ረድፎች: ' : 'Skipped rows: ') + skipped.map((x) => x.row).join(', ') })
      if (errors.length) setMsg({ text: errors.map((x) => `${x.full_name} ${x.error}`).join(' | '), bad: true })
      if (created.length) setSlips({ items: created, title: t('tab_students'), note: lang === 'am' ? 'የይለፍ ቃሎች አንዴ ብቻ ይታያሉ። አሁን ያትሙ።' : 'Passwords are shown only once. Print them now.' })
      load()
    } catch (e2) { setMsg({ text: e2.message, bad: true }) }
    setBusy(false)
  }

  async function saveEdit(e) {
    e.preventDefault()
    const { id, full_name, section, christian_name, parish, address, city, kebele, guardian_name, guardian_phone } = edit
    const { error } = await supabase.from('students').update({ full_name, section, christian_name, parish, address, city, kebele, guardian_name, guardian_phone }).eq('id', id)
    if (error) return setMsg({ text: error.message, bad: true })
    setEdit(null); load()
  }

  async function reset(s) {
    if (!window.confirm(`${s.full_name} — ${lang === 'am' ? 'አዲስ የይለፍ ቃል ይፈጠር?' : 'Create a new password?'}`)) return
    try {
      const r = await manage('reset_password', { user_id: s.id })
      setSlips({ items: [{ ...s, password: r.password }], title: s.full_name })
    } catch (e) { setMsg({ text: e.message, bad: true }) }
  }

  async function promote() {
    const ids = shown.filter((s) => picked.has(s.id))
    if (!ids.length) return
    const msgTxt = lang === 'am'
      ? `${ids.length} ተማሪዎች ወደ ቀጣይ ክፍል ይሸጋገሩ? መታወቂያቸው ይቀየራል።`
      : `Promote ${ids.length} students to the next grade? Their IDs will change.`
    if (!window.confirm(msgTxt)) return
    setBusy(true)
    try {
      const r = await manage('promote', { moves: ids.map((s) => ({ id: s.id, grade: s.grade + 1 })) })
      if (r.errors.length) setMsg({ text: r.errors.map((x) => `${x.full_name ?? x.id}: ${x.error}`).join(' | '), bad: true })
      const byId = Object.fromEntries(ids.map((s) => [s.id, s]))
      setSlips({
        items: r.results.filter((x) => !x.graduated).map((x) => ({ full_name: x.full_name, code: x.new_code, grade: byId[x.id].grade + 1 })),
        title: lang === 'am' ? 'አዲስ መታወቂያዎች' : 'New IDs',
        note: lang === 'am' ? 'የይለፍ ቃል አልተቀየረም — አዲሱን መታወቂያ ብቻ ይስጡ።' : 'Passwords are unchanged. Hand out the new ID only.',
      })
      setPicked(new Set())
      load()
    } catch (e) { setMsg({ text: e.message, bad: true }) }
    setBusy(false)
  }

  if (slips) return <CredentialSlips {...slips} onClose={() => setSlips(null)} />

  return (
    <>
      <form className="panel" onSubmit={add}>
        <h2>{lang === 'am' ? 'አዳዲስ ተማሪዎች ጨምር' : 'Add students'}</h2>
        <p className="muted">{lang === 'am' ? 'በእያንዳንዱ መስመር አንድ ስም። መታወቂያና የይለፍ ቃል በራስ-ሰር ይፈጠራል።' : 'One name per line. ID and password are created automatically.'}</p>
        <textarea value={form.names} onChange={(e) => setForm({ ...form, names: e.target.value })} />
        <div className="row" style={{ marginTop: '.75rem' }}>
          <label>{t('grade')}
            <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
              {GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g, lang)}</option>)}
            </select>
          </label>
          <label>{t('section')}<input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} size={4} /></label>
          <button className="btn" disabled={busy}>{t('save')}</button>
          <label className="btn ghost" style={{ cursor: 'pointer', flexDirection: 'row', color: 'var(--ink)' }}>
            {lang === 'am' ? 'ከ Excel አስገባ' : 'Import Excel'}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={importFile} hidden />
          </label>
          <button type="button" className="btn ghost small" onClick={downloadStudentTemplate}>{lang === 'am' ? 'ናሙና ፋይል' : 'Template'}</button>
        </div>
      </form>

      {edit && (
        <form className="panel" onSubmit={saveEdit}>
          <h2>{edit.code}</h2>
          <div className="row">
            {[['full_name', lang === 'am' ? 'ሙሉ ስም ከነ አያት' : 'Full name'], ['christian_name', lang === 'am' ? 'የክርስትና ስም' : 'Christian name'], ['section', t('section')], ['parish', lang === 'am' ? 'አጥቢያ' : 'Parish'], ['address', lang === 'am' ? 'አድራሻ' : 'Address'], ['city', lang === 'am' ? 'ከተማ' : 'City'], ['kebele', lang === 'am' ? 'ቀበሌ' : 'Kebele'], ['guardian_name', lang === 'am' ? 'የወላጅ ስም' : 'Guardian'], ['guardian_phone', lang === 'am' ? 'የወላጅ ስልክ' : 'Guardian phone']].map(([k, label]) => (
              <label key={k}>{label}<input value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} required={k === 'full_name'} /></label>
            ))}
          </div>
          <button className="btn">{t('save')}</button> <button type="button" className="btn ghost" onClick={() => setEdit(null)}>{t('cancel')}</button>
          <h3 style={{ marginTop: '1rem' }}>{t('photoTitle')}</h3>
          <PhotoUpload targetId={edit.id} currentUrl={editPhoto} oldPath={edit.photo_path}
            onDone={(path) => { setEdit({ ...edit, photo_path: path }); load() }} />
        </form>
      )}

      <div className="panel">
        <div className="row">
          <label>{t('grade')}
            <select value={gradeF} onChange={(e) => { setGradeF(Number(e.target.value)); setPicked(new Set()) }}>
              <option value={0}>—</option>
              {GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g, lang)}</option>)}
            </select>
          </label>
          <label>🔍<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button className="btn ghost small" onClick={() => setPicked(new Set(shown.map((s) => s.id)))}>{lang === 'am' ? 'ሁሉንም ምረጥ' : 'Select all shown'}</button>
          <button className="btn small" disabled={busy || !picked.size || gradeF === 0} onClick={promote}>
            {lang === 'am' ? `የተመረጡትን አሸጋግር (${picked.size})` : `Promote selected (${picked.size})`}
          </button>
        </div>
        {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
        <div className="scroll">
          <table>
            <thead><tr><th /><th>{t('student')}</th><th>ID</th><th>{t('grade')}</th><th /></tr></thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id}>
                  <td><input type="checkbox" checked={picked.has(s.id)} aria-label={s.full_name}
                    onChange={() => { const n = new Set(picked); n.has(s.id) ? n.delete(s.id) : n.add(s.id); setPicked(n) }} /></td>
                  <td>{s.full_name}</td><td>{s.code}</td><td>{gradeLabel(s.grade, lang)} {s.section}</td>
                  <td><button className="btn ghost small" onClick={() => setEdit(s)}>{lang === 'am' ? 'ዝርዝር' : 'Details'}</button> <button className="btn ghost small" onClick={() => reset(s)}>{lang === 'am' ? 'የይለፍ ቃል ቀይር' : 'Reset password'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">{shown.length} {t('students')}</p>
      </div>
    </>
  )
}
