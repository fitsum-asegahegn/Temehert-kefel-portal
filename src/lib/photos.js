import { supabase } from './supabase.js'

export const BUCKET = 'student-photos'
const cache = new Map() // storage path -> blob: URL (same-origin, so the PDF export can draw it)

export async function photoUrl(path) {
  if (!path) return null
  if (cache.has(path)) return cache.get(path)
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) return null
  const url = URL.createObjectURL(data)
  cache.set(path, url)
  return url
}

// -> { [path]: blobUrl | null }, a few downloads at a time
export async function loadPhotos(paths) {
  const list = [...new Set(paths.filter(Boolean))]
  const out = {}
  let i = 0
  async function worker() {
    while (i < list.length) {
      const p = list[i++]
      out[p] = await photoUrl(p)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker))
  return out
}

export const removePhoto = (path) => (path ? supabase.storage.from(BUCKET).remove([path]) : null)
