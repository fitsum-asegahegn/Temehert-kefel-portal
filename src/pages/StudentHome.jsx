import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { buildCard } from '../lib/calc.js'
import { gradeLabel } from '../lib/grades.js'
import { useI18n } from '../i18n.jsx'
import ReportCard from '../components/ReportCard.jsx'

export default function StudentHome({ ctx }) {
  const { t, lang } = useI18n()
  const [year, setYear] = useState(ctx.year)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let off = false
    setData(null)
    ;(async () => {
      try {
        // RLS returns only this student's own approved marks.
        const [st, sub, mk, r1, r2, ry] = await Promise.all([
          supabase.from('students').select('*').eq('id', ctx.uid).single(),
          supabase.from('subjects').select('*').order('sort').order('id'),
          supabase.from('marks').select('*').eq('student_id', ctx.uid),
          supabase.rpc('my_rank', { p_year: year, p_term: 1 }),
          supabase.rpc('my_rank', { p_year: year, p_term: 2 }),
          supabase.rpc('my_rank', { p_year: year, p_term: null }),
        ])
        const bad = [st, sub, mk, r1, r2, ry].find((r) => r.error)
        if (bad) throw bad.error
        if (off) return
        const years = [...new Set([ctx.year, ...mk.data.map((m) => m.year)])].sort((a, b) => b - a)
        const marks = mk.data.filter((m) => m.year === year)
        setData({
          student: st.data, years, marks,
          card: buildCard({ subjects: sub.data, marks, passMark: ctx.passMark }),
          ranks: { 1: r1.data?.[0], 2: r2.data?.[0], y: ry.data?.[0] },
                    gradeAtYear: marks[0]?.grade ?? st.data.grade,
        })
      } catch (e) { if (!off) setErr(e.message) }
    })()
    return () => { off = true }
  }, [year])

  if (err) return <p className="err">{err}</p>
  if (!data) return <p className="muted">{t('loading')}</p>
  const { student, card, ranks } = data

  return (
    <>
      <div className="row no-print">
        <label>{t('year')}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        {card.rows.length > 0 && <button className="btn ghost" onClick={() => window.print()}>{t('print')}</button>}
      </div>

      {card.rows.length === 0 ? (
        <div className="panel"><p>{t('noResults')}</p></div>
      ) : (
        <>
          <div className="summary no-print">
            <div><div className="avg-num">{card.yearly ?? '—'}<span className="muted" style={{ fontSize: '1.2rem' }}>%</span></div><div className="muted">{t('average')} · {t('yearly')}</div></div>
            {ranks.y && <div><div className="rank-num">{ranks.y.rank}<span className="muted" style={{ fontSize: '1.2rem' }}> / {ranks.y.class_size}</span></div><div className="muted">{t('rank')} · {t('yearly')}</div></div>}
          </div>
          <div className="panel scroll no-print">
            <table>
              <thead><tr><th>{t('subject')}</th><th className="num">{t('term1')}</th><th className="num">{t('term2')}</th><th className="num">{t('average')} %</th></tr></thead>
              <tbody>
                {card.rows.map((r) => (
                  <tr key={r.subject.id}><td>{lang === 'en' && r.subject.name_en ? r.subject.name_en : r.subject.name_am}</td>
                    <td className="num">{r.t1 ?? '—'} / {r.max}</td><td className="num">{r.t2 ?? '—'} / {r.max}</td><td className="num">{r.avg ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="muted">{t('status')}: {t('res_' + card.status)} ({t('passMark')} {ctx.passMark}%)</p>
          </div>
          <div className="card-page">
            <ReportCard
              student={student} year={year} gradeText={gradeLabel(data.gradeAtYear, lang)}
              card={card} ranks={ranks} cfg={ctx.settings}
            />
          </div>
        </>
      )}
    </>
  )
}
