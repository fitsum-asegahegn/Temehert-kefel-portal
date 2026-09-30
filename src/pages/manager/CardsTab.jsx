import { useEffect, useMemo, useState } from 'react'
import { supabase, fetchAll } from '../../lib/supabase.js'
import { GRADES, gradeLabel } from '../../lib/grades.js'
import { buildCard } from '../../lib/calc.js'
import { useI18n } from '../../i18n.jsx'
import ReportCard from '../../components/ReportCard.jsx'

// Report cards for: every grade, one grade, or hand-picked students. Approved marks only.
export default function CardsTab({ ctx }) {
  const { t, lang } = useI18n()
  const [year, setYear] = useState(ctx.year)
  const [mode, setMode] = useState('grade')      // all | grade | selected
  const [grade, setGrade] = useState(5)
  const [all, setAll] = useState([])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(new Set())
  const [cards, setCards] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetchAll(() => supabase.from('students').select('id, full_name, code, grade, section').order('grade').order('full_name'))
      .then(setAll).catch((e) => setMsg(e.message))
  }, [])

  const shown = useMemo(() => all.filter((s) => !q || (s.full_name + s.code).toLowerCase().includes(q.toLowerCase())).slice(0, 150), [all, q])

  async function generate() {
    setBusy(true); setMsg(''); setCards(null)
    try {
      let marks = await fetchAll(() => {
        let b = supabase.from('marks').select('*').eq('year', year).eq('status', 'approved')
        if (mode === 'grade') b = b.eq('grade', grade)
        return b
      })
      if (mode === 'selected') marks = marks.filter((m) => picked.has(m.student_id))
      if (!marks.length) { setBusy(false); return setMsg(t('noResults')) }

      const [subjects, students, conductRows] = await Promise.all([
        supabase.from('subjects').select('*').order('sort').order('id').then((r) => { if (r.error) throw r.error; return r.data }),
        fetchAll(() => supabase.from('students').select('*')),
        fetchAll(() => supabase.from('conduct').select('*').eq('year', year)),
      ])
      const stById = Object.fromEntries(students.map((s) => [s.id, s]))

      // One ranking call per (grade, section, term) that actually appears in the marks.
      const groups = new Map()
      for (const m of marks) groups.set(`${m.grade}|${m.section}`, { grade: m.grade, section: m.section })
      const rank = {} // student_id -> { 1, 2, y }
      for (const g of groups.values()) {
        for (const term of [1, 2, null]) {
          const { data, error } = await supabase.rpc('grade_ranking', { p_grade: g.grade, p_year: year, p_term: term, p_section: g.section })
          if (error) throw error
          for (const r of data) (rank[r.student_id] ??= {})[term ?? 'y'] = r
        }
      }

      const byStudent = new Map()
      for (const m of marks) (byStudent.get(m.student_id) ?? byStudent.set(m.student_id, []).get(m.student_id)).push(m)
      const out = [...byStudent.entries()].map(([id, ms]) => ({
        student: stById[id], gradeAt: ms[0].grade, sectionAt: ms[0].section, ranks: rank[id] || {},
        conduct: Object.fromEntries(conductRows.filter((c) => c.student_id === id).map((c) => [c.term, c.value])),
        card: buildCard({ subjects, marks: ms, passMark: ctx.passMark }),
      })).filter((c) => c.student)
      out.sort((a, b) => a.gradeAt - b.gradeAt || a.sectionAt.localeCompare(b.sectionAt) || a.student.full_name.localeCompare(b.student.full_name))
      setCards(out)
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }

  return (
    <>
      <div className="panel no-print">
        <div className="row">
          <label>{t('year')}<input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: '6rem' }} /></label>
          <label>{lang === 'am' ? 'ለማን' : 'For'}
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="all">{lang === 'am' ? 'ሁሉም ክፍሎች' : 'All grades'}</option>
              <option value="grade">{lang === 'am' ? 'አንድ ክፍል' : 'One grade'}</option>
              <option value="selected">{lang === 'am' ? 'የተመረጡ ተማሪዎች' : 'Selected students'}</option>
            </select>
          </label>
          {mode === 'grade' && (
            <label>{t('grade')}
              <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>{GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g, lang)}</option>)}</select>
            </label>
          )}
          <button className="btn" disabled={busy || (mode === 'selected' && !picked.size)} onClick={generate}>
            {busy ? t('loading') : (lang === 'am' ? 'ካርድ አውጣ' : 'Generate')}
          </button>
          {cards && <button className="btn ghost" onClick={() => window.print()}>{t('print')} ({cards.length})</button>}
        </div>
        {msg && <p className="err" role="alert">{msg}</p>}

        {mode === 'selected' && (
          <>
            <div className="row">
              <label>🔍<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
              <span className="muted">{picked.size} ✓</span>
              <button className="btn ghost small" onClick={() => setPicked(new Set())}>{lang === 'am' ? 'ምርጫ አጽዳ' : 'Clear'}</button>
            </div>
            <div className="scroll" style={{ maxHeight: '20rem', overflowY: 'auto' }}>
              <table><tbody>
                {shown.map((s) => (
                  <tr key={s.id}>
                    <td><input type="checkbox" checked={picked.has(s.id)} aria-label={s.full_name}
                      onChange={() => { const n = new Set(picked); n.has(s.id) ? n.delete(s.id) : n.add(s.id); setPicked(n) }} /></td>
                    <td>{s.full_name}</td><td>{s.code}</td><td>{gradeLabel(s.grade, lang)}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </>
        )}
      </div>

      {cards?.map((c) => (
        <div className="card-page" key={c.student.id}>
          <ReportCard
            school={ctx.school} student={{ ...c.student, section: c.sectionAt }} year={year}
            gradeText={gradeLabel(c.gradeAt, lang)} card={c.card} ranks={c.ranks} conduct={c.conduct} passMark={ctx.passMark}
          />
        </div>
      ))}
    </>
  )
}
