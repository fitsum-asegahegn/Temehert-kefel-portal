import { parseTiming, ethToDate, daysInMonth, dateToEth, startOfDay } from './ethiopian.js'

const monthEnd = (y, m) => ethToDate(y, m, daysInMonth(y, m))

// All due dates of an item inside Ethiopian year `y`, oldest first.
//  - named month + day  -> that day;  named month only -> last day of the month ("by end of month")
//  - "ከX እስከ Y" range  -> one due date per month when the target equals the number of months
//    (e.g. 12 monthly meetings), otherwise a single due date at the end of Y
export function occurrences(item, y) {
  const p = parseTiming(item.timing)
  if (p.kind === 'none') return []
  if (p.kind === 'points') {
    return p.points.map((x) => ethToDate(y, x.m, x.d ?? daysInMonth(y, x.m))).sort((a, b) => a - b)
  }
  const months = []
  for (let m = p.from; m <= p.to; m++) months.push(m)
  const target = Number(String(item.target ?? '').replace('%', ''))
  return target === months.length ? months.map((m) => monthEnd(y, m)) : [monthEnd(y, p.to)]
}

export const planYearRange = (y) => [ethToDate(y, 1, 1), monthEnd(y, 13)]

// log rows: [{ done_on: 'YYYY-MM-DD' }].  Returns schedule facts for one item.
export function scheduleFor(item, logs, y, today = startOfDay()) {
  const occ = occurrences(item, y)
  const [from, to] = planYearRange(y)
  const done = logs.filter((l) => {
    const [yy, mm, dd] = l.done_on.split('-').map(Number)
    const d = new Date(yy, mm - 1, dd)
    return d >= from && d <= to
  }).length
  const next = done < occ.length ? occ[done] : null
  const status = !occ.length ? 'manual' : done >= occ.length ? 'done' : next < today ? 'overdue' : (next - today) / 86400000 <= 14 ? 'soon' : 'ontrack'
  return { occ, done, expected: occ.length, next, status }
}

export const currentEthYear = (today = startOfDay()) => dateToEth(today).y
