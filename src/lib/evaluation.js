// The fixed evaluation form: 8 questions, answered 1 (poor) to 5 (excellent). Ids must match supabase/migration-008.sql (q1..q8).
export const QUESTIONS = [
  { id: 'q1', am: 'ትምህርቱን በግልጽ ያስረዳል', en: 'Explains the lesson clearly' },
  { id: 'q2', am: 'በሰዓቱ ይመጣል፤ የትምህርት ሰዓትን በደንብ ይጠቀማል', en: 'Is on time and uses class time well' },
  { id: 'q3', am: 'ለጥያቄዎች ጥሩ መልስ ይሰጣል', en: 'Answers questions well' },
  { id: 'q4', am: 'ተማሪዎችን በአክብሮትና በፍቅር ይይዛል', en: 'Treats students with respect and love' },
  { id: 'q5', am: 'ትምህርቱ የተደራጀ ነው', en: 'The lessons are well organised' },
  { id: 'q6', am: 'በክርስቲያናዊ ሕይወቱ አርአያ ነው', en: 'Is a good example in Christian life' },
  { id: 'q7', am: 'በፈተናና በውጤት አሰጣጥ ፍትሐዊ ነው', en: 'Is fair in tests and marks' },
  { id: 'q8', am: 'በአጠቃላይ ከዚህ መምህር ብዙ እማራለሁ', en: 'Overall, I learn a lot from this teacher' },
]
export const MIN_ANSWERS = 3 // below this nothing is shown (keeps answers anonymous)
export const parseOpen = (v) => { const m = /^(\d+)-([12])$/.exec(v || ''); return m ? { year: Number(m[1]), term: Number(m[2]) } : null }
