import { useState } from 'react'
import { useI18n } from '../i18n.jsx'
import StudentsTab from './manager/StudentsTab.jsx'
import SubjectsTab from './manager/SubjectsTab.jsx'
import ReviewTab from './manager/ReviewTab.jsx'
import CardsTab from './manager/CardsTab.jsx'
import RosterTab from './manager/RosterTab.jsx'
import PlanTab from './manager/PlanTab.jsx'
import UsersTab from './manager/UsersTab.jsx'
import ReportsTab from './manager/ReportsTab.jsx'

const TABS = {
  students: StudentsTab, subjects: SubjectsTab, review: ReviewTab, roster: RosterTab, cards: CardsTab, plan: PlanTab,
  users: UsersTab, reports: ReportsTab,
}

// Members and admins share this screen. Admins get two extra tabs (users, reports).
export default function ManagerHome({ ctx }) {
  const { t } = useI18n()
  const keys = ctx.me.role === 'admin' ? Object.keys(TABS) : ['students', 'subjects', 'review', 'roster', 'cards', 'plan']
  const [tab, setTab] = useState('students')
  const Tab = TABS[tab]
  return (
    <>
      <nav className="tabs" role="tablist">
        {keys.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t('tab_' + k)}</button>
        ))}
      </nav>
      <Tab ctx={ctx} />
    </>
  )
}
