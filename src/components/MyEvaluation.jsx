import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useI18n } from '../i18n.jsx'
import EvalSummary from './EvalSummary.jsx'

// Teacher side: only the teacher's own results, anonymous, 3+ answers.
export default function MyEvaluation({ ctx }) {
  const { lang } = useI18n()
  const am = lang === 'am'
  const [year, setYear] = useState(ctx.year)
  const [term, setTerm] = useState(1)
  const [rows, setRows] = useState(null)
  useEffect(() => {
    setRows(null)
    supabase.rpc('evaluation_summary', { p_year: year, p_term: term }).then(({ data }) => setRows(data || []))
  }, [year, term])
  return (
    <details className="panel" style={{ marginTop: '1rem' }}>
      <summary><strong>{am ? 'የተማሪዎች ግምገማ ስለ እኔ' : 'How students rated me'}</strong></summary>
      <div className="row" style={{ marginTop: '.75rem' }}>
        <label>{am ? 'ዓመት' : 'Year'}<input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: '6rem' }} /></label>
        <label>{am ? 'መንፈቀ ዓመት' : 'Semester'}<select value={term} onChange={(e) => setTerm(Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option></select></label>
      </div>
      {rows ? <EvalSummary rows={rows} year={year} term={term} isManager={false} /> : <p className="muted">…</p>}
    </details>
  )
}
