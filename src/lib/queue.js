// Offline write queue: pure logic, no app imports (so it can be tested on its own).
// Writes made without internet are kept on the phone as small row-level operations and sent later, in order.
//   { t: 'upsert', table, row, onConflict }   |   { t: 'delete', table, match }

const K = (uid) => `fts-queue:${uid}`
const KF = (uid) => `fts-failed:${uid}`
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
const write = (k, v) => {
  if (v.length) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k)
  globalThis.window?.dispatchEvent(new Event('fts-queue-changed'))
}

export const getQueue = (uid) => read(K(uid))
export const setQueue = (uid, ops) => write(K(uid), ops)
export const enqueue = (uid, ops) => setQueue(uid, [...getQueue(uid), ...ops])
export const getFailed = (uid) => read(KF(uid))
export const addFailed = (uid, items) => write(KF(uid), [...getFailed(uid), ...items])
export const clearFailed = (uid) => write(KF(uid), [])

// "Try again later" errors (no network, expired token, offline marker) vs. real rejections (rules, locked marks...).
export function isRetryable(res) {
  const e = res?.error
  if (!e) return false
  return res.status === 0 || res.status === 401 || res.status === 503 || e.code === 'OFFLINE' ||
    /failed to fetch|networkerror|load failed|network request failed|abort|jwt expired|offline/i.test(e.message || '')
}

// Sends ops in order. Consecutive upserts to one table go in a single request; if that request is rejected,
// each row is retried alone so one locked row cannot block the rest.
// -> { failed: [{op, message}], stoppedAt: index of the first op NOT sent (retry later) | null }
export async function execute(client, ops) {
  const failed = []
  let i = 0
  while (i < ops.length) {
    const op = ops[i]
    if (op.t === 'upsert') {
      let j = i
      while (j < ops.length && ops[j].t === 'upsert' && ops[j].table === op.table && ops[j].onConflict === op.onConflict) j++
      const group = ops.slice(i, j)
      const res = await client.from(op.table).upsert(group.map((g) => g.row), { onConflict: op.onConflict })
      if (res.error && isRetryable(res)) return { failed, stoppedAt: i }
      if (res.error && group.length > 1) {
        for (let k = 0; k < group.length; k++) {
          const r = await client.from(op.table).upsert([group[k].row], { onConflict: op.onConflict })
          if (r.error && isRetryable(r)) return { failed, stoppedAt: i + k }
          if (r.error) failed.push({ op: group[k], message: r.error.message })
        }
      } else if (res.error) {
        failed.push({ op: group[0], message: res.error.message })
      }
      i = j
    } else if (op.t === 'delete') {
      const res = await client.from(op.table).delete().match(op.match)
      if (res.error && isRetryable(res)) return { failed, stoppedAt: i }
      if (res.error) failed.push({ op, message: res.error.message })
      i++
    } else {
      i++
    }
  }
  return { failed, stoppedAt: null }
}

// What is still waiting for one course/semester, so the screen can show it on top of the saved copy.
export function pendingFor(uid, { assessmentIds, subjectId, year, term }) {
  const scores = {} // `${studentId}|${assessmentId}` -> text | null (null = cleared)
  const marks = {}  // studentId -> status
  const ids = new Set(assessmentIds)
  for (const op of getQueue(uid)) {
    if (op.table === 'assessment_scores') {
      if (op.t === 'upsert' && ids.has(op.row.assessment_id)) scores[`${op.row.student_id}|${op.row.assessment_id}`] = String(op.row.score)
      if (op.t === 'delete' && ids.has(op.match.assessment_id)) scores[`${op.match.student_id}|${op.match.assessment_id}`] = null
    }
    if (op.table === 'marks' && op.t === 'upsert' && op.row.subject_id === subjectId && op.row.year === year && op.row.term === term) {
      marks[op.row.student_id] = op.row.status
    }
  }
  return { scores, marks }
}
