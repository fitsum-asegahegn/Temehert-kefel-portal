import { useEffect, useState } from 'react'
import { supabase, fetchAll, manage } from '../../lib/supabase.js'
import { useI18n } from '../../i18n.jsx'
import { downloadBackup } from '../../lib/backup.js'

const ROLES = ['pending', 'teacher', 'member', 'admin']

export default function UsersTab({ ctx }) {
  const { t, lang } = useI18n()
  const [users, setUsers] = useState([])
  const [msg, setMsg] = useState({ text: '', bad: false })
  const [nf, setNf] = useState({ full_name: '', email: '', role: 'member' })
  const [cred, setCred] = useState(null)
  const [cfg, setCfg] = useState({ pass_mark: ctx.settings.pass_mark, current_year: ctx.settings.current_year, school_name: ctx.settings.school_name, parish: ctx.settings.parish ?? '', school_address: ctx.settings.school_address ?? '' })

  async function load() {
    try {
      const roles = await fetchAll(() => supabase.from('user_roles').select('user_id, role').neq('role', 'student'))
      const ids = roles.map((r) => r.user_id)
      const { data: profiles, error } = ids.length ? await supabase.from('profiles').select('id, full_name, email').in('id', ids) : { data: [] }
      if (error) throw error
      const p = Object.fromEntries(profiles.map((x) => [x.id, x]))
      setUsers(roles.map((r) => ({ id: r.user_id, role: r.role, name: p[r.user_id]?.full_name, email: p[r.user_id]?.email })))
    } catch (e) { setMsg({ text: e.message, bad: true }) }
  }
  useEffect(() => { load() }, [])

  const fail = (e) => setMsg({ text: e.message, bad: true })

  async function setRole(id, role) {
    const { error } = await supabase.from('user_roles').update({ role }).eq('user_id', id)
    if (error) return fail(error)
    load()
  }
  async function reset(u) {
    if (!window.confirm(u.name)) return
    try { const r = await manage('reset_password', { user_id: u.id }); setCred({ full_name: u.name, email: u.email, password: r.password }) } catch (e) { fail(e) }
  }
  // Admin only (this whole tab is). Permanent. Admins must be changed to another role first.
  async function remove(u) {
    const ask = lang === 'am'
      ? `${u.name} ለዘላለም ይሰረዛል። ለማረጋገጥ DELETE ብለው ይጻፉ።`
      : `Permanently delete ${u.name}. Type DELETE to confirm.`
    if (window.prompt(ask) !== 'DELETE') return
    try {
      const r = await manage('delete_users', { user_ids: [u.id] })
      if (r.errors.length) return fail(new Error(r.errors[0].error))
      setMsg({ text: '✓', bad: false }); load()
    } catch (e) { fail(e) }
  }

  const [backing, setBacking] = useState(false)
  const [last, setLast] = useState(localStorage.getItem('lastBackup'))
  async function backup() {
    setBacking(true)
    try {
      const r = await downloadBackup()
      setLast(localStorage.getItem('lastBackup'))
      setMsg({ text: lang === 'am' ? `✓ ${r.students} ተማሪዎች፣ ${r.marks} ውጤቶች ተቀምጠዋል። ፋይሉን በአስተማማኝ ቦታ ያስቀምጡ።` : `✓ Saved ${r.students} students and ${r.marks} marks. Keep the file somewhere safe.`, bad: false })
    } catch (e) { fail(e) }
    setBacking(false)
  }

  async function create(e) {
    e.preventDefault()
    try { const r = await manage('create_staff', nf); setCred(r.user); setNf({ full_name: '', email: '', role: 'member' }); load() } catch (e2) { fail(e2) }
  }
  async function saveCfg(e) {
    e.preventDefault()
    const rows = Object.entries(cfg).map(([key, value]) => ({ key, value: String(value) }))
    const { error } = await supabase.from('settings').upsert(rows)
    if (error) return fail(error)
    ctx.setSettings((prev) => ({ ...prev, ...cfg }))
    setMsg({ text: '✓', bad: false })
  }

  return (
    <>
      {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
      {cred && <p className="ok">{cred.full_name}: {cred.email} / <strong style={{ fontFamily: 'monospace' }}>{cred.password}</strong> <span className="muted">— {lang === 'am' ? 'አንዴ ብቻ ይታያል' : 'shown once'}</span></p>}

      <form className="panel" onSubmit={saveCfg}>
        <h2>{lang === 'am' ? 'ቅንብር' : 'Settings'}</h2>
        <div className="row">
          <label>{lang === 'am' ? 'የት/ቤቱ ስም' : 'School name'}<input value={cfg.school_name} onChange={(e) => setCfg({ ...cfg, school_name: e.target.value })} size={28} /></label>
          <label>{t('year')} (ዓ/ም)<input type="number" value={cfg.current_year} onChange={(e) => setCfg({ ...cfg, current_year: e.target.value })} style={{ width: '6rem' }} /></label>
          <label>{t('passMark')} %<input type="number" value={cfg.pass_mark} onChange={(e) => setCfg({ ...cfg, pass_mark: e.target.value })} style={{ width: '5rem' }} /></label>
          <label>{lang === 'am' ? 'አጥቢያ (በካርድ ላይ)' : 'Parish (on cards)'}<input value={cfg.parish} onChange={(e) => setCfg({ ...cfg, parish: e.target.value })} size={28} /></label>
          <label>{lang === 'am' ? 'የሰ/ት/ቤቱ አድራሻ' : 'School address'}<input value={cfg.school_address} onChange={(e) => setCfg({ ...cfg, school_address: e.target.value })} size={28} /></label>
          <button className="btn">{t('save')}</button>
        </div>
      </form>

      <div className="panel">
        <h2>{lang === 'am' ? 'የመረጃ ቅጂ (Backup)' : 'Backup'}</h2>
        <p className="muted">
          {lang === 'am' ? 'ተማሪዎች፣ ትምህርቶች፣ ሁሉም ውጤቶች፣ የውጤት አካላት፣ መምህራንና ዕቅድ በአንድ Excel ፋይል። የይለፍ ቃልና ፎቶ አይካተትም። በየወሩ ያውርዱ።'
            : 'Students, courses, all marks, assessments, teachers and the plan in one Excel file (no passwords or photos). Download it every month.'}
        </p>
        <button className="btn" disabled={backing} onClick={backup}>{backing ? t('loading') : (lang === 'am' ? 'ቅጂ አውርድ ⬇' : 'Download backup ⬇')}</button>
        <span className="muted" style={{ marginLeft: '.75rem' }}>{last ? (lang === 'am' ? `የመጨረሻ ቅጂ: ${last}` : `Last backup: ${last}`) : (lang === 'am' ? 'እስካሁን ቅጂ አልተወሰደም' : 'No backup yet on this phone')}</span>
      </div>

      <form className="panel" onSubmit={create}>
        <h2>{lang === 'am' ? 'አዲስ አባል / አስተዳዳሪ' : 'New member / admin'}</h2>
        <div className="row">
          <label>{lang === 'am' ? 'ሙሉ ስም' : 'Full name'}<input value={nf.full_name} onChange={(e) => setNf({ ...nf, full_name: e.target.value })} required /></label>
          <label>Email<input type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} required /></label>
          <label>{t('status')}
            <select value={nf.role} onChange={(e) => setNf({ ...nf, role: e.target.value })}><option value="member">{t('role_member')}</option><option value="admin">{t('role_admin')}</option></select>
          </label>
          <button className="btn">{t('save')}</button>
        </div>
      </form>

      <div className="panel scroll">
        <table>
          <thead><tr><th>{t('teacher')} / {t('role_member')}</th><th>Email</th><th>{t('status')}</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td><td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => setRole(u.id, e.target.value)} aria-label={u.name}>
                    {ROLES.map((r) => <option key={r} value={r}>{t('role_' + r)}</option>)}
                  </select>
                </td>
                <td><button className="btn ghost small" onClick={() => reset(u)}>{lang === 'am' ? 'የይለፍ ቃል ቀይር' : 'Reset password'}</button>
                  {u.role !== 'admin' && u.id !== ctx.uid && <> <button className="btn danger small" onClick={() => remove(u)}>{t('delete')}</button></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
