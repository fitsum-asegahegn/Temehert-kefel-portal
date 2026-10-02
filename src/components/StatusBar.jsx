import { useEffect, useState } from 'react'
import { getQueue, getFailed, clearFailed } from '../lib/queue.js'
import { flushQueue } from '../lib/sync.js'
import { useI18n } from '../i18n.jsx'

// Thin strip under the header: offline notice, changes waiting to upload, changes the server refused.
export default function StatusBar({ uid }) {
  const { lang } = useI18n()
  const am = lang === 'am'
  const [online, setOnline] = useState(navigator.onLine)
  const [stale, setStale] = useState(false)
  const [waiting, setWaiting] = useState(0)
  const [bad, setBad] = useState([])

  useEffect(() => {
    const refresh = () => { setWaiting(getQueue(uid).length); setBad(getFailed(uid)) }
    refresh()
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    const served = () => setStale(true)
    const fresh = () => setStale(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    window.addEventListener('fts-served-cache', served); window.addEventListener('fts-online-ok', fresh)
    window.addEventListener('fts-queue-changed', refresh)
    return () => {
      window.removeEventListener('online', on); window.removeEventListener('offline', off)
      window.removeEventListener('fts-served-cache', served); window.removeEventListener('fts-online-ok', fresh)
      window.removeEventListener('fts-queue-changed', refresh)
    }
  }, [uid])

  if (online && !stale && !waiting && !bad.length) return null
  return (
    <div className="statusbar no-print" role="status">
      {(!online || stale) && <div>📴 {am ? 'ከመስመር ውጪ ነዎት — ለመጨረሻ ጊዜ የተቀመጠውን መረጃ እያዩ ነው።' : 'You are offline — showing the last saved copy.'}</div>}
      {waiting > 0 && (
        <div>
          ⏳ {am ? `${waiting} ለውጦች ኢንተርኔት ሲኖር ይላካሉ።` : `${waiting} changes will upload when you are online.`}{' '}
          {online && <button className="btn ghost small" onClick={() => flushQueue(uid)}>{am ? 'አሁን ላክ' : 'Upload now'}</button>}
        </div>
      )}
      {bad.length > 0 && (
        <div className="err">
          ⚠ {am ? `${bad.length} ለውጦች በአገልጋዩ አልተቀበሉም (ምናልባት ውጤቱ ጸድቋል)።` : `${bad.length} changes were refused by the server (maybe the marks were already approved).`}{' '}
          <button className="btn ghost small" onClick={() => clearFailed(uid)}>{am ? 'አጥፋ' : 'Dismiss'}</button>
          <div className="muted">{[...new Set(bad.map((b) => b.message))].slice(0, 2).join(' · ')}</div>
        </div>
      )}
    </div>
  )
}
