// Mirrors the SQL ranking maths: each subject becomes a percentage of its max score,
// a term average is the mean of those, and the yearly average is the mean of the terms.
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const sum = (a) => a.reduce((x, y) => x + y, 0)
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100)

export function buildCard({ subjects, marks, passMark = 50 }) {
  const rows = subjects
    .filter((s) => marks.some((m) => m.subject_id === s.id))
    .map((s) => {
      const t1 = marks.find((m) => m.subject_id === s.id && m.term === 1)?.score ?? null
      const t2 = marks.find((m) => m.subject_id === s.id && m.term === 2)?.score ?? null
      const pcts = [t1, t2].filter((v) => v != null).map((v) => (Number(v) / Number(s.max_score)) * 100)
      return { subject: s, max: Number(s.max_score), t1: t1 == null ? null : Number(t1), t2: t2 == null ? null : Number(t2), avg: round2(mean(pcts)) }
    })

  const termStats = (n) => {
    const items = rows.filter((r) => r['t' + n] != null)
    if (!items.length) return null
    return {
      total: sum(items.map((r) => r['t' + n])),
      maxTotal: sum(items.map((r) => r.max)),
      raw: mean(items.map((r) => (r['t' + n] / r.max) * 100)),
    }
  }
  const s1 = termStats(1)
  const s2 = termStats(2)
  const avg1 = round2(s1?.raw ?? null)
  const avg2 = round2(s2?.raw ?? null)
  const yearlyRaw = mean([s1?.raw, s2?.raw].filter((v) => v != null))
  const yearly = round2(yearlyRaw)
  const status = !s1 || !s2 ? 'incomplete' : yearly >= passMark ? 'promoted' : 'repeat'
  return { rows, s1: s1 && { ...s1, average: avg1 }, s2: s2 && { ...s2, average: avg2 }, yearly, status }
}
