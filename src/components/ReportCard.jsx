import { CONDUCT } from '../lib/grades.js'
import { useI18n } from '../i18n.jsx'

const fmt = (x) => (x == null ? '—' : String(Math.round(x * 100) / 100))

// card = buildCard(); ranks = { 1, 2, y } each { rank, class_size } | undefined
export default function ReportCard({ school, student, year, gradeText, card, ranks = {}, conduct = {}, passMark }) {
  const { t, lang } = useI18n()
  const rk = (r) => (r ? <span className="rc-rank">{r.rank} / {r.class_size}</span> : '—')
  const cd = (n) => (conduct[n] ? CONDUCT[conduct[n]][lang] : '—')

  return (
    <article className="rc">
      <header className="rc-head">
        <div className="rc-school">{school}</div>
        <h2>{t('reportCard')}</h2>
        <div className="muted">{year} ዓ/ም</div>
      </header>
      <dl className="rc-info">
        <div><dt>{t('student')}:</dt><dd>{student.full_name}</dd></div>
        <div><dt>ID:</dt><dd>{student.code}</dd></div>
        <div><dt>{t('grade')}:</dt><dd>{gradeText}</dd></div>
        <div><dt>{t('section')}:</dt><dd>{student.section}</dd></div>
      </dl>
      <div className="scroll">
        <table className="rc-table">
          <thead>
            <tr>
              <th>{t('subject')}</th><th className="num">{t('outOf')}</th>
              <th className="num">{t('term1')}</th><th className="num">{t('term2')}</th><th className="num">{t('average')} %</th>
            </tr>
          </thead>
          <tbody>
            {card.rows.map((r) => (
              <tr key={r.subject.id}>
                <td>{lang === 'en' && r.subject.name_en ? r.subject.name_en : r.subject.name_am}</td>
                <td className="num">{r.max}</td><td className="num">{fmt(r.t1)}</td><td className="num">{fmt(r.t2)}</td><td className="num">{fmt(r.avg)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>{t('total')}</td><td className="num">{fmt(card.s1?.maxTotal)}</td><td className="num">{fmt(card.s1?.total)}</td><td className="num">{fmt(card.s2?.total)}</td><td /></tr>
            <tr><td>{t('average')} %</td><td /><td className="num">{fmt(card.s1?.average)}</td><td className="num">{fmt(card.s2?.average)}</td><td className="num">{fmt(card.yearly)}</td></tr>
            <tr><td>{t('rank')}</td><td /><td className="num">{rk(ranks[1])}</td><td className="num">{rk(ranks[2])}</td><td className="num">{rk(ranks.y)}</td></tr>
            <tr><td>{t('conduct')}</td><td /><td className="num">{cd(1)}</td><td className="num">{cd(2)}</td><td /></tr>
          </tfoot>
        </table>
      </div>
      <p style={{ marginTop: '.8rem' }}>
        <strong>{t('status')}:</strong> {t('res_' + card.status)}
        <span className="muted"> ({t('passMark')} {passMark}%)</span>
      </p>
      <div className="rc-sign">
        <div>{t('teacher')}</div><div>{lang === 'am' ? 'የክፍሉ ኃላፊ' : 'Department head'}</div><div>{lang === 'am' ? 'የወላጅ ፊርማ' : 'Parent signature'}</div>
      </div>
    </article>
  )
}
