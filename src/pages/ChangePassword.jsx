import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useI18n } from '../i18n.jsx'

export default function ChangePassword({ uid, onDone }) {
  const { t } = useI18n()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (pw.length < 8) return setErr(t('changeHint'))
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) { setBusy(false); return setErr(error.message) }
    await supabase.from('profiles').update({ must_change_password: false }).eq('id', uid)
    onDone()
  }

  return (
    <div className="login">
      <div className="panel">
        <h1>{t('changeTitle')}</h1>
        <p className="muted">{t('changeHint')}</p>
        <form onSubmit={submit}>
          <label>{t('newPassword')}
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" disabled={busy}>{t('saveNew')}</button>
          <button type="button" className="btn ghost" style={{ marginLeft: '.5rem' }} onClick={() => supabase.auth.signOut()}>{t('signOut')}</button>
        </form>
      </div>
    </div>
  )
}
