import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { buildCard } from '../lib/calc.js'
import { gradeLabel } from '../lib/grades.js'
import { scopeName } from '../lib/reportText.js'
import { useI18n } from '../i18n.jsx'
import CourseModal from '../components/CourseModal.jsx'
import PhotoUpload from '../components/PhotoUpload.jsx'
import { photoUrl } from '../lib/photos.js'

// Students see: their profile (read-only text; only members can edit it, the student can change their photo)
// and their results. They do not see or generate the printed report card — members do that.
export default function StudentHome({ ctx }) {
  const { t, lang } = useI18n()
  const [year, setYear] = useState(ctx.year)
  const [scope, setScope] = useState('year') // 'year' | 1 | 2
  const picked = useRef(false) // true once the student chose a year themselves
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [photo, setPhoto] = useState({ path: null, url: null })
  const [changing, setChanging] = useState(false)
  const [flash, setFlash] = useState('')
  const [open, setOpen] = useState(null) // course whose assessment breakdown is showing
  const [profileOpen, setProfileOpen] = useState(() => localStorage.getItem('profileOpen') === '1')
  const toggleProfile = () => setProfileOpen((v) => { localStorage.setItem('profileOpen', v ? '0' : '1'); return !v })

  useEffect(() => {
    let off = false
    setData(null)
    ;(async () => {
      try {
        // RLS returns only this student's own approved marks.
        const [st, sub, mk, as, sc, ry] = await Promise.all([
          supabase.from('students').select('*').eq('id', ctx.uid).single(),
          supabase.from('subjects').select('*').order('sort').order('id'),
          supabase.from('marks').select('*').eq('student_id', ctx.uid),
          supabase.from('assessments').select('*').eq('year', year).order('sort').order('id'),
          supabase.from('assessment_scores').select('*').eq('student_id', ctx.uid),
          supabase.rpc('my_rank', { p_year: year, p_term: scope === 'year' ? null : scope }),
        ])
        const bad = [st, sub, mk, as, sc, ry].find((r) => r.error)
        if (bad) throw bad.error
        if (off) return
        const years = [...new Set([ctx.year, ...mk.data.map((m) => m.year)])].sort((a, b) => b - a)
        const marks = mk.data.filter((m) => m.year === year)
        if (!picked.current && !marks.length) {
          const latest = years.find((y) => mk.data.some((m) => m.year === y))
          if (latest && latest !== year) { setYear(latest); return } // reloads for that year
        }
        const inScope = scope === 'year' ? marks : marks.filter((m) => m.term === scope)
        setData({
          student: st.data, years, marks, assess: as.data,
          scoreOf: Object.fromEntries(sc.data.map((r) => [r.assessment_id, r.score])),
          card: buildCard({ subjects: sub.data, marks: inScope, passMark: ctx.passMark }),
          then: marks[0] ? { grade: marks[0].grade, section: marks[0].section } : null, // grade/section in that year
          rank: ry.data?.[0],
        })
      } catch (e) { if (!off) setErr(e.message) }
    })()
    return () => { off = true }
  }, [year, scope])

  useEffect(() => {
    if (!data?.student?.photo_path) return
    let off = false
    photoUrl(data.student.photo_path).then((url) => { if (!off) setPhoto({ path: data.student.photo_path, url }) })
    return () => { off = true }
  }, [data?.student?.photo_path])

  if (err) return <p className="err">{err}</p>
  if (!data) return <p className="muted">{t('loading')}</p>
  const { student, card, rank } = data
  const am = lang === 'am'

  const termsFor = (subject) => [1, 2].map((term) => {
    const m = data.marks.find((x) => x.subject_id === subject.id && x.term === term)
    if (!m) return null
    const rows = data.assess.filter((a) => a.subject_id === subject.id && a.term === term).map((a) => ({ a, score: data.scoreOf[a.id] }))
    return { term, rows, total: Number(m.score), max: Number(subject.max_score) }
  }).filter(Boolean)

  const fields = [
    [am ? 'ሙሉ ስም ከነ አያት' : 'Full name', student.full_name, true],
    [am ? 'መታወቂያ' : 'Student ID', student.code],
    [t('grade'), gradeLabel(student.grade, lang)],
    [t('section'), student.section],
    [am ? 'የክርስትና ስም' : 'Christian name', student.christian_name],
    [am ? 'አጥቢያ' : 'Parish', student.parish, true],
    [am ? 'አድራሻ' : 'Address', student.address],
    [am ? 'ከተማ' : 'City', student.city],
    [am ? 'ቀበሌ' : 'Kebele', student.kebele],
    [am ? 'የወላጅ ስም' : 'Guardian', student.guardian_name],
    [am ? 'የወላጅ ስልክ' : 'Guardian phone', student.guardian_phone],
  ]

  return (
    <>
      {open && <CourseModal subject={open} terms={termsFor(open)} onClose={() => setOpen(null)} />}

      {/* profile: text only, read-only. Folded to one line by default so the results are what you see first. */}
      <div className="panel">
        <button type="button" className="profile-toggle" aria-expanded={profileOpen} onClick={toggleProfile}>
          <span className="profile-thumb">{photo.url && <img src={photo.url} alt="" />}</span>
          <span style={{ minWidth: 0 }}>
            <strong>{student.full_name}</strong>
            <span className="muted" style={{ display: 'block', fontSize: '.85rem' }}>{student.code} · {gradeLabel(student.grade, lang)} {student.section}</span>
          </span>
          <span className="chev" aria-hidden="true">{profileOpen ? '▴' : '▾'}</span>
        </button>
        {profileOpen && (
          <div style={{ marginTop: '1rem' }}>
        <div className="profile">
          <div className="profile-photo">
            {photo.url ? <img src={photo.url} alt="" /> : <span className="muted">{t('photoNone')}</span>}
          </div>
          <dl className="profile-fields">
            {fields.map(([k, v, wide]) => (
              <div key={k} className={wide ? 'wide' : undefined}><dt>{k}</dt><dd>{v || '—'}</dd></div>
            ))}
          </dl>
        </div>
        {changing ? (
          <PhotoUpload targetId={ctx.uid} self currentUrl={photo.url} oldPath={photo.path}
            onCancel={() => setChanging(false)}
            onDone={(path) => { setChanging(false); setFlash(t('photoSaved')); photoUrl(path).then((url) => setPhoto({ path, url })) }} />
        ) : (
          <div className="row" style={{ marginBottom: 0 }}>
            <button className="btn ghost small" onClick={() => { setFlash(''); setChanging(true) }}>{t('photoChange')}</button>
            {flash && <span className="ok" role="status">{flash}</span>}
          </div>
        )}
        <p className="muted" style={{ marginTop: '.75rem' }}>
          {am ? 'የተሳሳተ መረጃ ካለ መረጃውን ማስተካከል የሚችሉት አባላት ብቻ ናቸው — አባሉን ያነጋግሩ። ፎቶዎን ግን እራስዎ መቀየር ይችላሉ።'
            : 'Only members can correct this information — ask a member if something is wrong. You can change your own photo.'}
        </p>
          </div>
        )}
      </div>

      {/* results */}
      <div className="row">
        <label>{t('year')}
          <select value={year} onChange={(e) => { picked.current = true; setYear(Number(e.target.value)) }}>
            {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>{t('term')}
          <select value={scope} onChange={(e) => setScope(e.target.value === 'year' ? 'year' : Number(e.target.value))}>
            <option value="year">{scopeName('year', lang)}</option>
            <option value={1}>{scopeName(1, lang)}</option>
            <option value={2}>{scopeName(2, lang)}</option>
          </select>
        </label>
      </div>
      {data.then && (
        <p className="muted" style={{ marginTop: '-.25rem' }}>
          {am ? `በ${year} ዓ/ም የነበሩበት ክፍል` : `Your grade in ${year}`}: <strong>{gradeLabel(data.then.grade, lang)}</strong> · {t('section')} {data.then.section}
          {data.then.grade !== student.grade && (am ? ' (የቀድሞ ክፍል)' : ' (previous grade)')}
        </p>
      )}

      {card.rows.length === 0 ? (
        <div className="panel"><p>{t('noResults')}</p></div>
      ) : (
        <>
          <div className="summary">
            <div><div className="avg-num">{card.yearly ?? '—'}<span className="muted" style={{ fontSize: '1.2rem' }}>%</span></div><div className="muted">{t('average')} · {scopeName(scope, lang)}</div></div>
            {rank && <div><div className="rank-num">{rank.rank}<span className="muted" style={{ fontSize: '1.2rem' }}> / {rank.class_size}</span></div><div className="muted">{t('rank')} · {scopeName(scope, lang)}</div></div>}
          </div>
          <div className="panel scroll">
            <table>
              <thead><tr><th>{t('subject')}</th><th>{t('term')}</th><th className="num">{am ? 'ውጤት ከ 100' : 'Mark / 100'}</th></tr></thead>
              <tbody>
                {card.rows.map((r) => (
                  <tr key={r.subject.id}>
                    <td><button className="link" onClick={() => setOpen(r.subject)}>{lang === 'en' && r.subject.name_en ? r.subject.name_en : r.subject.name_am}</button></td>
                    <td>{[r.t1 != null && 1, r.t2 != null && 2].filter(Boolean).join(' · ')}</td>
                    <td className="num">{r.avg ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {scope === 'year' && <p className="muted">{t('status')}: {t('res_' + card.status)} ({t('passMark')} {ctx.passMark}%)</p>}
          </div>
        </>
      )}
    </>
  )
}
