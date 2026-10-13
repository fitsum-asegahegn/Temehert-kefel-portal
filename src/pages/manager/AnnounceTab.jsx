import { useEffect, useState } from 'react'
import { supabase, fetchAll, manage } from '../../lib/supabase.js'
import { dateToEth, fmtEth, fmtBoth } from '../../lib/ethiopian.js'
import { useI18n } from '../../i18n.jsx'

const blank = { title: '', body: '', audience: 'all', event_date: '', pinned: false, telegram: false }
const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }

export default function AnnounceTab({ ctx }) {
  const { t, lang } = useI18n()
  const am = lang === 'am'
  const [items, setItems] = useState([])
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState({ text: '', bad: false })
  const AUD = { all: am ? 'ለሁሉም' : 'Everyone', students: am ? 'ለተማሪዎች' : 'Students', teachers: am ? 'ለመምህራን' : 'Teachers', parents: am ? 'ለወላጆች' : 'Parents' }

  async function load() {
    const { data, error } = await supabase.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false })
    if (error) return setMsg({ text: error.message, bad: true })
    setItems(data)
  }
  useEffect(() => { load() }, [])

  // How many people with Telegram connected would get this announcement (one message per chat).
  async function countReach(audience) {
    const [links, roles] = await Promise.all([fetchAll(() => supabase.from('telegram_links').select('user_id, chat_id')), fetchAll(() => supabase.from('user_roles').select('user_id, role'))])
    const roleOf = new Map(roles.map((r) => [r.user_id, r.role]))
    const want = audience === 'all' ? ['student', 'parent', 'teacher'] : audience === 'students' ? ['student'] : audience === 'teachers' ? ['teacher'] : ['parent']
    return new Set(links.filter((l) => want.includes(roleOf.get(l.user_id))).map((l) => String(l.chat_id))).size
  }
  // Sends one announcement on Telegram (asks first, shows the reach, sends in slices). Returns a short result text.
  async function sendTelegram(a) {
    const n = await countReach(a.audience)
    const ask = am
      ? `"${a.title}" በቴሌግራም ለ${n} ተገናኝተው ላሉ ሰዎች ይላክ?${a.telegram_sent_at ? '\n(ይህ ማስታወቂያ አስቀድሞ ተልኳል — እንደገና ይላካል።)' : ''}`
      : `Send "${a.title}" on Telegram to ${n} connected people?${a.telegram_sent_at ? '\n(This was already sent once — it will go out again.)' : ''}`
    if (!n) { setMsg({ text: am ? 'በዚህ ቡድን ቴሌግራም ያገናኘ ሰው የለም።' : 'Nobody in this audience has connected Telegram yet.', bad: true }); return }
    if (!window.confirm(ask)) return
    setMsg({ text: '…', bad: false })
    try {
      const sum = { sent: 0, blocked: 0, failed: 0, total: 0 }
      for (let skip = 0; ;) {
        const r = await manage('notify_announcement', { id: a.id, skip })
        sum.sent += r.sent; sum.blocked += r.blocked; sum.failed += r.failed; sum.total = r.total
        if (r.next == null) break
        skip = r.next
      }
      setMsg({ text: am ? `✓ ${sum.sent} / ${sum.total} ተልኳል${sum.blocked ? ` · ${sum.blocked} ቦቱን አግደዋል` : ''}${sum.failed ? ` · ${sum.failed} አልተላኩም` : ''}` : `✓ ${sum.sent} of ${sum.total} sent${sum.blocked ? ` · ${sum.blocked} blocked the bot` : ''}${sum.failed ? ` · ${sum.failed} failed` : ''}`, bad: sum.failed > 0 })
      load()
    } catch (e) { setMsg({ text: e.message, bad: true }) }
  }

  async function save(e) {
    e.preventDefault()
    const row = { title: form.title.trim(), body: form.body.trim(), audience: form.audience, event_date: form.event_date || null, pinned: form.pinned }
    const res = editing
      ? await supabase.from('announcements').update(row).eq('id', editing)
      : await supabase.from('announcements').insert({ ...row, author_name: ctx.me.name }).select().single()
    if (res.error) return setMsg({ text: res.error.message, bad: true })
    const posted = !editing ? res.data : null
    const wantTelegram = form.telegram
    setForm(blank); setEditing(null); setMsg({ text: '✓', bad: false }); await load()
    if (wantTelegram && posted) await sendTelegram(posted)
  }
  async function remove(a) {
    if (!window.confirm(am ? `"${a.title}" ይሰረዝ?` : `Delete "${a.title}"?`)) return
    const { error } = await supabase.from('announcements').delete().eq('id', a.id)
    if (error) return setMsg({ text: error.message, bad: true })
    load()
  }
  async function pin(a) {
    const { error } = await supabase.from('announcements').update({ pinned: !a.pinned }).eq('id', a.id)
    if (error) return setMsg({ text: error.message, bad: true })
    load()
  }

  return (
    <>
      <form className="panel" onSubmit={save}>
        <h2>{editing ? (am ? 'ማስታወቂያ አስተካክል' : 'Edit announcement') : (am ? 'አዲስ ማስታወቂያ' : 'New announcement')}</h2>
        <div className="row">
          <label style={{ flex: 1, minWidth: '12rem' }}>{am ? 'ርዕስ' : 'Title'}<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        </div>
        <label style={{ display: 'block', marginBottom: '.75rem' }}><span className="muted">{am ? 'መልእክት' : 'Message'}</span>
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </label>
        <div className="row">
          <label>{am ? 'ለማን' : 'For'}
            <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>{Object.entries(AUD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label>{am ? 'የዝግጅት ቀን (አማራጭ)' : 'Event date (optional)'}<input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '.4rem' }}>
            <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> {am ? 'ከላይ አኑር' : 'Pin to top'}
          </label>
        </div>
        {form.event_date && <p className="muted">{fmtBoth(day(form.event_date))}</p>}
        {!editing && (
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.75rem' }}>
            <input type="checkbox" checked={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.checked })} />
            <span>📨 {am ? 'በቴሌግራምም ላክ (ከመላክዎ በፊት ብዛቱን ያሳያል)' : 'Also send on Telegram (shows how many people first)'}</span>
          </label>
        )}
        <button className="btn">{editing ? t('save') : (am ? 'ለጥፍ' : 'Post')}</button>{' '}
        {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(blank) }}>{t('cancel')}</button>}
        {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
      </form>

      {items.map((a) => (
        <div className="panel" key={a.id}>
          <div className="row" style={{ marginBottom: '.25rem' }}>
            <strong style={{ flex: 1 }}>{a.pinned ? '📌 ' : ''}{a.title}</strong>
            <span className="pill">{AUD[a.audience]}</span>
          </div>
          <div className="muted" style={{ fontSize: '.8rem' }}>{fmtEth(dateToEth(new Date(a.created_at)))}{a.author_name ? ` · ${a.author_name}` : ''}{a.event_date ? ` · ${am ? 'ቀን' : 'date'}: ${fmtBoth(day(a.event_date))}` : ''}</div>
          {a.body && <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>}
          <div className="row" style={{ marginBottom: 0 }}>
            <button className="btn ghost small" onClick={() => { setEditing(a.id); setForm({ title: a.title, body: a.body, audience: a.audience, event_date: a.event_date || '', pinned: a.pinned }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{am ? 'አስተካክል' : 'Edit'}</button>
            <button className="btn ghost small" onClick={() => pin(a)}>{a.pinned ? (am ? 'ከላይ አንሳ' : 'Unpin') : (am ? 'ከላይ አኑር' : 'Pin')}</button>
            <button className="btn ghost small" onClick={() => sendTelegram(a)}>📨 {a.telegram_sent_at ? (am ? `ተልኳል (${new Date(a.telegram_sent_at).toLocaleDateString()}) — እንደገና` : `Sent ${new Date(a.telegram_sent_at).toLocaleDateString()} — resend`) : (am ? 'በቴሌግራም ላክ' : 'Send on Telegram')}</button>
            <button className="btn danger small" onClick={() => remove(a)}>{t('delete')}</button>
          </div>
        </div>
      ))}
      {!items.length && <p className="muted">{am ? 'እስካሁን ማስታወቂያ የለም።' : 'No announcements yet.'}</p>}
    </>
  )
}
