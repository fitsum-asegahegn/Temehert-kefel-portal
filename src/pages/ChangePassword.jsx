import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { signOutClean } from '../lib/sync.js'
import { isStudentPassword, studentPassword, MIN_STUDENT_PW, MAX_STUDENT_PW } from '../lib/grades.js'
import { useI18n } from '../i18n.jsx'

export default function ChangePassword({ uid, role, onDone }) {
  const student = role === 'student' || role === 'parent'
  const { t } = useI18n()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    const value = pw.trim()
    if (student ? !isStudentPassword(value) : value.length < 8) return setErr(t(student ? 'pinHint' : 'changeHint'))
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: student ? studentPassword(value) : value })
    if (error) { setBusy(false); return setErr(error.message) }
    await supabase.from('profiles').update({ must_change_password: false }).eq('id', uid)
    onDone()
  }

  return (
    <div className="login">
      <div className="panel">
        <h1>{t('changeTitle')}</h1>
        <p className="muted">{t(student ? 'pinHint' : 'changeHint')}</p>
        <form onSubmit={submit}>
          <label>{t('newPassword')}
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password"
              minLength={student ? MIN_STUDENT_PW : 8} maxLength={student ? MAX_STUDENT_PW : undefined} required />
          </label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" disabled={busy}>{t('saveNew')}</button>
          <button type="button" className="btn ghost" style={{ marginLeft: '.5rem' }} onClick={() => signOutClean(uid)}>{t('signOut')}</button>
        </form>
      </div>
    </div>
  )
}
