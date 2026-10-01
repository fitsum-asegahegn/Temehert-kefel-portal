import { gradeLabel } from '../lib/grades.js'
import { useI18n } from '../i18n.jsx'

// items: [{ full_name, code, password?, grade }]
// Passwords exist only in this response — they are not stored anywhere readable.
export default function CredentialSlips({ items, title, note, onClose }) {
  const { t, lang } = useI18n()
  const groups = [...items.reduce((m, s) => m.set(s.grade, [...(m.get(s.grade) ?? []), s]), new Map())].sort((a, b) => a[0] - b[0])
  return (
    <section className="panel">
      <div className="row no-print">
        <h2 style={{ flex: 1 }}>{title}</h2>
        <button className="btn" onClick={() => window.print()}>{t('print')}</button>
        <button className="btn ghost" onClick={onClose}>{t('back')}</button>
      </div>
      {note && <p className="muted no-print">{note}</p>}
      {groups.map(([g, list]) => (
        <div className="slip-group" key={g}>
          <h3 className="slip-head">{gradeLabel(g, lang)} · {list.length}</h3>
          <div className="slips">
            {list.map((s) => (
              <div className="slip" key={s.code + s.full_name}>
                <div className="muted">{lang === 'am' ? 'ፍኖተ ጥበብ ሰንበት ትምህርት ቤት' : 'Finote Tsibeb Sunday School'}</div>
                <div><strong>{s.full_name}</strong> · {gradeLabel(s.grade, lang)}</div>
                <div className="code">{s.code}</div>
                {s.password ? <div>{t('password')}: <span className="pw">{s.password}</span></div> : <div className="muted">{lang === 'am' ? 'የይለፍ ቃል አልተቀየረም' : 'Password unchanged'}</div>}
                {s.password && <div className="muted" style={{ fontSize: '.78rem', marginTop: '.4rem' }}>{lang === 'am' ? 'ከገቡ በኋላ የራስዎን የይለፍ ቃል ይምረጡ።' : 'After signing in, choose your own password.'}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
