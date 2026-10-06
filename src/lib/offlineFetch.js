// A fetch() wrapper for the Supabase client that lets the app work without internet.
//  - Reads (data + photos) are saved in the phone's Cache storage after every successful download.
//    With no internet (or a very slow one) the last saved copy is returned instead.
//  - Writes made without internet get a clear "needs internet" answer (marks entry has its own queue — see sync.js).
// Each signed-in person has their own cache, which is deleted on sign-out.
const PREFIX = 'fts-data-'
let cacheName = PREFIX + 'anon'
const TIMEOUT = 12000

export const MSG_WRITE = "You're offline — this change needs internet. Connect and try again."
export const MSG_NOCACHE = "You're offline and this page hasn't been saved on this phone yet. Open it once while online."

export const setCacheUser = (uid) => { cacheName = PREFIX + (uid || 'anon') }
export const clearDataCache = (uid) => (globalThis.caches ? caches.delete(PREFIX + uid) : Promise.resolve())

const emit = (name) => globalThis.window?.dispatchEvent(new Event(name))
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }
const offlineRes = (message) => new Response(JSON.stringify({ message, code: 'OFFLINE' }), { status: 503, headers: { 'Content-Type': 'application/json' } })

const isApi = (url) => /\/rest\/v1\/|\/storage\/v1\//.test(url)
// reads we keep: normal GETs, plus the two read-only ranking calls (sent as POST)
const cacheable = (req) =>
  req.method === 'GET'
    ? /\/rest\/v1\//.test(req.url) || /\/storage\/v1\/object\/authenticated\//.test(req.url)
    : req.method === 'POST' && /\/rest\/v1\/rpc\/(my_rank|grade_ranking|child_rank)(\?|$)/.test(req.url)

async function keyFor(req) {
  const u = new URL(req.url)
  const body = req.method === 'POST' ? await req.clone().text() : ''
  const sig = [req.method, req.headers.get('range') || '', req.headers.get('accept') || '', req.headers.get('prefer') || '', body].join('|')
  u.searchParams.set('__k', hash(sig)) // same URL + different paging/format/body = different saved copy; never the login token
  return new Request(u.toString())
}

async function withTimeout(req, ms) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  // keep the caller's own cancel signal working too, where the browser supports combining signals
  const signal = typeof AbortSignal !== 'undefined' && AbortSignal.any && req.signal ? AbortSignal.any([req.signal, ctl.signal]) : ctl.signal
  try { return await fetch(req, { signal }) } finally { clearTimeout(timer) }
}

export async function offlineFetch(input, init) {
  const req = new Request(input, init)
  if (!isApi(req.url)) return fetch(req)

  if (!cacheable(req)) {
    if (!navigator.onLine) return offlineRes(MSG_WRITE)
    return fetch(req)
  }

  const cache = await caches.open(cacheName)
  const key = await keyFor(req)
  const fromCache = async () => {
    const hit = await cache.match(key)
    if (hit) emit('fts-served-cache')
    return hit
  }

  if (!navigator.onLine) return (await fromCache()) || offlineRes(MSG_NOCACHE)
  try {
    const res = await withTimeout(req.clone(), TIMEOUT)
    if (res.ok) {
      try { await cache.put(key, res.clone()) } catch { /* e.g. partial (206) responses can't be stored */ }
      emit('fts-online-ok')
    }
    return res
  } catch (e) {
    const hit = await fromCache()
    if (hit) return hit
    throw e
  }
}
