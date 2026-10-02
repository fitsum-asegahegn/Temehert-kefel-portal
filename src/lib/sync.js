// Offline glue: send-or-queue writes, upload the queue when internet returns, remember the last signed-in person,
// and sign out cleanly (even without internet).
import { supabase } from './supabase.js'
import { execute, getQueue, setQueue, enqueue, addFailed } from './queue.js'
import { clearDataCache } from './offlineFetch.js'

let running = false

// Sends the writes now, or keeps them on the phone if there is no internet. -> { queued: boolean }
export async function runOps(uid, ops) {
  if (!navigator.onLine) { enqueue(uid, ops); return { queued: true } }
  const { failed, stoppedAt } = await execute(supabase, ops)
  if (stoppedAt != null) enqueue(uid, ops.slice(stoppedAt)) // connection dropped part-way: keep the rest
  if (failed.length) throw new Error(failed[0].message)
  return { queued: stoppedAt != null }
}

// Uploads whatever is waiting. Safe to call often.
export async function flushQueue(uid) {
  if (running || !uid || !navigator.onLine) return
  const q = getQueue(uid)
  if (!q.length) return
  running = true
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return // not signed in yet; try again later
    const { failed, stoppedAt } = await execute(supabase, q)
    const unsent = stoppedAt == null ? [] : q.slice(stoppedAt)
    const addedMeanwhile = getQueue(uid).slice(q.length) // anything saved while we were uploading
    setQueue(uid, [...unsent, ...addedMeanwhile])
    if (failed.length) addFailed(uid, failed.map((f) => ({ op: f.op, message: f.message, at: Date.now() })))
    if (stoppedAt == null || stoppedAt > 0 || failed.length) window.dispatchEvent(new Event('fts-synced'))
  } finally {
    running = false
  }
}

// ---- the last signed-in person, so the app can open without internet ----
const LAST = 'fts-last-user'
export const saveLastUser = (v) => { try { localStorage.setItem(LAST, JSON.stringify(v)) } catch { /* storage full */ } }
export const loadLastUser = () => { try { return JSON.parse(localStorage.getItem(LAST) || 'null') } catch { return null } }
const forgetLastUser = () => localStorage.removeItem(LAST)

// Works without internet. Unsent changes stay on the phone and upload the next time this person signs in.
export async function signOutClean(uid) {
  const waiting = uid ? getQueue(uid).length : 0
  if (waiting) {
    const am = localStorage.getItem('lang') !== 'en'
    const msg = am
      ? `${waiting} ለውጦች ገና አልተላኩም። እነሱ በዚህ ስልክ ላይ ይቆያሉ፣ በሚቀጥለው ሲገቡ ይላካሉ። ይውጡ?`
      : `${waiting} changes have not been uploaded yet. They stay on this phone and upload the next time you sign in. Sign out anyway?`
    if (!window.confirm(msg)) return false
  }
  try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* offline: handled below */ }
  Object.keys(localStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k))
  forgetLastUser()
  if (uid) await clearDataCache(uid)
  window.dispatchEvent(new Event('fts-signout'))
  return true
}
