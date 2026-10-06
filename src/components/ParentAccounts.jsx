import { useEffect, useState } from 'react'
import { supabase, manage } from '../lib/supabase.js'
import { phoneFromEmail, normalizePhone } from '../lib/grades.js'
import { useI18n } from '../i18n.jsx'

// Inside a student's Details: who can see this child's results, and a way to give a parent a login.
export default function ParentAccounts({ student, onSlips }) {
  const { lang } = useI18n()
  const am = lang === 'am'
  const [parents, setParents] = useState([])
  const [phone, setPhone] = useState(student.guardian_phone || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ text: '', bad: false })

  async function load() {
    const links = await supabase.from('parent_students').select('parent_id').eq('student_id', student.id)
    const ids = (links.data || []).map((l) => l.parent_id)
    if (!ids.length) return setParents([])
    const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
    setParents(data || [])
  }
  useEffect(() => { load() }, [student.id])

  const slip = (name, login, password) => onSlips({
    items: [{ full_name: `${name} — ${am ? 'ወላጅ' : 'Parent'}`, code: login, password, grade: student.grade }],
    title: am ? 'የወላጅ መግቢያ ወረቀት' : 'Parent sign-in slip',
    note: am ? 'የይለፍ ቃሉ አንዴ ብቻ ይታያል። ወላጁ ሲገቡ የራሳቸውን ይመርጣሉ።' : 'The password is shown only once. The parent chooses their own when they sign in.',
  })

  async function create() {
    if (!normalizePhone(phone)) return setMsg({ text: am ? 'ትክክለኛ የስልክ ቁጥር ያስገቡ (ለምሳሌ 0912 345 678)።' : 'Enter a valid mobile number (for example 0912 345 678).', bad: true })
    setBusy(true); setMsg({ text: '', bad: false })
    try {
      const r = await manage('create_parents', { student_ids: [student.id], phone })
      if (r.created.length) { const c = r.created[0]; slip(c.name, c.login, c.password) }
      else if (r.linked.length) setMsg({ text: am ? '✓ ከነበረ የወላጅ መለያ ጋር ተገናኝቷል (የይለፍ ቃሉ አልተቀየረም)።' : '✓ Linked to the existing parent account (password unchanged).', bad: false })
      else if (r.skipped.length) setMsg({ text: r.skipped[0].reason, bad: true })
      load()
    } catch (e) { setMsg({ text: e.message, bad: true }) }
    setBusy(false)
  }
  async function reset(p) {
    if (!window.confirm(am ? `የ${p.full_name} አዲስ የይለፍ ቃል ይፈጠር?` : `Create a new password for ${p.full_name}?`)) return
    try { const r = await manage('reset_password', { user_id: p.id }); slip(p.full_name, phoneFromEmail(p.email), r.password) } catch (e) { setMsg({ text: e.message, bad: true }) }
  }
  async function unlink(p) {
    if (!window.confirm(am ? `${p.full_name} ከዚህ ተማሪ ይለይ?` : `Unlink ${p.full_name} from this student?`)) return
    try { await manage('unlink_parent', { parent_id: p.id, student_id: student.id }); load() } catch (e) { setMsg({ text: e.message, bad: true }) }
  }

  return (
    <div>
      <h3 style={{ marginTop: '1rem' }}>{am ? 'የወላጅ መግቢያ' : 'Parent access'}</h3>
      <p className="muted">{am ? 'ወላጁ በስልክ ቁጥራቸው ይገባሉ፤ የዚህን ልጅ የተለቀቀ ውጤት ብቻ ያያሉ (ምንም መቀየር አይችሉም)። ከአንድ በላይ ልጆች ያላቸው ወላጆች በአንድ መለያ ይገናኛሉ።'
        : "The parent signs in with their phone number and sees only this child's released results (read-only). Parents with several children share one account."}</p>
      {parents.map((p) => (
        <div className="row" key={p.id} style={{ marginBottom: '.4rem' }}>
          <div style={{ flex: 1 }}><strong>{p.full_name}</strong><div className="muted">{phoneFromEmail(p.email)}</div></div>
          <button type="button" className="btn ghost small" onClick={() => reset(p)}>{am ? 'የይለፍ ቃል ቀይር' : 'Reset password'}</button>
          <button type="button" className="btn ghost small" onClick={() => unlink(p)}>{am ? 'አለያይ' : 'Unlink'}</button>
        </div>
      ))}
      <div className="row">
        <label>{am ? 'የወላጅ ስልክ' : 'Parent phone'}<input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="0912 345 678" /></label>
        <button type="button" className="btn small" disabled={busy} onClick={create}>{parents.length ? (am ? 'ሌላ ወላጅ ጨምር' : 'Add another parent') : (am ? 'የወላጅ መለያ ፍጠር' : 'Create parent login')}</button>
      </div>
      {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
    </div>
  )
}
