import { useEffect } from 'react'
import { useI18n } from '../i18n.jsx'

// terms: [{ term, rows: [{ a, score }], total, max }]  — one block per semester that has a result.
export default function CourseModal({ subject, terms, onClose }) {
  const { t, lang } = useI18n()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const title = lang === 'en' && subject.name_en ? subject.name_en : subject.name_am
  return (
    <div className="modal-bg no-print" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{lang === 'am' ? 'የውጤት ዝርዝር' : 'Assessment Result'}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        <div className="modal-course">{lang === 'am' ? 'ትምህርት' : 'Course'} : {title}</div>
        {terms.length === 0 && <p className="muted" style={{ padding: '1rem' }}>{t('noResults')}</p>}
        {terms.map((b) => {
          const pct = b.rows.length && Math.abs(b.rows.reduce((s, r) => s + Number(r.a.max_points), 0) - 100) < 1e-9
          return (
            <div key={b.term} className="scroll">
              <div className="modal-term">{t('term' + b.term)}</div>
              {b.rows.length > 0 && (
                <table>
                  <thead><tr><th>{lang === 'am' ? 'ተ.ቁ' : 'S.No.'}</th><th>{lang === 'am' ? 'ምዘና' : 'Assessment'}</th><th className="num">{lang === 'am' ? 'ውጤት' : 'Result'}</th></tr></thead>
                  <tbody>
                    {b.rows.map((r, i) => (
                      <tr key={r.a.id}>
                        <td>{i + 1}</td>
                        <td>{r.a.name} ( {r.a.max_points}{pct ? '%' : ''} )</td>
                        <td className="num">{r.score ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="modal-total">{lang === 'am' ? 'ጠቅላላ ውጤት' : 'Total Mark'} : {b.total} / {b.max}</div>
            </div>
          )
        })}
        <div className="modal-foot"><button className="btn ghost" onClick={onClose}>{t('close')}</button></div>
      </div>
    </div>
  )
}
