import { useRef, useState } from 'react'
import { contactedChanges, daysFromToday, followUpLabel, guestsText, shortDate, yearsOf } from '../lib'
import { useStore } from '../store'
import type { Lead } from '../types'
import { PriorityTag, StatusBadge } from './ui'

const THRESHOLD = 90

/**
 * Compact lead card. Swipe right → "פניתי" (with automatic follow-up), swipe left → "לא רלוונטי".
 * Both show an undo button.
 */
export function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: (id: string) => void }) {
  const { update, saving } = useStore()
  const busy = !!saving[lead.id]
  const [dx, setDx] = useState(0)
  const dxRef = useRef(0)
  const drag = useRef<{ x: number; y: number; decided: boolean; horizontal: boolean } | null>(null)
  const swiped = useRef(false)

  const setOffset = (v: number) => {
    dxRef.current = v
    setDx(v)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return
    drag.current = { x: e.clientX, y: e.clientY, decided: false, horizontal: false }
    swiped.current = false
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const mx = e.clientX - d.x
    const my = e.clientY - d.y
    if (!d.decided) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return
      d.decided = true
      d.horizontal = Math.abs(mx) > Math.abs(my) * 1.3
      if (d.horizontal) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    if (d.horizontal) {
      swiped.current = true
      setOffset(Math.max(-140, Math.min(140, mx)))
    }
  }
  const onPointerEnd = () => {
    const d = drag.current
    drag.current = null
    const v = dxRef.current
    setOffset(0)
    if (!d?.horizontal) return
    const c = contactedChanges()
    if (v >= THRESHOLD) update(lead.id, c, { undo: true, okText: `פניתי · מעקב ב־${shortDate(c.followUpDate || '')}` })
    else if (v <= -THRESHOLD) update(lead.id, { status: 'NOT_RELEVANT' }, { undo: true, okText: 'סומן כלא רלוונטי' })
  }

  const years = yearsOf(lead).join(' / ')
  const guests = lead.guests ? (
    guestsText(lead.guests) === lead.guests ? <bdi>{lead.guests}</bdi> : <><bdi>{lead.guests}</bdi> אורחים</>
  ) : null
  const meta: React.ReactNode[] = []
  if (lead.destination) meta.push(<bdi key="d">{lead.destination}</bdi>)
  if (years) meta.push(<bdi key="y">{years}</bdi>)
  if (lead.budget) meta.push(<bdi key="b">{lead.budget}</bdi>)
  else if (guests) meta.push(<span key="g">{guests}</span>)
  const fuDays = lead.followUpDate ? daysFromToday(lead.followUpDate) : NaN

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {/* Revealed behind the card while swiping */}
      <div dir="ltr" className="absolute inset-0 flex items-center justify-between px-5 text-sm font-semibold">
        <span className={`text-purple-700 transition-opacity ${dx > 20 ? 'opacity-100' : 'opacity-0'}`}>✓ פניתי</span>
        <span className={`text-gray-500 transition-opacity ${dx < -20 ? 'opacity-100' : 'opacity-0'}`}>לא רלוונטי ✕</span>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform .2s' : 'none', touchAction: 'pan-y' }}
        className={`relative bg-white ${busy ? 'opacity-60' : ''} ${
          dx >= THRESHOLD ? 'bg-purple-50' : dx <= -THRESHOLD ? 'bg-gray-100' : ''
        }`}
      >
        <button
          onClick={() => {
            if (!swiped.current) onOpen(lead.id)
          }}
          className="w-full select-none px-4 py-3 text-start active:bg-gray-50"
        >
          <div className="text-[15px] font-semibold leading-snug text-gray-900" dir="auto">
            {lead.title || '(ללא כותרת)'}
          </div>
          {meta.length > 0 && (
            <div className="mt-1 text-sm text-gray-600">
              {meta.map((m, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  {m}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <PriorityTag lead={lead} />
            {lead.status !== 'NEW' && <StatusBadge lead={lead} />}
            {lead.followUpDate && (
              <span className={`text-xs font-medium ${fuDays < 0 ? 'text-red-600' : fuDays === 0 ? 'text-orange-600' : 'text-gray-500'}`}>
                מעקב: {followUpLabel(lead.followUpDate)}
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  )
}
