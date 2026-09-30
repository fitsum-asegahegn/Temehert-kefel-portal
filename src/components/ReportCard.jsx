import { BANDS, bandFor, NOTICES, VALIDITY, COVER_LINES, VERSE_COVER, VERSE_INSIDE } from '../lib/cardText.js'

const fmt = (x) => (x == null ? '' : String(Math.round(x * 100) / 100))
const base = import.meta.env.BASE_URL || './'
const MIN_ROWS = 7

function Field({ label, value }) {
  return <li><span>{label}: </span><span className="bk-fill">{value || ''}</span></li>
}

// One student = one folded sheet: page 1 (outside) + page 2 (inside), as in የተማሪዎች_ካርድ.pdf.
// card = buildCard(); ranks = { y: { rank, class_size } }. Scores are each subject's yearly % (out of 100).
export default function ReportCard({ student, year, gradeText, card, ranks = {}, cfg = {} }) {
  const rows = card.rows
  const blanks = Math.max(0, MIN_ROWS - rows.length)
  const total = rows.reduce((s, r) => s + (r.avg ?? 0), 0)
  const band = bandFor(card.yearly)
  const rank = ranks.y

  return (
    <>
      {/* ---------- page 1: outside ---------- */}
      <section className="sheet">
        <div className="bk-panel">
          <h3>ነጥብ አያያዝ</h3>
          <ul>{BANDS.map(([lo, hi, name]) => <li key={lo}><strong>ከ{hi} እስከ {lo}:</strong> {name}</li>)}</ul>
          <img className="bk-logo" src={base + 'emblem-round.png'} alt="" />
          <h3>ማሳሰቢያ</h3>
          <ul>{NOTICES.map((n) => <li key={n}>{n}</li>)}</ul>
          <p>{VALIDITY}</p>
          <h3>የሰንበት ትምህርት ቤቱ አድራሻ:-</h3>
          <p className="bk-fill">{cfg.school_address || ''}</p>
        </div>
        <div className="bk-panel">
          <div className="bk-cover">{COVER_LINES.map((l) => <div key={l}>{l}</div>)}</div>
          <div className="bk-emblems">
            <img src={base + 'emblem-angels.png'} alt="" /><img src={base + 'emblem-round.png'} alt="" />
          </div>
          <p className="bk-verse"><em>{VERSE_COVER.text}</em> - <em>{VERSE_COVER.ref}</em></p>
          <h3>የትምህርት ውጤት መግለጫ</h3>
          <ul className="bk-fields">
            <Field label="የተማሪው/ዋ ስም ከነ አያት" value={student.full_name} />
            <Field label="የክርስትና ስም" value={student.christian_name} />
            <Field label="ትምህርት የተከታተለበት አጥቢያ" value={student.parish || cfg.parish} />
            <li><span>አድራሻ: </span><span className="bk-fill">{student.address}</span> <span>ከተማ: </span><span className="bk-fill">{student.city}</span> <span>ቀበሌ: </span><span className="bk-fill">{student.kebele}</span></li>
            <li><span>የትምህርት ዘመን: </span><span className="bk-fill">{year} ዓ/ም</span> <span>ክፍል ደረጃ: </span><span className="bk-fill">{gradeText}</span></li>
          </ul>
        </div>
      </section>

      {/* ---------- page 2: inside ---------- */}
      <section className="sheet">
        <div className="bk-panel">
          <table className="bk-table">
            <thead><tr><th>ተ.ቁ</th><th>የትምህርት ዓይነት</th><th>ውጤት ከ 100</th></tr></thead>
            <tbody>
              {rows.map((r, i) => <tr key={r.subject.id}><td>{i + 1}</td><td>{r.subject.name_am}</td><td>{fmt(r.avg)}</td></tr>)}
              {Array.from({ length: blanks }, (_, i) => <tr key={'b' + i}><td>{rows.length + i + 1}</td><td /><td /></tr>)}
            </tbody>
          </table>
          <ul className="bk-sum">
            <li>ጠቅላላ ድምር: <strong>{fmt(total)}</strong></li>
            <li>አማካይ ውጤት: <strong>{fmt(card.yearly)}</strong>{band ? ` (${band})` : ''}</li>
            <li>ደረጃ: <strong>{rank ? `${rank.rank} / ${rank.class_size}` : ''}</strong></li>
          </ul>
          <div className="bk-sign">
            <div><hr />የሰ/ት/ቤቱ ሊ/መንበር ስምና ፊርማ</div>
            <div><hr />የሰ/ት/ቤቱ ት/ት ክፍል ተጠሪ</div>
          </div>
        </div>
        <div className="bk-panel">
          <div className="bk-photo">የተማሪ ፎቶ</div>
          <p className="bk-verse inside"><em>{VERSE_INSIDE.text}</em><br /><em>{VERSE_INSIDE.ref}</em></p>
          <div className="bk-sign single" style={{ marginTop: '1.5rem', paddingTop: 0 }}><hr />የደብሩ አስተዳዳሪ ስምና ፊርማ</div>
          <div className="bk-seal">የደብሩ ማኅተም</div>
        </div>
      </section>
    </>
  )
}
