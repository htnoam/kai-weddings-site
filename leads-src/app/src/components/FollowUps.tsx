import { useMemo, useState } from 'react'
import { contactedChanges, daysFromToday, followUpLabel, lastNote, needsFollowUp, shortDate } from '../lib'
import { useStore } from '../store'
import type { Lead } from '../types'
import { FollowUpPicker, Sheet, StatusBadge } from './ui'

export function FollowUps({ onOpen }: { onOpen: (id: string) => void }) {
  const { leads } = useStore()
  const groups = useMemo(() => {
    const list = leads.filter(needsFollowUp)
    const sorted = (arr: Lead[]) => arr.sort((a, b) => (a.followUpDate || '').localeCompare(b.followUpDate || ''))
    return {
      overdue: sorted(list.filter((l) => l.followUpDate && daysFromToday(l.followUpDate) < 0)),
      today: sorted(list.filter((l) => l.followUpDate && daysFromToday(l.followUpDate) === 0)),
      upcoming: sorted(list.filter((l) => l.followUpDate && daysFromToday(l.followUpDate) > 0)),
      noDate: list.filter((l) => !l.followUpDate),
    }
  }, [leads])

  const total = groups.overdue.length + groups.today.length + groups.upcoming.length + groups.noDate.length
  if (!total) return <div className="py-16 text-center text-sm text-gray-500">אין מעקבים. קבע תאריך מעקב לליד כדי לראות אותו כאן.</div>

  return (
    <div className="space-y-5 pb-4 pt-2">
      <Group title="באיחור" tone="text-red-600" leads={groups.overdue} onOpen={onOpen} />
      <Group title="היום" tone="text-orange-600" leads={groups.today} onOpen={onOpen} />
      <Group title="בקרוב" tone="text-gray-700" leads={groups.upcoming} onOpen={onOpen} />
      <Group title="בסטטוס מעקב, בלי תאריך" tone="text-gray-500" leads={groups.noDate} onOpen={onOpen} />
    </div>
  )
}

function Group({ title, tone, leads, onOpen }: { title: string; tone: string; leads: Lead[]; onOpen: (id: string) => void }) {
  if (!leads.length) return null
  return (
    <section>
      <h2 className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>
        {title} · {leads.length}
      </h2>
      <div className="space-y-2.5">
        {leads.map((l) => (
          <FollowRow key={l.id} lead={l} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

function FollowRow({ lead, onOpen }: { lead: Lead; onOpen: (id: string) => void }) {
  const { update, saving } = useStore()
  const [picker, setPicker] = useState(false)
  const busy = !!saving[lead.id]
  const d = lead.followUpDate ? daysFromToday(lead.followUpDate) : NaN
  const note = lastNote(lead.notes)

  return (
    <div className={`rounded-2xl border bg-white ${d < 0 ? 'border-red-200' : 'border-gray-200'} ${busy ? 'opacity-70' : ''}`}>
      <button onClick={() => onOpen(lead.id)} className="w-full px-4 pt-3 text-start">
        <div className="text-[15px] font-semibold leading-snug" dir="auto">
          {lead.title}
        </div>
        {lead.destination && (
          <div className="mt-0.5 text-sm text-gray-700" dir="auto">
            {lead.destination}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <StatusBadge lead={lead} />
          {lead.followUpDate && (
            <span className={`text-xs font-semibold ${d < 0 ? 'text-red-600' : d === 0 ? 'text-orange-600' : 'text-gray-600'}`}>
              {followUpLabel(lead.followUpDate)}
            </span>
          )}
        </div>
        {note && (
          <div className="mt-2 line-clamp-2 text-sm text-gray-500" dir="auto">
            {note}
          </div>
        )}
      </button>
      <div className="mt-2 grid grid-cols-4 border-t border-gray-100 text-[13px] font-medium">
        <button className="h-11 text-blue-600" onClick={() => onOpen(lead.id)}>
          פתח
        </button>
        <button
          disabled={busy}
          className="h-11 text-purple-700 disabled:opacity-40"
          onClick={() => {
            const c = contactedChanges()
            update(lead.id, c, { undo: true, okText: `פניתי · מעקב הבא ב־${shortDate(c.followUpDate || '')}` })
          }}
        >
          פניתי
        </button>
        <button disabled={busy} className="h-11 text-gray-800 disabled:opacity-40" onClick={() => setPicker(true)}>
          דחייה
        </button>
        <button
          disabled={busy}
          className="h-11 text-gray-400 disabled:opacity-40"
          onClick={() => update(lead.id, { status: 'NOT_RELEVANT' }, { undo: true, okText: 'סומן כלא רלוונטי' })}
        >
          לא רלוונטי
        </button>
      </div>
      <Sheet open={picker} onClose={() => setPicker(false)} title="דחיית מעקב">
        <FollowUpPicker
          value={lead.followUpDate}
          onPick={(date) => {
            setPicker(false)
            update(lead.id, { followUpDate: date })
          }}
        />
      </Sheet>
    </div>
  )
}
