import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { parseOpen } from '../../lib/evaluation.js'
import { useI18n } from '../../i18n.jsx'
import EvalSummary from '../../components/EvalSummary.jsx'

export default function EvaluationTab({ ctx }) {
  const { lang } = useI18n()
  const am = lang === 'am'
  const open = parseOpen(ctx.settings.evaluation_open)
  const [year, setYear] = useState(open?.year ?? ctx.year)
  const [term, setTerm] = useState(open?.term ?? 1)
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState({ text: '', bad: false })

  useEffect(() => {
    setRows(null)
    supabase.rpc('evaluation_summary', { p_year: year, p_term: term }).then(({ data, error }) => {
      if (error) setMsg({ text: error.message, bad: true })
      setRows(data || [])
    })
  }, [year, term])

  async function setOpen(value) {
    const { error } = await supabase.from('settings').upsert({ key: 'evaluation_open', value })
    if (error) return setMsg({ text: error.message, bad: true })
    ctx.setSettings((p) => ({ ...p, evaluation_open: value }))
    setMsg({ text: '✓', bad: false })
  }

  return (
    <>
      <div className="panel">
        <h2>{am ? 'የመምህራን ግምገማ' : 'Teacher evaluation'}</h2>
        <p className="muted">
          {am ? 'ሲከፍቱ ተማሪዎች የክፍላቸውን መምህራን (ለዚያ መንፈቀ ዓመት የተመደቡትን) ማስመስከር ይችላሉ። ግምገማው ስም-አልባ ነው፤ ቢያንስ 3 መልሶች ሲኖሩ ብቻ ውጤት ይታያል።'
            : "While it is open, students can rate the teachers of their grade (for that semester's courses). It is anonymous; results show only with at least 3 answers."}
        </p>
        <p className={open ? 'ok' : 'muted'}>
          {open ? (am ? `ክፍት ነው: ${open.year} ዓ/ም፣ ${open.term}ኛ መንፈቀ ዓመት` : `OPEN: ${open.year}, semester ${open.term}`) : (am ? 'ዝግ ነው።' : 'Closed.')}
        </p>
        <div className="row">
          <label>{am ? 'ዓመት' : 'Year'}<input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: '6rem' }} /></label>
          <label>{am ? 'መንፈቀ ዓመት' : 'Semester'}<select value={term} onChange={(e) => setTerm(Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option></select></label>
          <button className="btn" onClick={() => setOpen(`${year}-${term}`)}>{am ? 'ለተማሪዎች ክፈት' : 'Open for students'}</button>
          {open && <button className="btn ghost" onClick={() => setOpen('')}>{am ? 'ዝጋ' : 'Close'}</button>}
        </div>
        {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}
      </div>
      <h3>{am ? `ውጤት — ${year} ዓ/ም፣ ${term}ኛ መንፈቀ ዓመት` : `Results — ${year}, semester ${term}`}</h3>
      {rows ? <EvalSummary rows={rows} year={year} term={term} isManager /> : <p className="muted">…</p>}
    </>
  )
}
