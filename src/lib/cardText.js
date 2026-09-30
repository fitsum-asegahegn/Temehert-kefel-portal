// Fixed wording of the printed card — copied from የተማሪዎች_ካርድ.pdf. Edit here to change every card.
export const BANDS = [
  [85, 100, 'እጅግ በጣም ጥሩ'],
  [75, 84, 'በጣም ጥሩ'],
  [65, 74, 'ደኅና'],
  [50, 64, 'መካከለኛ'],
]
export const bandFor = (avg) => (avg == null ? '' : BANDS.find(([lo]) => Math.floor(avg) >= lo)?.[2] ?? '')

export const NOTICES = [
  'ይህ የትምህርት ውጤት መግለጫ ካርድ በዓመት አንድ ጊዜ በትምህርት ማጠቃለያ ላይ ለተማሪው/ዋ ይሰጣል።',
  'ይህ የትምህርት ውጤት መግለጫ ካርድ የሚያገለግለው ለ1ኛ ፣ 2ኛ ፣ 3ኛ ፣ 5ኛ ፣ 7ኛ ፣ 8ኛ ፣ 9ኛ እና 11ኛ ክፍል ተማሪዎች ብቻ ነው።',
]
export const VALIDITY = 'ይህ የትምህርት ውጤት መግለጫ ካርድ የደብሩ አስተዳዳሪ ፊርማና ማኅተም የሰንበት ትምህርት ቤቱ ሊቀመንበር ፊርማ እንዲሁም የትምህርት ክፍል ተጠሪው ፊርማ ከሌለበት ዋጋ አይኖረውም።'

export const COVER_LINES = ['በኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተ ክርስቲያን የሰ/ት/ቤቶች ማደራጃ', 'የሸገር ከተማ ሀገረ ስብከት', 'የ ፍኖተ ጥበብ ሰ/ት/ቤት']
export const VERSE_COVER = { text: '"አንተ ግን በተማርህበትና በተረዳህበት ነገር ጸንተህ ኑር፤ ከማን እንደ ተማርኸው ታውቃለህና፤"', ref: '2ኛ ጢሞ 3 ፥ 14' }
export const VERSE_INSIDE = { text: '" መልካሙን ሥራችሁን አይተው በሰማያት ያለውን አባታችሁን እንዲያከብሩ ብርሃናችሁ እንዲሁ በሰው ፊት ይብራ።"', ref: 'ማቴዎስ 5 ፥ 16' }
