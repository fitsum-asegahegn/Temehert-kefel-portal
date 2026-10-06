import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useI18n } from '../i18n.jsx'

const BOT = import.meta.env?.VITE_TELEGRAM_BOT // the school bot's username, without the @

// Lets a student / parent connect their Telegram so released results arrive as a message. Folded to one line.
export default function TelegramConnect({ ctx }) {
  const { lang } = useI18n()
  const am = lang === 'am'
  const [links, setLinks] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ text: '', bad: false })
  const timer = useRef(null)

  const load = () => supabase.from('telegram_links').select('chat_id').eq('user_id', ctx.uid).then(({ data }) => setLinks(data || []))
  useEffect(() => { if (BOT) load(); return () => clearInterval(timer.current) }, [])
  if (!BOT || links === null) return null

  async function connect() {
    setBusy(true); setMsg({ text: '', bad: false })
    const { data: code, error } = await supabase.rpc('create_telegram_link_code')
    setBusy(false)
    if (error) return setMsg({ text: error.message, bad: true })
    window.open(`https://t.me/${BOT}?start=${code}`, '_blank')
    setMsg({ text: am ? 'ቴሌግራም ይከፈታል — "START" ን ይጫኑ፣ ከዚያ እዚህ ይመለሱ።' : 'Telegram opens — press START, then come back here.', bad: false })
    let tries = 0
    clearInterval(timer.current)
    timer.current = setInterval(async () => { // notice the connection as soon as the bot has it
      await load()
      if (++tries > 40) clearInterval(timer.current)
    }, 3000)
  }
  async function disconnect() {
    if (!window.confirm(am ? 'ቴሌግራም ይቋረጥ?' : 'Disconnect Telegram?')) return
    const { error } = await supabase.from('telegram_links').delete().eq('user_id', ctx.uid)
    if (error) return setMsg({ text: error.message, bad: true })
    setMsg({ text: '', bad: false }); load()
  }

  const connected = links.length > 0
  if (connected && timer.current) clearInterval(timer.current)
  return (
    <div className="panel">
      <button type="button" className="profile-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <strong style={{ flex: 1 }}>📨 {am ? 'ውጤት በቴሌግራም' : 'Results on Telegram'}</strong>
        {connected && <span className="pill approved">✓ {am ? 'ተገናኝቷል' : 'connected'}</span>}
        <span className="chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ marginTop: '.75rem' }}>
          <p className="muted">
            {am ? 'ውጤት ሲለቀቅ አማካይዎን፣ ደረጃዎን እና የትምህርት ውጤቶችን በቴሌግራም መልእክት ያገኛሉ። ያገናኙት ቴሌግራም ብቻ መልእክቱን ያገኛል።'
              : 'When results are released you get a Telegram message with the average, rank and course marks. Only the Telegram you connect receives it.'}
          </p>
          <div className="row" style={{ marginBottom: 0 }}>
            <button className="btn" disabled={busy} onClick={connect}>{connected ? (am ? 'ሌላ ቴሌግራም አገናኝ' : 'Connect another Telegram') : (am ? 'ከቴሌግራም ጋር አገናኝ' : 'Connect Telegram')}</button>
            {connected && <button className="btn ghost" onClick={disconnect}>{am ? 'አቋርጥ' : 'Disconnect'}</button>}
          </div>
          {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
        </div>
      )}
    </div>
  )
}
