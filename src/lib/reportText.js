import { gradeLabel } from './grades.js'

const en = (l) => l === 'en'
export const scopeName = (scope, l) =>
  scope === 'year' ? (en(l) ? 'Yearly' : 'ዓመታዊ') : scope === 1 ? (en(l) ? 'Semester 1' : '1ኛ መንፈቀ ዓመት') : (en(l) ? 'Semester 2' : '2ኛ መንፈቀ ዓመት')

export const H = (l) => ({
  title: (y, s) => (en(l) ? `Academic results report — ${y} E.C. — ${scopeName(s, l)}` : `የ${y} ዓ/ም የትምህርት ውጤት ሪፖርት — ${scopeName(s, l)}`),
  grade: en(l) ? 'Grade' : 'ክፍል',
  assessed: en(l) ? 'Students' : 'ተማሪዎች',
  avg: en(l) ? 'Average %' : 'አማካይ %',
  passed: en(l) ? 'Passed' : 'ያለፉ',
  failed: en(l) ? 'Below pass mark' : 'ከማለፊያ በታች',
  incomplete: en(l) ? 'Incomplete' : 'ያልተሟላ',
  passRate: en(l) ? 'Pass rate %' : 'የማለፍ መጠን %',
  top: en(l) ? 'Top student' : 'የመጀመሪያ ደረጃ',
  subject: en(l) ? 'Subject' : 'ትምህርት',
  overall: en(l) ? 'Overall' : 'አጠቃላይ',
  summary: en(l) ? 'Summary' : 'ማጠቃለያ',
  byGrade: en(l) ? 'Results by grade' : 'በክፍል የውጤት ዝርዝር',
  subjects: en(l) ? 'Subject averages' : 'የትምህርት አማካዮች',
  passMark: en(l) ? 'Pass mark' : 'የማለፊያ ውጤት',
  noData: en(l) ? 'No approved marks for this period.' : 'ለዚህ ጊዜ የጸደቀ ውጤት የለም።',
})

// Plain-language comparison lines, e.g. "X had the highest average".
export function narrative(d, l) {
  const g = d.grades
  if (!g.length) return [H(l).noData]
  const name = (x) => gradeLabel(x.grade, l)
  const lines = [
    en(l)
      ? `${d.overall.assessed} students were assessed. The overall average was ${d.overall.avg}% and ${d.overall.passRate}% reached the pass mark of ${d.passMark}%.`
      : `${d.overall.assessed} ተማሪዎች ተገምግመዋል። አጠቃላይ አማካይ ${d.overall.avg}% ሲሆን ${d.overall.passRate}% የማለፊያ ውጤት (${d.passMark}%) አግኝተዋል።`,
  ]
  if (g.length > 1) {
    const by = [...g].sort((a, b) => b.avg - a.avg)
    const hi = by[0], lo = by[by.length - 1]
    lines.push(en(l)
      ? `${name(hi)} had the highest average (${hi.avg}%) and ${name(lo)} the lowest (${lo.avg}%).`
      : `ከፍተኛው አማካይ በ${name(hi)} (${hi.avg}%)፣ ዝቅተኛው በ${name(lo)} (${lo.avg}%) ተመዝግቧል።`)
    const weak = g.filter((x) => x.passRate < 60)
    if (weak.length) lines.push(en(l)
      ? `Needs attention (pass rate under 60%): ${weak.map(name).join(', ')}.`
      : `ትኩረት የሚሹ (የማለፍ መጠን ከ60% በታች): ${weak.map(name).join('፣ ')}።`)
  }
  return lines
}
