import { createClient } from '@supabase/supabase-js'
import { offlineFetch, MSG_WRITE } from './offlineFetch.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key, { global: { fetch: offlineFetch } }) : null

// Supabase returns at most 1000 rows per request, so page through big result sets.
export async function fetchAll(build) {
  const size = 1000
  let from = 0
  let out = []
  for (;;) {
    const { data, error } = await build().range(from, from + size - 1)
    if (error) throw error
    out = out.concat(data)
    if (data.length < size) return out
    from += size
  }
}

// Calls the manage-users Edge Function (account creation, password reset, promotion).
export async function manage(action, payload = {}) {
  if (!navigator.onLine) throw new Error(MSG_WRITE)
  const { data, error } = await supabase.functions.invoke('manage-users', { body: { action, ...payload } })
  if (error) {
    let msg = error.message
    try { msg = (await error.context.json()).error || msg } catch { /* keep default */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
