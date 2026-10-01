import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { buildCard } from '../lib/calc.js'
import { gradeLabel } from '../lib/grades.js'
import { useI18n } from '../i18n.jsx'
import ReportCard from '../components/ReportCard.jsx'
import CourseModal from '../components/CourseModal.jsx'
import PdfButton, { useCardLayout } from '../components/PdfButton.jsx'
import PhotoUpload from '../components/PhotoUpload.jsx'
import { photoUrl } from '../lib/photos.js'

export default function StudentHome({ ctx }) {
  const { t, lang } = useI18n()
  const [year, setYear] = useState(ctx.year)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const cardRef = useRef(null)
  const [photo, setPhoto] = useState({ path: null, url: null })
  const [changing, setChanging] = useState(false)
  const [flash, setFlash] = useState('')
  const [layout, setLayout] = useCardLayout()
  const [open, setOpen] = useState(null) // subject whose breakdown is showing

  useEffect(() => {
    let off = false
    setData(null)
    ;(async () => {
      try {
        // RLS returns only this student's own approved marks.
        const [st, sub, mk, as, sc, r1, r2, ry] = await Promise.all([
          supabase.from('students').select('*').eq('id', ctx.uid).single(),
          supabase.from('subjects').select('*').order('sort').order('id'),
          supabase.from('marks').select('*').eq('student_id', ctx.uid),
          supabase.from('assessments').select('*').eq('year', year).order('sort').order('id'),
          supabase.from('assessment_scores').select('*').eq('student_id', ctx.uid),
          supabase.rpc('my_rank', { p_year: year, p_term: 1 }),
          supabase.rpc('my_rank', { p_year: year, p_term: 2 }),
          supabase.rpc('my_rank', { p_year: year, p_term: null }),
        ])
        const bad = [st, sub, mk, as, sc, r1, r2, ry].find((r) => r.error)
        if (bad) throw bad.error
        if (off) return
        const years = [...new Set([ctx.year, ...mk.data.map((m) => m.year)])].sort((a, b) => b - a)
        const marks = mk.data.filter((m) => m.year === year)
        setData({
          student: st.data, years, marks, assess: as.data,
          scoreOf: Object.fromEntries(sc.data.map((r) => [r.assessment_id, r.score])),
          subjects: sub.data,
          card: buildCard({ subjects: sub.data, marks, passMark: ctx.passMark }),
          ranks: { 1: r1.data?.[0], 2: r2.data?.[0], y: ry.data?.[0] },
                    gradeAtYear: marks[0]?.grade ?? st.data.grade,
        })
      } catch (e) { if (!off) setErr(e.message) }
    })()
    return () => { off = true }
  }, [year])

  useEffect(() => {
    if (!data?.student?.photo_path) return
    let off = false
    photoUrl(data.student.photo_path).then((url) => { if (!off) setPhoto({ path: data.student.photo_path, url }) })
    return () => { off = true }
  }, [data?.student?.photo_path])

  if (err) return <p className="err">{err}</p>
  if (!data) return <p className="muted">{t('loading')}</p>
  const { student, card, ranks } = data
  const termsFor = (subject) => [1, 2].map((term) => {
    const m = data.marks.find((x) => x.subject_id === subject.id && x.term === term)
    if (!m) return null
    const rows = data.assess.filter((a) => a.subject_id === subject.id && a.term === term).map((a) => ({ a, score: data.scoreOf[a.id] }))
    return { term, rows, total: Number(m.score), max: Number(subject.max_score) }
  }).filter(Boolean)

  return (
    <>
      {open && <CourseModal subject={open} terms={termsFor(open)} onClose={() => setOpen(null)} />}
      <div className="panel no-print">
        {changing ? (
          <PhotoUpload targetId={ctx.uid} self currentUrl={photo.url} oldPath={photo.path}
            onCancel={() => setChanging(false)}
            onDone={(path) => { setChanging(false); setFlash(t('photoSaved')); photoUrl(path).then((url) => setPhoto({ path, url })) }} />
        ) : (
          <div className="row" style={{ marginBottom: 0 }}>
            <div style={{ width: 56, height: 63, borderRadius: 10, overflow: 'hidden', border: '2px solid #f79646', background: 'var(--paper)' }}>
              {photo.url && <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <button className="btn ghost small" onClick={() => { setFlash(''); setChanging(true) }}>{t('photoChange')}</button>
            {flash && <span className="ok" role="status">{flash}</span>}
          </div>
        )}
      </div>
      <div className="row no-print">
        <label>{t('year')}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        {card.rows.length > 0 && <PdfButton rootRef={cardRef} layout={layout} setLayout={setLayout} name={`report-card-${year}`} />}
        {card.rows.length > 0 && layout === 'side' && <button className="btn ghost" onClick={() => window.print()}>{t('print')}</button>}
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
                  <tr key={r.subject.id}><td><button className="link" onClick={() => setOpen(r.subject)}>{lang === 'en' && r.subject.name_en ? r.subject.name_en : r.subject.name_am}</button></td>
                    <td className="num">{r.t1 ?? '—'} / {r.max}</td><td className="num">{r.t2 ?? '—'} / {r.max}</td><td className="num">{r.avg ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="muted">{t('status')}: {t('res_' + card.status)} ({t('passMark')} {ctx.passMark}%)</p>
          </div>
          <div className="card-page" ref={cardRef}>
            <ReportCard
              student={student} year={year} gradeText={gradeLabel(data.gradeAtYear, lang)}
              card={card} ranks={ranks} cfg={ctx.settings} photoUrl={photo.url}
            />
          </div>
        </>
      )}
    </>
  )
}
