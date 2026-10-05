import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { dateToEth, fmtEth, fmtBoth } from '../lib/ethiopian.js'
import { useI18n } from '../i18n.jsx'

const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }

// Notice board for students and teachers: folded, with a count of notices they have not opened yet.
export default function Announcements({ ctx }) {
  const { lang } = useI18n()
  const am = lang === 'am'
  const seenKey = `annSeen:${ctx.uid}`
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(localStorage.getItem(seenKey) || '')

  useEffect(() => {
    supabase.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20)
      .then(({ data, error }) => setItems(error ? [] : data || []))
  }, [])
  if (!items?.length) return null

  const fresh = items.filter((a) => a.created_at > seen).length
  function toggle() {
    if (!open) {
      const newest = items.reduce((m, a) => (a.created_at > m ? a.created_at : m), '')
      localStorage.setItem(seenKey, newest); setSeen(newest)
    }
    setOpen(!open)
  }

  return (
    <div className="panel">
      <button type="button" className="profile-toggle" aria-expanded={open} onClick={toggle}>
        <strong style={{ flex: 1 }}>📢 {am ? 'ማስታወቂያዎች' : 'Announcements'}</strong>
        {fresh > 0 && <span className="pill submitted">{fresh} {am ? 'አዲስ' : 'new'}</span>}
        <span className="chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && items.map((a) => (
        <div key={a.id} style={{ borderTop: '1px solid var(--line)', marginTop: '.75rem', paddingTop: '.75rem' }}>
          <strong>{a.pinned ? '📌 ' : ''}{a.title}</strong>
          <div className="muted" style={{ fontSize: '.8rem' }}>{fmtEth(dateToEth(new Date(a.created_at)))}{a.author_name ? ` · ${a.author_name}` : ''}</div>
          {a.event_date && <div style={{ margin: '.25rem 0' }}><span className="pill approved">{am ? 'ቀን' : 'Date'}: {fmtBoth(day(a.event_date))}</span></div>}
          {a.body && <p style={{ whiteSpace: 'pre-wrap', margin: '.4rem 0 0' }}>{a.body}</p>}
        </div>
      ))}
    </div>
  )
}
