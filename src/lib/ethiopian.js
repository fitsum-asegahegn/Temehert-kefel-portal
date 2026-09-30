// Exact Ethiopian <-> Gregorian conversion (Julian Day Number based) + month-name parsing.
export const MONTHS = ['መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን']
// Spellings that appear in real documents (longest alternatives first).
const ALIASES = [
  ['መስከረም'], ['ጥቅምት'], ['ህዳር', 'ኅዳር', 'ሕዳር', 'ሀዳር'], ['ታህሳስ', 'ታኅሣሥ', 'ታሕሳስ'], ['ጥር'], ['የካቲት'],
  ['መጋቢት'], ['ሚያዝያ', 'ሚያዚያ'], ['ግንቦት'], ['ሰኔ'], ['ሐምሌ', 'ሃምሌ', 'ሀምሌ'], ['ነሐሴ', 'ነሃሴ'], ['ጳጉሜን', 'ጳጉሜ'],
]
const EPOCH = 1723856

export const isLeap = (y) => (y + 1) % 4 === 0
export const daysInMonth = (y, m) => (m < 13 ? 30 : isLeap(y) ? 6 : 5)

const ethToJdn = (y, m, d) => EPOCH + 365 + 365 * (y - 1) + Math.floor(y / 4) + 30 * m + d - 31
function jdnToEth(jdn) {
  const r = (jdn - EPOCH) % 1461
  const n = (r % 365) + 365 * Math.floor(r / 1460)
  return { y: 4 * Math.floor((jdn - EPOCH) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460), m: Math.floor(n / 30) + 1, d: (n % 30) + 1 }
}
const UNIX_JDN = 2440588
const dayNum = (date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)

// Dates are plain local calendar days; the returned Date is local midnight.
export function ethToDate(y, m, d) {
  const t = new Date((ethToJdn(y, m, d) - UNIX_JDN) * 86400000)
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}
export const dateToEth = (date) => jdnToEth(dayNum(date) + UNIX_JDN)
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const fmtEth = (e) => `${e.d} ${MONTHS[e.m - 1]} ${e.y}`
export const fmtBoth = (date) => `${fmtEth(dateToEth(date))} (${isoDate(date)})`
export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

// ---- month-name parsing of free "timing" text ----
const MONTH_RE = ALIASES.map((a, i) => a.map((n) => [n, i + 1])).flat().sort((x, y) => y[0].length - x[0].length)
function findMonths(text) {
  const hits = []
  let s = text
  for (const [name, m] of MONTH_RE) {
    let from = 0
    for (;;) {
      const i = s.indexOf(name, from)
      if (i < 0) break
      hits.push({ i, len: name.length, m })
      s = s.slice(0, i) + '#'.repeat(name.length) + s.slice(i + name.length) // stop shorter aliases matching inside
      from = i + name.length
    }
  }
  return hits.sort((a, b) => a.i - b.i)
}

// -> { kind:'none' } | { kind:'points', points:[{m, d|null}] } | { kind:'range', from, to }
export function parseTiming(text) {
  const t = String(text ?? '')
  const hits = findMonths(t)
  if (!hits.length) return { kind: 'none' }
  const between = hits.length >= 2 ? t.slice(hits[0].i + hits[0].len, hits[1].i) : ''
  if (hits.length === 2 && /^\s*(እስከ|-|–|—)\s*$/.test(between)) return { kind: 'range', from: hits[0].m, to: hits[1].m }
  const points = hits.map((h) => {
    const after = t.slice(h.i + h.len)
    const dm = after.match(/^[\s(]*(\d{1,2})(?!\d|ቱ)/) // "13", "(23)", but not "4ቱን"
    const d = dm ? Number(dm[1]) : null
    return { m: h.m, d: d && d >= 1 && d <= 30 ? d : null }
  })
  return { kind: 'points', points }
}
