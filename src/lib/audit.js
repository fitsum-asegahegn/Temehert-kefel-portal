import { gradeLabel } from './grades.js'

// Turns an audit_log row into a plain sentence (Amharic or English).
export const CATEGORIES = [
  ['', { am: 'ሁሉም', en: 'Everything' }],
  ['marks', { am: 'ውጤቶች', en: 'Marks' }],
  ['results', { am: 'ልቀት', en: 'Release' }],
  ['student', { am: 'ተማሪዎች', en: 'Students' }],
  ['user', { am: 'መለያዎች', en: 'Accounts' }],
  ['password', { am: 'የይለፍ ቃል', en: 'Passwords' }],
  ['role', { am: 'ሚናዎች', en: 'Roles' }],
  ['subject', { am: 'ትምህርቶች', en: 'Courses' }],
  ['assignment', { am: 'የመምህር ምደባ', en: 'Teaching' }],
  ['assessment', { am: 'የውጤት አካላት', en: 'Assessments' }],
  ['settings', { am: 'ቅንብር', en: 'Settings' }],
]

const STATUS = {
  draft: { am: 'ረቂቅ', en: 'draft' }, submitted: { am: 'ለግምገማ የቀረበ', en: 'submitted' }, approved: { am: 'የጸደቀ', en: 'approved' },
}
const FIELD = {
  full_name: { am: 'ስም', en: 'name' }, grade: { am: 'ክፍል', en: 'grade' }, section: { am: 'ክፍለ', en: 'section' }, active: { am: 'ንቁ', en: 'active' },
  gender: { am: 'ጾታ', en: 'gender' }, christian_name: { am: 'የክርስትና ስም', en: 'Christian name' }, parish: { am: 'አጥቢያ', en: 'parish' },
  address: { am: 'አድራሻ', en: 'address' }, city: { am: 'ከተማ', en: 'city' }, kebele: { am: 'ቀበሌ', en: 'kebele' },
  guardian_name: { am: 'የወላጅ ስም', en: 'guardian' }, guardian_phone: { am: 'የወላጅ ስልክ', en: 'guardian phone' },
}

export function describe(row, lang = 'am') {
  const d = row.details || {}
  const am = lang === 'am'
  const g = (n) => gradeLabel(n, lang)
  const sem = (t) => (am ? `${t}ኛ መንፈቀ ዓመት` : `semester ${t}`)
  const st = (s) => STATUS[s]?.[lang] ?? s
  switch (row.action) {
    case 'marks.change':
      return am
        ? `${d.count} ውጤቶች "${st(d.from)}" ወደ "${st(d.to)}" ተቀየሩ — ${d.subject}፣ ${g(d.grade)}፣ ${d.year} ዓ/ም ${sem(d.term)}${d.score_changed ? ' (ነጥብም ተቀይሯል)' : ''}`
        : `${d.count} marks changed from "${st(d.from)}" to "${st(d.to)}" — ${d.subject}, ${g(d.grade)}, ${d.year} ${sem(d.term)}${d.score_changed ? ' (scores changed too)' : ''}`
    case 'marks.delete':
      return am ? `${d.count} ውጤቶች ተሰረዙ — ${d.subject}፣ ${g(d.grade)}፣ ${d.year} ዓ/ም ${sem(d.term)}` : `${d.count} marks deleted — ${d.subject}, ${g(d.grade)}, ${d.year} ${sem(d.term)}`
    case 'results.release':
      return am ? `ውጤት ለተማሪዎች ተለቀቀ — ${g(d.grade)}፣ ${d.year} ዓ/ም ${sem(d.term)}` : `Results released to students — ${g(d.grade)}, ${d.year} ${sem(d.term)}`
    case 'results.unrelease':
      return am ? `ልቀቱ ተነሳ — ${g(d.grade)}፣ ${d.year} ዓ/ም ${sem(d.term)}` : `Release taken back — ${g(d.grade)}, ${d.year} ${sem(d.term)}`
    case 'role.change':
      return am ? `የ${d.name} ሚና ተቀየረ: ${d.from} → ${d.to}` : `Role of ${d.name} changed: ${d.from} → ${d.to}`
    case 'student.edit': {
      const keys = Object.keys(d.changes || {}).map((k) => FIELD[k]?.[lang] ?? k).join(am ? '፣ ' : ', ')
      return am ? `የ${d.name} (${d.code}) መረጃ ተስተካከለ: ${keys}` : `Details of ${d.name} (${d.code}) edited: ${keys}`
    }
    case 'student.create':
      return am ? `${d.count} አዳዲስ ተማሪዎች ተፈጠሩ${d.grades?.length ? ` — ${d.grades.map(g).join('፣ ')}` : ''}` : `${d.count} new students created${d.grades?.length ? ` — ${d.grades.map(g).join(', ')}` : ''}`
    case 'student.promote':
      return d.graduated
        ? (am ? `${d.count} ተማሪዎች ተመረቁ` : `${d.count} students graduated`)
        : (am ? `${d.count} ተማሪዎች ወደ ${g(d.to_grade)} ተሸጋገሩ` : `${d.count} students promoted to ${g(d.to_grade)}`)
    case 'user.delete':
      return am ? `${d.count} መለያዎች ተሰረዙ: ${(d.names || []).join('፣ ')}` : `${d.count} accounts deleted: ${(d.names || []).join(', ')}`
    case 'password.reset':
      return am ? `የ${d.name} የይለፍ ቃል ተቀየረ` : `Password reset for ${d.name}`
    case 'staff.create':
      return am ? `አዲስ ${d.role}: ${d.name}` : `New ${d.role} created: ${d.name}`
    case 'subject.add':
      return am ? `ትምህርት ተጨመረ: ${d.name} (${d.term ? sem(d.term) : '—'})` : `Course added: ${d.name} (${d.term ? sem(d.term) : '—'})`
    case 'subject.edit':
      return am ? `ትምህርት ተስተካከለ: ${d.name}` : `Course edited: ${d.name}`
    case 'subject.delete':
      return am ? `ትምህርት ተሰረዘ: ${d.name}` : `Course deleted: ${d.name}`
    case 'assignment.add':
      return am ? `${d.teacher} ለ${d.subject} (${g(d.grade)}) ተመደበ` : `${d.teacher} assigned to ${d.subject} (${g(d.grade)})`
    case 'assignment.remove':
      return am ? `${d.teacher} ከ${d.subject} (${g(d.grade)}) ተነሳ` : `${d.teacher} removed from ${d.subject} (${g(d.grade)})`
    case 'assessment.delete':
      return am ? `የውጤት አካል ተሰረዘ: ${d.name} — ${d.subject}፣ ${g(d.grade)}` : `Assessment deleted: ${d.name} — ${d.subject}, ${g(d.grade)}`
    case 'settings.change':
      return am ? `ቅንብር ተቀየረ: ${d.key} = ${d.to ?? ''}${d.from != null ? ` (ቀድሞ: ${d.from})` : ''}` : `Setting changed: ${d.key} = ${d.to ?? ''}${d.from != null ? ` (was: ${d.from})` : ''}`
    default:
      return `${row.action} ${JSON.stringify(d)}`
  }
}
