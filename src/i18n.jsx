import { createContext, useContext, useState } from 'react'

const dict = {
  am: {
    appName: 'ትምህርትና ስልጠና ክፍል',
    needInternet: 'ለመግባት ኢንተርኔት ያስፈልጋል። አንዴ ከገቡ በኋላ ያለ ኢንተርኔት ያዩትን ማየት ይችላሉ።', signIn: 'ግባ', signOut: 'ውጣ', signingIn: 'በመግባት ላይ…',
    idOrEmail: 'የተማሪ መታወቂያ ወይም ኢሜይል', password: 'የይለፍ ቃል',
    badLogin: 'መታወቂያው ወይም የይለፍ ቃሉ ትክክል አይደለም።',
    loginHint: 'ተማሪዎች መታወቂያቸውን (ለምሳሌ FTS/27/0142)፣ ወላጆች የስልክ ቁጥራቸውን ይጠቀሙ',
    newPassword: 'አዲስ የይለፍ ቃል', changeTitle: 'አዲስ የይለፍ ቃል ይምረጡ',
    changeHint: 'ቢያንስ 8 ፊደል ወይም ቁጥር። ከዚህ በኋላ ይህን ይጠቀማሉ።', pinHint: 'ቢያንስ 4 ፊደል፣ ቁጥር ወይም ምልክት ይምረጡ (ከፈለጉ ረዘም ሊያደርጉት ይችላሉ)። 0000 ወይም 1234 አይቻልም። ከዚህ በኋላ ይህን ይጠቀማሉ።', saveNew: 'የይለፍ ቃል አስቀምጥ',
    pendingTitle: 'መለያዎ እየተጠበቀ ነው', pendingBody: 'አስተዳዳሪው ሚና እስኪሰጥዎ ድረስ ይጠብቁ።',
    notConfigured: 'Supabase አልተገናኘም። .env ፋይል ውስጥ VITE_SUPABASE_URL እና VITE_SUPABASE_ANON_KEY ያስገቡ።',
    role_student: 'ተማሪ', role_teacher: 'መምህር', role_member: 'አባል', role_admin: 'አስተዳዳሪ', role_pending: 'በመጠባበቅ ላይ', role_parent: 'ወላጅ',
    save: 'አስቀምጥ', close: 'ዝጋ',
    photoTitle: 'ፎቶዎን ይጫኑ', photoWhy: 'ይህ ፎቶ በትምህርት ውጤት ካርድዎ ላይ ይታተማል። የፊትዎ ግልጽ የሆነ የቅርብ ጊዜ ፎቶ ይምረጡ።',
    photoTip: 'ፊትዎ በመሃል እንዲሆን ያድርጉ። ከፈለጉ በኋላ ሁልጊዜ መቀየር ይችላሉ።', photoChoose: 'ፎቶ ምረጥ ወይም አንሳ', photoChooseOther: 'ሌላ ፎቶ ምረጥ',
    photoSave: 'ፎቶውን አስቀምጥ', photoChange: 'ፎቶ ቀይር', photoNone: 'ፎቶ የለም', photoSaved: 'ፎቶዎ ተቀምጧል ✓', photoNotImage: 'እባክዎ የፎቶ ፋይል ይምረጡ።', cancel: 'ተው', delete: 'ሰርዝ', print: 'አትም', loading: 'በመጫን ላይ…', back: 'ተመለስ',
    year: 'ዓመት', term: 'መንፈቀ ዓመት', term1: '1ኛ መንፈቀ ዓመት', term2: '2ኛ መንፈቀ ዓመት', yearly: 'ዓመታዊ',
    grade: 'ክፍል', section: 'ክፍለ', subject: 'ትምህርት', student: 'ተማሪ', students: 'ተማሪዎች', teacher: 'መምህር',
    score: 'ውጤት', outOf: 'ከ', average: 'አማካይ', total: 'ድምር', rank: 'ደረጃ', conduct: 'ስነ ምግባር',
    passMark: 'የማለፊያ ውጤት', status: 'ሁኔታ',
    st_draft: 'ረቂቅ', st_submitted: 'ለግምገማ ቀርቧል', st_approved: 'ጸድቋል', st_missing: 'አልገባም',
    tab_students: 'ተማሪዎች', tab_subjects: 'ትምህርትና መምህራን', tab_review: 'ውጤት ማጽደቅ', tab_roster: 'ውጤት ዝርዝር', tab_promote: 'ማሳደግ', tab_eval: 'የመምህር ግምገማ', tab_announce: 'ማስታወቂያ', tab_audit: 'የለውጥ መዝገብ', tab_cards: 'የውጤት ካርድ',
    tab_users: 'ተጠቃሚዎችና ቅንብር', tab_reports: 'ሪፖርት', tab_plan: 'ዕቅድ', planUnit: 'መለኪያ', planTarget: 'እቅድ', planBudget: 'በጀት',
    reportCard: 'የተማሪ ውጤት ካርድ',
    res_promoted: 'ያለፈ', res_repeat: 'ክፍል የሚደግም', res_incomplete: 'ውጤት ያልተሟላ',
    noResults: 'ውጤት ገና አልተለቀቀም ወይም የለም።',
    noAssignments: 'እስካሁን ምንም ትምህርት አልተመደበልዎትም። አባሉን ያነጋግሩ።',
  },
  en: {
    appName: 'Education & Training Portal',
    needInternet: 'Signing in needs internet. After you have signed in once, you can view what you opened before without internet.', signIn: 'Sign in', signOut: 'Sign out', signingIn: 'Signing in…',
    idOrEmail: 'Student ID or email', password: 'Password',
    badLogin: 'The ID or password is incorrect.',
    loginHint: 'Students sign in with their ID (for example FTS/27/0142); parents use their phone number',
    newPassword: 'New password', changeTitle: 'Choose a new password',
    changeHint: 'At least 8 letters or numbers. You will use this from now on.', pinHint: 'Choose at least 4 characters — letters, numbers or symbols (longer is fine). Not 0000 or 1234. You will use this from now on.', saveNew: 'Save password',
    pendingTitle: 'Your account is waiting', pendingBody: 'Wait until the admin gives you a role.',
    notConfigured: 'Supabase is not connected. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.',
    role_student: 'Student', role_teacher: 'Teacher', role_member: 'Member', role_admin: 'Admin', role_pending: 'Pending', role_parent: 'Parent',
    save: 'Save', close: 'Close',
    photoTitle: 'Upload your photo', photoWhy: 'This photo will be printed on your report card. Choose a clear, recent photo of your face.',
    photoTip: 'Keep your face in the middle. You can change it any time later.', photoChoose: 'Choose or take a photo', photoChooseOther: 'Choose another photo',
    photoSave: 'Save photo', photoChange: 'Change photo', photoNone: 'No photo', photoSaved: 'Your photo is saved ✓', photoNotImage: 'Please choose an image file.', cancel: 'Cancel', delete: 'Delete', print: 'Print', loading: 'Loading…', back: 'Back',
    year: 'Year', term: 'Semester', term1: 'Semester 1', term2: 'Semester 2', yearly: 'Yearly',
    grade: 'Grade', section: 'Section', subject: 'Subject', student: 'Student', students: 'Students', teacher: 'Teacher',
    score: 'Mark', outOf: 'Out of', average: 'Average', total: 'Total', rank: 'Rank', conduct: 'Conduct',
    passMark: 'Pass mark', status: 'Status',
    st_draft: 'Draft', st_submitted: 'Submitted', st_approved: 'Approved', st_missing: 'Not entered',
    tab_students: 'Students', tab_subjects: 'Subjects & teachers', tab_review: 'Approve marks', tab_roster: 'Rosters', tab_promote: 'Promotion', tab_eval: 'Teacher evaluation', tab_announce: 'Announcements', tab_audit: 'Audit log', tab_cards: 'Report cards',
    tab_users: 'Users & settings', tab_reports: 'Reports', tab_plan: 'Plan', planUnit: 'Unit', planTarget: 'Target', planBudget: 'Budget',
    reportCard: 'Student report card',
    res_promoted: 'Promoted', res_repeat: 'Repeats the grade', res_incomplete: 'Incomplete',
    noResults: 'No results are available yet.',
    noAssignments: 'No subjects are assigned to you yet. Ask a member.',
  },
}

const Ctx = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('lang') || 'am')
  const setLang = (l) => { localStorage.setItem('lang', l); setLangState(l) }
  const t = (k) => dict[lang][k] ?? dict.en[k] ?? k
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}
export const useI18n = () => useContext(Ctx)
