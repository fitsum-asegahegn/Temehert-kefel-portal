import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { BUCKET, removePhoto } from '../lib/photos.js'
import { useI18n } from '../i18n.jsx'

// Same shape as the photo box on the card (about 0.89 : 1), so nothing gets stretched.
const W = 360
const H = 405

// Centre-crop (a little biased upward, where faces are) and shrink to a small JPEG.
async function cropToBlob(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const target = W / H
  let sw = bmp.width
  let sh = bmp.height
  if (sw / sh > target) sw = Math.round(sh * target)
  else sh = Math.round(sw / target)
  const sx = Math.round((bmp.width - sw) / 2)
  const sy = Math.round((bmp.height - sh) * 0.3)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, W, H)
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H)
  bmp.close?.()
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the photo'))), 'image/jpeg', 0.85))
}

// targetId: whose photo.  self: true when the student uploads their own (uses the safe RPC);
// members/admins uploading for a student use a normal update.
export default function PhotoUpload({ targetId, self, currentUrl, oldPath, required, onDone, onCancel }) {
  const { t } = useI18n()
  const [blob, setBlob] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr('')
    try {
      if (!file.type.startsWith('image/')) throw new Error(t('photoNotImage'))
      const b = await cropToBlob(file)
      setBlob(b)
      setPreview(URL.createObjectURL(b))
    } catch (e2) { setErr(e2.message) }
  }

  async function save() {
    if (!blob) return
    setBusy(true); setErr('')
    try {
      const path = `${targetId}/${Date.now()}.jpg`
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' })
      if (up.error) throw up.error
      const res = self
        ? await supabase.rpc('set_my_photo', { p_path: path })
        : await supabase.from('students').update({ photo_path: path, photo_updated_at: new Date().toISOString() }).eq('id', targetId)
      if (res.error) throw res.error
      if (oldPath && oldPath !== path) removePhoto(oldPath) // tidy up; failure here doesn't matter
      onDone(path)
    } catch (e2) { setErr(e2.message); setBusy(false) }
  }

  const shown = preview || currentUrl
  return (
    <div>
      {required && <p><strong>{t('photoWhy')}</strong></p>}
      {!required && <p className="muted">{t('photoWhy')}</p>}
      <p className="muted">{t('photoTip')}</p>
      <div style={{ width: 160, height: 180, border: '2px solid #f79646', borderRadius: 16, overflow: 'hidden', margin: '0 0 1rem', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {shown ? <img src={shown} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="muted">{t('photoNone')}</span>}
      </div>
      <div className="row">
        <label className="btn ghost" style={{ cursor: 'pointer', flexDirection: 'row', color: 'var(--ink)' }}>
          {shown ? t('photoChooseOther') : t('photoChoose')}
          <input type="file" accept="image/*" onChange={pick} hidden />
        </label>
        <button type="button" className="btn" disabled={!blob || busy} onClick={save}>{busy ? t('loading') : t('photoSave')}</button>
        {!required && onCancel && <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>{t('cancel')}</button>}
      </div>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  )
}
