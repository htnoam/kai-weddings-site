import { useEffect, useState, type ReactNode } from 'react'
import { PRIORITY_DOT, PRIORITY_LABEL, STATUS_STYLE, addDaysIso, displayStatus } from '../lib'
import type { Lead } from '../types'
import { useStore } from '../store'

export function StatusBadge({ lead }: { lead: Lead }) {
  const cls = lead.status ? STATUS_STYLE[lead.status] : 'bg-gray-100 text-gray-600 ring-gray-200'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${cls}`}>
      {displayStatus(lead)}
    </span>
  )
}

export function PriorityTag({ lead }: { lead: Lead }) {
  if (!lead.priority && !lead.priorityRaw) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
      <span className={`h-2 w-2 rounded-full ${lead.priority ? PRIORITY_DOT[lead.priority] : 'bg-gray-300'}`} />
      {lead.priority ? PRIORITY_LABEL[lead.priority] : lead.priorityRaw}
    </span>
  )
}

/** Bottom sheet for one-handed actions. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white pb-[max(env(safe-area-inset-bottom),12px)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <div className="text-base font-semibold">{title}</div>
          <button onClick={onClose} className="-me-2 h-11 px-3 text-sm font-medium text-blue-600">
            סיום
          </button>
        </div>
        <div className="px-4 pt-2">{children}</div>
      </div>
    </div>
  )
}

export function SheetButton({ children, onClick, danger, disabled }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex h-12 w-full items-center rounded-xl px-3 text-start text-[15px] font-medium active:bg-gray-100 disabled:opacity-40 ${danger ? 'text-red-600' : 'text-gray-900'}`}
    >
      {children}
    </button>
  )
}

/** Follow-up date picker: Tomorrow / 3 days / 7 days / custom. */
export function FollowUpPicker({ value, onPick, onClear }: { value?: string; onPick: (iso: string) => void; onClear?: () => void }) {
  const [custom, setCustom] = useState(value || '')
  const quick = [
    { label: 'מחר', days: 1 },
    { label: 'בעוד 3 ימים', days: 3 },
    { label: 'בעוד שבוע', days: 7 },
  ]
  return (
    <div className="space-y-2 pb-2">
      <div className="grid grid-cols-3 gap-2">
        {quick.map((q) => (
          <button
            key={q.days}
            onClick={() => onPick(addDaysIso(q.days))}
            className="h-12 rounded-xl border border-gray-200 text-sm font-medium active:bg-gray-100"
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="date"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="h-12 flex-1 rounded-xl border border-gray-200 px-3 text-base"
        />
        <button
          disabled={!custom}
          onClick={() => onPick(custom)}
          className="h-12 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-30"
        >
          קבע
        </button>
      </div>
      {onClear && value && (
        <button onClick={onClear} className="h-11 w-full text-sm font-medium text-gray-500">
          ניקוי תאריך מעקב
        </button>
      )}
    </div>
  )
}

export function Toasts() {
  const { toasts, dismissToast } = useStore()
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${
            t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'ok' ? 'bg-gray-900 text-white' : 'bg-gray-700 text-white'
          }`}
        >
          <span className="flex-1">{t.kind === 'ok' ? '✓ ' : ''}{t.text}</span>
          {t.retry && (
            <button
              className="font-semibold underline"
              onClick={() => {
                dismissToast(t.id)
                t.retry?.()
              }}
            >
              {t.actionLabel || 'נסה שוב'}
            </button>
          )}
          {t.kind === 'error' && (
            <button className="px-1 opacity-80" onClick={() => dismissToast(t.id)} aria-label="סגירה">
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export const Icon = {
  search: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  ),
  filter: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
  ),
  plusSmall: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" className="h-6 w-6 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 13h4l2 3h4l2-3h4M5 5h14l1 8v6H4v-6z" /></svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
  ),
}
