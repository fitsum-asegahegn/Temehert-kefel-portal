import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { PLAN_SEED } from '../../lib/planSeed.js'
import { scheduleFor } from '../../lib/planSchedule.js'
import { fmtBoth, fmtEth, dateToEth, startOfDay } from '../../lib/ethiopian.js'
import { exportPlan, parsePlanSheet } from '../../lib/planExcel.js'
import { useI18n } from '../../i18n.jsx'

const ORDER = { overdue: 0, soon: 1, ontrack: 2, manual: 3, done: 4 }

export default function PlanTab({ ctx }) {
  const { t, lang } = useI18n()
  const [items, setItems] = useState(null)
  const [logs, setLogs] = useState([])
  const [msg, setMsg] = useState({ text: '', bad: false })
  const today = startOfDay()
  const fail = (e) => setMsg({ text: e.message, bad: true })

  async function load() {
    const [it, lg] = await Promise.all([
      supabase.from('plan_items').select('*').eq('year', ctx.year).order('sort').order('id'),
      supabase.from('plan_log').select('*').order('done_on', { ascending: false }),
    ])
    if (it.error || lg.error) return fail(it.error || lg.error)
    if (!it.data.length) { // first visit this year: seed the department's plan
      const { error } = await supabase.from('plan_items').insert(PLAN_SEED.map((x) => ({ ...x, year: ctx.year })))
      if (error) return fail(error)
      return load()
    }
    setItems(it.data); setLogs(lg.data)
  }
  useEffect(() => { load() }, [])

  const rows = useMemo(() => (items || []).map((it) => {
    const own = logs.filter((l) => l.item_id === it.id)
    return { it, own, s: scheduleFor(it, own, ctx.year, today) }
  }).sort((a, b) => ORDER[a.s.status] - ORDER[b.s.status] || (a.s.next ?? 0) - (b.s.next ?? 0) || a.it.sort - b.it.sort), [items, logs])

  async function markDone(r) {
    const note = window.prompt(lang === 'am' ? 'አጭር ማስታወሻ (ለምሳሌ: ለ12 አባላት ተሰጠ)' : 'Short note (e.g. given to 12 members)', '')
    if (note === null) return
    const { error } = await supabase.from('plan_log').insert({ item_id: r.it.id, note: note.trim() || null, by_name: ctx.me.name })
    if (error) return fail(error)
    load()
  }
  async function undo(logId) {
    const { error } = await supabase.from('plan_log').delete().eq('id', logId)
    if (error) return fail(error)
    load()
  }
  async function editTiming(r) {
    const v = window.prompt(lang === 'am' ? 'የጊዜ ገደብ (ወር ስም ይጻፉ፣ ለምሳሌ: ታህሳስ፣ መጋቢት 27)' : 'Timing (write month names, e.g. ታህሳስ፣ መጋቢት 27)', r.it.timing || '')
    if (v === null) return
    const { error } = await supabase.from('plan_items').update({ timing: v.trim() }).eq('id', r.it.id)
    if (error) return fail(error)
    load()
  }
  async function importXlsx(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const list = await parsePlanSheet(file)
      if (!list.length) return fail(new Error(lang === 'am' ? 'ምንም ረድፍ አልተገኘም' : 'No rows found'))
      const byTitle = Object.fromEntries(items.map((i) => [i.title.trim(), i]))
      let added = 0, updated = 0
      for (const x of list) {
        const { no, ...fields } = x
        const hit = byTitle[x.title.trim()]
        const res = hit
          ? await supabase.from('plan_items').update({ ...fields, no }).eq('id', hit.id)
          : await supabase.from('plan_items').insert({ ...fields, no, year: ctx.year, sort: 100 + added })
        if (res.error) throw res.error
        hit ? updated++ : added++
      }
      setMsg({ text: `+${added} · ↻${updated}`, bad: false }); load()
    } catch (e2) { fail(e2) }
  }
  async function reset() {
    if (!window.confirm(lang === 'am' ? 'ወደ መጀመሪያው ዕቅድ ይመለስ? ማሻሻያዎችና የተከናወነ መዝገብ ይጠፋሉ።' : 'Restore the original plan? Edits and the done-history will be lost.')) return
    const del = await supabase.from('plan_items').delete().eq('year', ctx.year)
    if (del.error) return fail(del.error)
    load()
  }

  if (!items) return msg.text ? <p className="err">{msg.text}</p> : <p className="muted">{t('loading')}</p>

  const label = { overdue: lang === 'am' ? 'ዘግይቷል' : 'Overdue', soon: lang === 'am' ? 'በቅርብ' : 'Due soon', ontrack: lang === 'am' ? 'በሂደት' : 'On track', manual: lang === 'am' ? 'ቀን የለም' : 'No date', done: lang === 'am' ? 'ተጠናቋል' : 'Done' }
  const total = rows.reduce((s, r) => s + r.s.expected, 0)
  const done = rows.reduce((s, r) => s + Math.min(r.s.done, r.s.expected), 0)

  return (
    <>
      <div className="row no-print">
        <div style={{ flex: 1 }}>
          <strong>{t('tab_plan')} {ctx.year} ዓ/ም</strong>
          <div className="muted">{lang === 'am' ? 'ዛሬ' : 'Today'}: {fmtBoth(today)} · {done}/{total}</div>
        </div>
        <button className="btn ghost small" onClick={() => exportPlan(items, ctx.year)}>Excel ⬇</button>
        <label className="btn ghost small" style={{ cursor: 'pointer', flexDirection: 'row', color: 'var(--ink)' }}>Excel ⬆<input type="file" accept=".xlsx,.xls" hidden onChange={importXlsx} /></label>
        {ctx.me.role === 'admin' && <button className="btn ghost small" onClick={reset}>{lang === 'am' ? 'ወደ መጀመሪያው መልስ' : 'Reset to original'}</button>}
      </div>
      {msg.text && <p className={msg.bad ? 'err' : 'ok'} role="status">{msg.text}</p>}

      {rows.map((r) => (
        <div className="panel plan-item" key={r.it.id}>
          <div className="row" style={{ marginBottom: '.25rem' }}>
            <strong style={{ flex: 1 }}>{r.it.no}. {r.it.title}</strong>
            <span className={'pill plan-' + r.s.status}>{label[r.s.status]}</span>
          </div>
          <div className="muted">
            {r.s.next ? <>{lang === 'am' ? 'የሚቀጥለው' : 'Next'}: <strong>{fmtBoth(r.s.next)}</strong> · </> : null}
            {r.s.expected ? `${r.s.done}/${r.s.expected}` : (lang === 'am' ? 'በእጅ ክትትል' : 'manual tracking')}
            {r.it.weight ? ` · ${r.it.weight}` : ''}{r.it.timing ? ` · ${r.it.timing}` : ''}
          </div>
          <details style={{ margin: '.5rem 0' }}>
            <summary className="muted">{lang === 'am' ? 'ዝርዝር' : 'Details'}</summary>
            {r.it.details && <p>{r.it.details}</p>}
            {r.it.description && <p className="muted">{r.it.description}</p>}
            <p className="muted">
              {[r.it.unit && `${t('planUnit')}: ${r.it.unit}`, r.it.target && `${t('planTarget')}: ${r.it.target}`, r.it.budget && `${t('planBudget')}: ${r.it.budget}`].filter(Boolean).join(' · ')}
            </p>
            {r.it.executor && <p className="muted">{r.it.executor}</p>}
            {r.own.map((l) => (
              <div key={l.id} className="muted">✓ {fmtEth(dateToEth(new Date(l.done_on + 'T00:00:00')))} ({l.done_on}){l.by_name ? ` · ${l.by_name}` : ''}{l.note ? ` — ${l.note}` : ''}{' '}
                <button className="btn ghost small" onClick={() => undo(l.id)}>↶</button></div>
            ))}
          </details>
          <div className="row no-print" style={{ marginBottom: 0 }}>
            <button className="btn small" onClick={() => markDone(r)}>{lang === 'am' ? 'ተከናውኗል ✓' : 'Done ✓'}</button>
            <button className="btn ghost small" onClick={() => editTiming(r)}>{lang === 'am' ? 'ጊዜ አስተካክል' : 'Edit timing'}</button>
          </div>
        </div>
      ))}
    </>
  )
}
