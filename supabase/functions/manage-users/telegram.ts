// Pure helpers for the Telegram results message (kept separate so they can be tested without Deno).
const GRADE_NAMES: Record<number, string> = { 7: 'ቀዳማይ', 8: 'ካልዓይ', 9: 'ሳልሳይ', 10: 'ራብዓይ', 11: 'ሀምሳይ', 12: 'ሳድሳይ' }
export const gradeText = (g: number) => GRADE_NAMES[g] ?? `${g}ኛ ክፍል`

type Mark = { student_id: string; subject_id: number; score: number; section: string }
type Subject = { id: number; name_am: string; max_score: number }
type Student = { id: string; full_name: string }
type Link = { user_id: string; chat_id: number }
type ParentLink = { parent_id: string; student_id: string }

export interface Msg { chat_id: number; student_id: string; text: string }

// One message per (student, Telegram chat): the student's own chat(s) and their parents' chat(s).
// average / rank use the same maths as the app: each course as % of its max, mean of the courses, rank inside the section, ties share.
export function buildResultMessages(o: {
  year: number; term: number; grade: number; marks: Mark[]; subjects: Subject[]; students: Student[]
  parentLinks: ParentLink[]; links: Link[]; school?: string; appUrl?: string
}) {
  const sub = new Map(o.subjects.map((s) => [s.id, s]))
  const stu = new Map(o.students.map((s) => [s.id, s]))
  const by = new Map<string, { section: string; marks: Mark[] }>()
  for (const m of o.marks) {
    if (!by.has(m.student_id)) by.set(m.student_id, { section: m.section, marks: [] })
    by.get(m.student_id)!.marks.push(m)
  }
  const rows = [...by].map(([id, v]) => {
    const pcts = v.marks.map((m) => (Number(m.score) / Number(sub.get(m.subject_id)?.max_score ?? 100)) * 100)
    const average = Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) / 100
    return { id, section: v.section, marks: v.marks, average }
  })
  const rank = (r: { id: string; section: string; average: number }) => 1 + rows.filter((x) => x.section === r.section && x.average > r.average).length
  const size = (sec: string) => rows.filter((x) => x.section === sec).length

  const parentsOf = new Map<string, string[]>()
  for (const p of o.parentLinks) parentsOf.set(p.student_id, [...(parentsOf.get(p.student_id) ?? []), p.parent_id])
  const chatsOf = new Map<string, Set<number>>()
  for (const l of o.links) { if (!chatsOf.has(l.user_id)) chatsOf.set(l.user_id, new Set()); chatsOf.get(l.user_id)!.add(Number(l.chat_id)) }

  const messages: Msg[] = []
  let withoutLink = 0
  for (const r of rows) {
    const st = stu.get(r.id); if (!st) continue
    const chats = new Set<number>()
    for (const uid of [r.id, ...(parentsOf.get(r.id) ?? [])]) for (const c of chatsOf.get(uid) ?? []) chats.add(c)
    if (!chats.size) { withoutLink++; continue }
    const lines = r.marks
      .sort((a, b) => (sub.get(a.subject_id)?.name_am ?? '').localeCompare(sub.get(b.subject_id)?.name_am ?? ''))
      .map((m) => `• ${sub.get(m.subject_id)?.name_am ?? ''} — ${Math.round((Number(m.score) / Number(sub.get(m.subject_id)?.max_score ?? 100)) * 10000) / 100}`)
    const text = [
      `📣 ${o.school ?? 'ፍኖተ ጥበብ ሰንበት ትምህርት ቤት'} — የውጤት ማስታወቂያ`,
      `${st.full_name} · ${gradeText(o.grade)} · ${o.year} ዓ/ም ${o.term}ኛ መንፈቀ ዓመት`,
      `አማካይ: ${r.average}% · ደረጃ: ${rank(r)} / ${size(r.section)}`,
      '', ...lines, '',
      o.appUrl ? `ሙሉ ዝርዝር: ${o.appUrl}` : 'ሙሉ ዝርዝር በመተግበሪያው ይመልከቱ።',
    ].join('\n')
    for (const c of chats) messages.push({ chat_id: c, student_id: r.id, text })
  }
  return { messages, students: rows.length, withoutLink }
}
