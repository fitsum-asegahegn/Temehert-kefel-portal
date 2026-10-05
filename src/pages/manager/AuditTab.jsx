import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { CATEGORIES, describe } from '../../lib/audit.js'
import { dateToEth, fmtEth } from '../../lib/ethiopian.js'
import { useI18n } from '../../i18n.jsx'

const PAGE = 100

// Admin only: who changed what, and when. Entries cannot be edited or deleted from the app.
export default function AuditTab() {
  const { lang } = useI18n()
  const am = lang === 'am'
  const [days, setDays] = useState(30)
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function load(reset) {
    setBusy(true); setErr('')
    const from = reset ? 0 : rows.length
    let b = supabase.from('audit_log').select('*').order('at', { ascending: false }).range(from, from + PAGE - 1)
    if (days) b = b.gte('at', new Date(Date.now() - days * 86400000).toISOString())
    if (cat) b = b.like('action', cat + '.%')
    const { data, error } = await b
    setBusy(false)
    if (error) return setErr(error.message)
    setRows(reset ? data : [...rows, ...data]); setMore(data.length === PAGE)
  }
  useEffect(() => { load(true) }, [days, cat])

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? rows.filter((r) => (describe(r, lang) + ' ' + (r.actor_name || '')).toLowerCase().includes(k)) : rows
  }, [rows, q, lang])

  return (
    <>
      <p className="muted">{am ? 'በስርዓቱ ላይ ማን ምን እንደለወጠ። መዝገቡ ከመተግበሪያው ሊለወጥ ወይም ሊሰረዝ አይችልም።' : 'Who changed what, and when. Entries cannot be edited or deleted from the app.'}</p>
      <div className="row">
        <label>{am ? 'ጊዜ' : 'Period'}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>{am ? 'ያለፉት 7 ቀናት' : 'Last 7 days'}</option><option value={30}>{am ? 'ያለፉት 30 ቀናት' : 'Last 30 days'}</option>
            <option value={365}>{am ? 'ያለፈው ዓመት' : 'Last year'}</option><option value={0}>{am ? 'ሁሉም' : 'All'}</option>
          </select>
        </label>
        <label>{am ? 'አይነት' : 'Type'}
          <select value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map(([k, n]) => <option key={k} value={k}>{n[lang]}</option>)}</select>
        </label>
        <label>🔍<input value={q} onChange={(e) => setQ(e.target.value)} placeholder={am ? 'ፈልግ' : 'Search'} /></label>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="panel scroll">
        <table>
          <thead><tr><th>{am ? 'መቼ' : 'When'}</th><th>{am ? 'ማን' : 'Who'}</th><th>{am ? 'ምን' : 'What'}</th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const d = new Date(r.at)
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<div className="muted">{fmtEth(dateToEth(d))}</div></td>
                  <td>{r.actor_name || '—'}</td>
                  <td>{describe(r, lang)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!shown.length && !busy && <p className="muted">{am ? 'ምንም መዝገብ የለም።' : 'No entries.'}</p>}
        {more && <button className="btn ghost" disabled={busy} onClick={() => load(false)}>{am ? 'ተጨማሪ' : 'Load more'}</button>}
      </div>
    </>
  )
}
