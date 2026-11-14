import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSession } from './api'
import { AddLead } from './components/AddLead'
import { FollowUps } from './components/FollowUps'
import { LeadDetail } from './components/LeadDetail'
import { LeadList } from './components/LeadList'
import { Login } from './components/Login'
import { Settings } from './components/Settings'
import { Icon, Toasts } from './components/ui'
import { EMPTY_FILTERS, daysFromToday, isOpen, needsFollowUp } from './lib'
import { StoreProvider, useStore } from './store'
import type { Filters, Lead } from './types'

type Tab = 'leads' | 'followups' | 'settings'
type Seg = 'new' | 'active' | 'all'

const SEGMENTS: { key: Seg; label: string; test: (l: Lead) => boolean; empty: string }[] = [
  { key: 'new', label: 'חדשים', test: (l) => isOpen(l) && l.status === 'NEW', empty: 'אין לידים חדשים.' },
  { key: 'active', label: 'בטיפול', test: (l) => isOpen(l) && l.status !== 'NEW', empty: 'אין לידים בטיפול.' },
  { key: 'all', label: 'הכל', test: () => true, empty: 'אין לידים שמתאימים לחיפוש.' },
]

export default function App() {
  const [signedIn, setSignedIn] = useState(!!getSession())
  const onUnauthorized = useCallback(() => setSignedIn(false), [])
  if (!signedIn) return <Login onSignedIn={() => setSignedIn(true)} />
  return (
    <StoreProvider onUnauthorized={onUnauthorized}>
      <Shell onSignedOut={() => setSignedIn(false)} />
      <Toasts />
    </StoreProvider>
  )
}

function Shell({ onSignedOut }: { onSignedOut: () => void }) {
  const { leads, loading, refresh, loadError, syncedAt } = useStore()
  const [tab, setTab] = useState<Tab>('leads')
  const [seg, setSeg] = useState<Seg>('new')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  // Keep the scroll position of the list when coming back from a lead.
  const [scrollY, setScrollY] = useState(0)
  const open = (id: string) => {
    setScrollY(window.scrollY)
    setOpenId(id)
    window.scrollTo(0, 0)
  }
  useEffect(() => {
    if (!openId && !adding) requestAnimationFrame(() => window.scrollTo(0, scrollY))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, adding])

  const counts = useMemo(() => {
    const c: Record<Seg, number> = { new: 0, active: 0, all: leads.length }
    leads.forEach((l) => {
      if (SEGMENTS[0].test(l)) c.new++
      else if (SEGMENTS[1].test(l)) c.active++
    })
    const overdue = leads.filter((l) => needsFollowUp(l) && l.followUpDate && daysFromToday(l.followUpDate) <= 0).length
    return { ...c, overdue }
  }, [leads])
  const current = SEGMENTS.find((s) => s.key === seg)!
  const segLeads = useMemo(() => leads.filter(current.test), [leads, current])

  const lead = openId ? leads.find((l) => l.id === openId) : null
  if (adding) return <AddLead onClose={() => setAdding(false)} onOpen={(id) => setOpenId(id)} />
  if (lead) return <LeadDetail lead={lead} onBack={() => setOpenId(null)} />

  const title = tab === 'leads' ? 'KAI LEADS' : tab === 'followups' ? 'מעקבים' : 'הגדרות'

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-3 pb-2 pt-[calc(6px+env(safe-area-inset-top))]">
        <div className="flex h-11 items-center justify-between">
          <div className={`px-1 ${tab === 'leads' ? 'text-[14px] font-bold tracking-[0.12em]' : 'text-lg font-semibold'}`}>{title}</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refresh()}
              disabled={loading}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-gray-500 active:bg-gray-100 ${loading ? 'animate-spin' : ''}`}
              aria-label="רענון"
            >
              {Icon.refresh}
            </button>
            {tab === 'leads' && (
              <button
                onClick={() => {
                  setScrollY(window.scrollY)
                  setAdding(true)
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-white active:bg-gray-700"
                aria-label="ליד חדש"
              >
                {Icon.plusSmall}
              </button>
            )}
          </div>
        </div>
        {tab === 'leads' && (
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
            {SEGMENTS.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setSeg(s.key)
                  window.scrollTo(0, 0)
                }}
                className={`h-9 rounded-lg text-sm font-medium ${seg === s.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                {s.label} <span className={seg === s.key ? 'text-gray-500' : 'text-gray-400'}>{counts[s.key]}</span>
              </button>
            ))}
          </div>
        )}
        {loadError && (
          <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {loadError}
            {syncedAt && ` מוצגים נתונים מ־${new Date(syncedAt).toLocaleString('he-IL')}.`}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-xl px-3 pb-[calc(84px+env(safe-area-inset-bottom))]">
        {!leads.length && loading && <div className="py-16 text-center text-sm text-gray-500">טוען לידים מ־Google Sheets…</div>}
        {tab === 'leads' && (leads.length > 0 || !loading) && (
          <LeadList
            leads={segLeads}
            filters={filters}
            setFilters={setFilters}
            onOpen={open}
            showStatusFilter={seg !== 'new'}
            emptyText={current.empty}
          />
        )}
        {tab === 'followups' && <FollowUps onOpen={open} />}
        {tab === 'settings' && <Settings onSignedOut={onSignedOut} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-3">
          <NavBtn active={tab === 'leads'} onClick={() => setTab('leads')} icon={Icon.inbox} label="לידים" badge={counts.new} />
          <NavBtn
            active={tab === 'followups'}
            onClick={() => setTab('followups')}
            icon={Icon.clock}
            label="מעקבים"
            badge={counts.overdue}
            badgeTone="bg-red-500"
          />
          <NavBtn active={tab === 'settings'} onClick={() => setTab('settings')} icon={Icon.gear} label="הגדרות" />
        </div>
      </nav>
    </div>
  )
}

function NavBtn({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeTone = 'bg-blue-600',
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
  badgeTone?: string
}) {
  return (
    <button onClick={onClick} className={`relative flex h-[56px] flex-col items-center justify-center gap-0.5 ${active ? 'text-gray-900' : 'text-gray-400'}`}>
      <span className="relative">
        {icon}
        {!!badge && (
          <span className={`absolute -end-3 -top-1.5 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px] text-white ${badgeTone}`}>
            {badge}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  )
}
