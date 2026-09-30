import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { normalizeCode, emailForCode } from '../lib/grades.js'
import { useI18n } from '../i18n.jsx'

export default function Login() {
  const { t, lang, setLang } = useI18n()
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    // Staff type an email; students type their ID, which maps to a hidden email.
    const code = normalizeCode(id)
    const email = id.includes('@') ? id.trim().toLowerCase() : code ? emailForCode(code) : null
    if (!email) { setBusy(false); return setErr(t('badLogin')) }
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    setBusy(false)
    if (error) setErr(t('badLogin'))
  }

  return (
    <div className="login">
      <div className="panel">
        <h1>{t('appName')}</h1>
        <form onSubmit={submit}>
          <label>{t('idOrEmail')}
            <input value={id} onChange={(e) => setId(e.target.value)} autoCapitalize="characters" autoComplete="username" required />
          </label>
          <label>{t('password')}
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
          </label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" disabled={busy}>{busy ? t('signingIn') : t('signIn')}</button>
        </form>
        <p className="muted" style={{ marginTop: '1rem' }}>{t('loginHint')}</p>
        <button className="btn ghost small" onClick={() => setLang(lang === 'am' ? 'en' : 'am')}>{lang === 'am' ? 'English' : 'አማርኛ'}</button>
      </div>
    </div>
  )
}
