import { useEffect, useState } from 'react'
import { supabase, configured } from './lib/supabase.js'
import { setCacheUser } from './lib/offlineFetch.js'
import { flushQueue, saveLastUser, loadLastUser, signOutClean } from './lib/sync.js'
import { LangProvider, useI18n } from './i18n.jsx'
import Login from './pages/Login.jsx'
import ChangePassword from './pages/ChangePassword.jsx'
import StudentHome from './pages/StudentHome.jsx'
import TeacherHome from './pages/TeacherHome.jsx'
import ManagerHome from './pages/ManagerHome.jsx'
import ParentHome from './pages/ParentHome.jsx'
import PhotoUpload from './components/PhotoUpload.jsx'
import StatusBar from './components/StatusBar.jsx'

const PAGES = { parent: ParentHome, student: StudentHome, teacher: TeacherHome, member: ManagerHome, admin: ManagerHome }

const VERSION = `v${__APP_VERSION__} · ${__BUILD_TIME__} UTC`

function Root() {
  const { t, lang, setLang } = useI18n()
  const [session, setSession] = useState(undefined)
  const [me, setMe] = useState(null)
  const [loadErr, setLoadErr] = useState(false)
  const [settings, setSettings] = useState({ pass_mark: '50', current_year: '2019', school_name: '' })
  const uid = session?.user?.id
  const offlineMode = !!session?.offline // opened without internet, using the last signed-in person's saved copy

  // ---- who is signed in (works offline for someone who signed in on this phone before) ----
  useEffect(() => {
    if (!configured) return
    const offlineSession = () => {
      const last = loadLastUser()
      return last && !navigator.onLine ? { user: { id: last.uid }, offline: true } : null
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || offlineSession()))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) setSession(s)
      else setSession((cur) => (cur === undefined || (cur?.offline && !navigator.onLine) ? cur : null))
    })
    const out = () => { setSession(null); setMe(null) }
    window.addEventListener('fts-signout', out)
    return () => { data.subscription.unsubscribe(); window.removeEventListener('fts-signout', out) }
  }, [])

  // ---- load role / profile / settings (from the saved copy when offline) ----
  useEffect(() => {
    if (!uid) { setMe(null); return }
    setCacheUser(uid)
    setLoadErr(false)
    const last = loadLastUser()
    const fromLast = () => {
      if (last?.uid !== uid) return false
      setMe(last.me); setSettings((prev) => ({ ...prev, ...last.settings }))
      return true
    }
    if (offlineMode) { if (!fromLast()) setLoadErr(true); return }
    let off = false
    ;(async () => {
      const [r, p, s] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle(),
        supabase.from('profiles').select('full_name, must_change_password').eq('id', uid).maybeSingle(),
        supabase.from('settings').select('key, value'),
      ])
      if (off) return
      if (r.error || p.error) { if (!fromLast()) setLoadErr(true); return } // couldn't reach the server
      const role = r.data?.role || 'pending'
      let hasPhoto = true
      if (role === 'student') {
        const ph = await supabase.from('students').select('photo_path').eq('id', uid).maybeSingle()
        hasPhoto = ph.error && last?.uid === uid ? last.me.hasPhoto : !!ph.data?.photo_path
      }
      if (off) return
      setMe({ role, name: p.data?.full_name || '', mustChange: !!p.data?.must_change_password, hasPhoto })
      if (s.data) setSettings((prev) => ({ ...prev, ...Object.fromEntries(s.data.map((x) => [x.key, x.value])) }))
    })()
    return () => { off = true }
  }, [uid, offlineMode])

  // remember the latest state so the app can open without internet next time
  useEffect(() => {
    if (uid && me && !offlineMode) saveLastUser({ uid, me, settings })
  }, [uid, me, settings, offlineMode])

  // ---- upload changes made offline whenever internet is back ----
  useEffect(() => {
    if (!uid) return
    let fails = 0
    const tick = async () => {
      if (!navigator.onLine) return
      if (offlineMode) { // we opened offline; swap in the real session once it can be refreshed
        const { data } = await supabase.auth.getSession()
        if (data.session) { fails = 0; setSession(data.session) } else if (++fails >= 3) setSession(null) // refresh token no longer valid
        return
      }
      flushQueue(uid)
    }
    tick()
    const id = setInterval(tick, 30000)
    const onVisible = () => document.visibilityState === 'visible' && tick()
    window.addEventListener('online', tick)
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); window.removeEventListener('online', tick); document.removeEventListener('visibilitychange', onVisible) }
  }, [uid, offlineMode])

  if (!configured) return <div className="login"><div className="panel err">{t('notConfigured')}</div></div>
  if (loadErr) {
    return (
      <div className="login"><div className="panel">
        <p className="err">{lang === 'am' ? 'መረጃውን መጫን አልተቻለም። ኢንተርኔት ያረጋግጡና እንደገና ይሞክሩ።' : 'Could not load. Check your internet and try again.'}</p>
        <button className="btn" onClick={() => window.location.reload()}>{lang === 'am' ? 'እንደገና ሞክር' : 'Try again'}</button>{' '}
        <button className="btn ghost" onClick={() => signOutClean(uid)}>{t('signOut')}</button>
      </div></div>
    )
  }
  if (session === undefined || (session && !me)) return <div className="login muted">{t('loading')}</div>
  if (!session) return <><Login /><p className="muted" style={{ textAlign: 'center' }}>{VERSION}</p></>
  if (me.mustChange) return <ChangePassword uid={uid} role={me.role} onDone={() => setMe({ ...me, mustChange: false })} />

  // A student must add a photo (it is printed on the report card) before seeing anything else.
  if (me.role === 'student' && !me.hasPhoto) {
    return (
      <div className="login">
        <div className="panel">
          <h1>{t('photoTitle')}</h1>
          <PhotoUpload targetId={uid} self required onDone={() => setMe({ ...me, hasPhoto: true })} />
          <button className="btn ghost small" style={{ marginTop: '1rem' }} onClick={() => signOutClean(uid)}>{t('signOut')}</button>
        </div>
      </div>
    )
  }

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
        <button onClick={() => signOutClean(uid)}>{t('signOut')}</button>
      </header>
      <StatusBar uid={uid} />
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
