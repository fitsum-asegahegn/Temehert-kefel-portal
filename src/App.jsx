import { useEffect, useState } from 'react'
import { supabase, configured } from './lib/supabase.js'
import { LangProvider, useI18n } from './i18n.jsx'
import Login from './pages/Login.jsx'
import ChangePassword from './pages/ChangePassword.jsx'
import StudentHome from './pages/StudentHome.jsx'
import TeacherHome from './pages/TeacherHome.jsx'
import ManagerHome from './pages/ManagerHome.jsx'

const PAGES = { student: StudentHome, teacher: TeacherHome, member: ManagerHome, admin: ManagerHome }

const VERSION = `v${__APP_VERSION__} · ${__BUILD_TIME__} UTC`

function Root() {
  const { t, lang, setLang } = useI18n()
  const [session, setSession] = useState(undefined)
  const [me, setMe] = useState(null)
  const [settings, setSettings] = useState({ pass_mark: '50', current_year: '2019', school_name: '' })
  const uid = session?.user?.id

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!uid) { setMe(null); return }
    let off = false
    ;(async () => {
      const [r, p, s] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle(),
        supabase.from('profiles').select('full_name, must_change_password').eq('id', uid).maybeSingle(),
        supabase.from('settings').select('key, value'),
      ])
      if (off) return
      setMe({ role: r.data?.role || 'pending', name: p.data?.full_name || '', mustChange: !!p.data?.must_change_password })
      if (s.data) setSettings((prev) => ({ ...prev, ...Object.fromEntries(s.data.map((x) => [x.key, x.value])) }))
    })()
    return () => { off = true }
  }, [uid])

  if (!configured) return <div className="login"><div className="panel err">{t('notConfigured')}</div></div>
  if (session === undefined || (session && !me)) return <div className="login muted">{t('loading')}</div>
  if (!session) return <><Login /><p className="muted" style={{ textAlign: 'center' }}>{VERSION}</p></>
  if (me.mustChange) return <ChangePassword uid={uid} onDone={() => setMe({ ...me, mustChange: false })} />

  const Page = PAGES[me.role]
  const ctx = {
    uid, me, settings,
    year: Number(settings.current_year),
    passMark: Number(settings.pass_mark),
    school: settings.school_name || t('appName'),
    setSettings,
  }

  return (
    <>
      <header className="top">
        <div className="brand">{t('appName')}</div>
        <div className="who">{me.name}<br />{t('role_' + me.role)}</div>
        <button onClick={() => setLang(lang === 'am' ? 'en' : 'am')} aria-label="Language">{lang === 'am' ? 'EN' : 'አማ'}</button>
        <button onClick={() => supabase.auth.signOut()}>{t('signOut')}</button>
      </header>
      <main>
        {Page ? <Page ctx={ctx} /> : (
          <div className="panel"><h2>{t('pendingTitle')}</h2><p>{t('pendingBody')}</p></div>
        )}
        <p className="muted no-print" style={{ textAlign: 'center', marginTop: '2rem' }}>{VERSION}</p>
      </main>
    </>
  )
}

export default function App() {
  return <LangProvider><Root /></LangProvider>
}
