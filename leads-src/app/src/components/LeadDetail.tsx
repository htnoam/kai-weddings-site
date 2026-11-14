import { useEffect, useState, type ReactNode } from 'react'
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  VERIFICATIONS,
  VERIFICATION_LABEL,
  WEDDING_TYPES,
  WEDDING_TYPE_LABEL,
  contactedChanges,
  daysFromToday,
  followUpLabel,
  formatDate,
  guestsText,
  parseBudget,
  shortDate,
} from '../lib'
import { useStore } from '../store'
import type { Changes, Lead, Status } from '../types'
import { FollowUpPicker, Icon, PriorityTag, Sheet, StatusBadge } from './ui'

/** One tap adds a dated line to the notes and saves it. */
const PHRASES = ['הגבתי בפוסט', 'שלחתי הודעה פרטית', 'מחכה לתשובה', 'ענו לי', 'תקציב נמוך', 'לא מתאים']

function Row({ label, value }: { label: string; value?: ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex gap-3 py-2">
      <div className="w-28 shrink-0 text-sm text-gray-500">{label}</div>
      <div className="min-w-0 flex-1 text-sm text-gray-900" dir="auto">
        {value}
      </div>
    </div>
  )
}

function Select<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  disabled,
  allowEmpty,
  rawFallback,
}: {
  label: string
  value: T | null
  options: T[]
  labels: Record<T, string>
  onChange: (v: T | null) => void
  disabled?: boolean
  allowEmpty?: string
  rawFallback?: string
}) {
  return (
    <label className="block py-1.5">
      <span className="mb-1 block text-sm text-gray-500">{label}</span>
      <select
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
        className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base disabled:opacity-50"
      >
        {(allowEmpty !== undefined || value === null) && (
          <option value="">{value === null && rawFallback ? `${rawFallback} (לא מזוהה)` : allowEmpty || '—'}</option>
        )}
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o]}
          </option>
        ))}
      </select>
    </label>
  )
}

const TEXT_FIELDS: { key: keyof Changes; label: string; multiline?: boolean }[] = [
  { key: 'title', label: 'כותרת' },
  { key: 'destination', label: 'יעד' },
  { key: 'weddingDate', label: 'תאריך חתונה' },
  { key: 'guests', label: 'אורחים' },
  { key: 'budget', label: 'תקציב כולל (כפי שנכתב, למשל €100,000)' },
  { key: 'plannerBudget', label: 'תקציב מפיק' },
  { key: 'description', label: 'תיאור', multiline: true },
]

export function LeadDetail({ lead, onBack, onPrevious, onNext, position, total }: { lead: Lead; onBack: () => void; onPrevious?: () => void; onNext?: () => void; position?: number; total?: number }) {
  const { update, saving } = useStore()
  const busy = !!saving[lead.id]
  const [fuOpen, setFuOpen] = useState(false)

  /* Notes keep their own draft so a failed save never loses text. */
  const [notes, setNotes] = useState(lead.notes)
  const [notesBase, setNotesBase] = useState(lead.notes)
  const [notesState, setNotesState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => {
    if (lead.notes !== notesBase) {
      if (notes === notesBase) setNotes(lead.notes)
      setNotesBase(lead.notes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.notes])
  const notesDirty = notes !== notesBase

  const saveNotes = async (value: string) => {
    setNotesState('saving')
    const res = await update(lead.id, { notes: value })
    if (res) {
      setNotesBase(res.notes)
      setNotes(res.notes)
      setNotesState('saved')
    } else setNotesState('error')
  }
  const addPhrase = (p: string) => {
    const d = new Date()
    const line = `${d.getDate()}.${d.getMonth() + 1} — ${p}`
    const next = notes.trim() ? notes.replace(/\s*$/, '') + '\n' + line : line
    setNotes(next)
    saveNotes(next)
  }

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Changes>({})
  const startEdit = () => {
    const d: Changes = {}
    TEXT_FIELDS.forEach((f) => ((d as any)[f.key] = (lead as any)[f.key] || ''))
    setDraft(d)
    setEditing(true)
  }
  const saveEdit = async () => {
    const changes: Changes = {}
    TEXT_FIELDS.forEach((f) => {
      const v = String((draft as any)[f.key] ?? '').trim()
      if (v !== ((lead as any)[f.key] || '')) (changes as any)[f.key] = v
    })
    if ('budget' in changes) {
      const b = parseBudget(changes.budget || '')
      changes.budgetCurrency = b.currency
      changes.budgetAmount = b.amount
    }
    if (!Object.keys(changes).length) return setEditing(false)
    const res = await update(lead.id, changes)
    if (res) setEditing(false)
  }

  const contacted = () => {
    const c = contactedChanges()
    update(lead.id, c, { undo: true, okText: `פניתי · מעקב ב־${shortDate(c.followUpDate || '')}` })
  }
  const setStatus = (s: Status, text: string) => update(lead.id, { status: s }, { undo: true, okText: text })

  const fu = lead.followUpDate ? daysFromToday(lead.followUpDate) : NaN
  const isReddit = /reddit/i.test(lead.source) || /reddit\.com/i.test(lead.url)
  const extras = Object.entries(lead.extra || {})
  const facts: ReactNode[] = []
  if (lead.destination) facts.push(<bdi key="d">{lead.destination}</bdi>)
  if (lead.weddingDate && lead.weddingDate !== 'לא צוין') facts.push(<bdi key="w">{lead.weddingDate}</bdi>)
  if (lead.guests)
    facts.push(guestsText(lead.guests) === lead.guests ? <bdi key="g">{lead.guests}</bdi> : <span key="g"><bdi>{lead.guests}</bdi> אורחים</span>)
  if (lead.budget) facts.push(<bdi key="b">{lead.budget}</bdi>)

  const ACTIONS: { label: string; active: boolean; onClick: () => void; tone: string }[] = [
    { label: 'נבדק', active: lead.status === 'REVIEWED', onClick: () => setStatus('REVIEWED', 'סומן כנבדק'), tone: 'bg-gray-800' },
    { label: 'פניתי', active: lead.status === 'CONTACTED', onClick: contacted, tone: 'bg-purple-700' },
    { label: 'מעקב', active: lead.status === 'FOLLOW_UP', onClick: () => setFuOpen(true), tone: 'bg-orange-600' },
    { label: 'לא רלוונטי', active: lead.status === 'NOT_RELEVANT', onClick: () => setStatus('NOT_RELEVANT', 'סומן כלא רלוונטי'), tone: 'bg-gray-500' },
  ]

  const card = 'rounded-2xl border border-gray-200 bg-white px-4 py-3'

  return (
    <div className="min-h-dvh bg-gray-50 pb-[calc(24px+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 flex h-[calc(48px+env(safe-area-inset-top))] items-end border-b border-gray-200 bg-white/95 px-1 pb-0.5 pt-[env(safe-area-inset-top)] backdrop-blur">
        <button onClick={onBack} className="flex h-11 items-center px-2 text-blue-600">
          {Icon.back}
          <span className="text-[15px] font-medium">חזרה</span>
        </button>
        <div className="flex-1" />
        {position && total && <span className="mb-3 me-3 text-xs text-gray-500">{position} מתוך {total}</span>}
        {busy && <span className="mb-3 me-3 text-xs text-gray-400">שומר…</span>}
      </header>

      <div className="mx-auto max-w-xl space-y-3 px-3 pt-3">
        {/* Everything needed to decide and act */}
        <section className={card}>
          <h1 className="text-lg font-semibold leading-snug" dir="auto">
            {lead.title || '(ללא כותרת)'}
          </h1>
          {facts.length > 0 && (
            <div className="mt-1 text-[15px] text-gray-700">
              {facts.map((f, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  {f}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusBadge lead={lead} />
            <PriorityTag lead={lead} />
            <span className="text-xs text-gray-500">{lead.postDate ? `פורסם ${formatDate(lead.postDate)}` : 'תאריך פרסום לא ידוע'}</span>
            {lead.followUpDate && (
              <span className={`text-xs font-semibold ${fu < 0 ? 'text-red-600' : fu === 0 ? 'text-orange-600' : 'text-gray-600'}`}>
                מעקב: {followUpLabel(lead.followUpDate)}
              </span>
            )}
          </div>
          {lead.description && (
            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800" dir="auto">
              {lead.description}
            </p>
          )}
          {lead.url && (
            <a
              href={lead.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex h-12 items-center justify-center rounded-xl bg-orange-600 text-[15px] font-bold text-white active:bg-orange-700"
            >
              {isReddit ? 'פתח ב־Reddit' : 'פתח את הפוסט המקורי'}
            </a>
          )}
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {ACTIONS.map((a) => (
              <button
                key={a.label}
                disabled={busy}
                onClick={a.onClick}
                className={`h-12 rounded-xl text-sm font-semibold disabled:opacity-40 ${
                  a.active ? `${a.tone} text-white` : 'border border-gray-200 bg-white text-gray-800 active:bg-gray-100'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          {lead.status === 'CONTACTED' || lead.followUpDate ? null : (
            <p className="mt-2 text-center text-xs text-gray-400">״פניתי״ קובע מעקב אוטומטי בעוד 3 ימים</p>
          )}
        </section>

        {/* Notes: one tap phrases */}
        <section className={card}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">הערות</h2>
            <span className="text-xs">
              {notesDirty && notesState !== 'saving' && <span className="text-orange-600">לא נשמר</span>}
              {notesState === 'saving' && <span className="text-gray-400">שומר…</span>}
              {!notesDirty && notesState === 'saved' && <span className="text-green-700">✓ נשמר</span>}
              {notesState === 'error' && notesDirty && <span className="text-red-600"> · השמירה נכשלה</span>}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PHRASES.map((p) => (
              <button
                key={p}
                disabled={notesState === 'saving'}
                onClick={() => addPhrase(p)}
                className="h-9 rounded-full border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 active:bg-gray-200 disabled:opacity-40"
              >
                + {p}
              </button>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={notes ? 4 : 2}
            dir="auto"
            placeholder="או כתוב הערה חופשית…"
            className="mt-2 w-full rounded-xl border border-gray-200 p-3 text-base leading-relaxed outline-none focus:border-gray-400"
          />
          {notesDirty && (
            <button
              disabled={notesState === 'saving'}
              onClick={() => saveNotes(notes)}
              className="mt-1 h-11 w-full rounded-xl bg-gray-900 text-sm font-semibold text-white disabled:opacity-30"
            >
              {notesState === 'error' ? 'נסה לשמור שוב' : 'שמור הערה'}
            </button>
          )}
        </section>

        {/* Everything else, folded away */}
        <details className={card}>
          <summary className="flex h-8 cursor-pointer items-center text-sm font-semibold text-blue-600">פרטים נוספים</summary>
          <div className="pt-2">
            <Select
              label="עדיפות"
              value={lead.priority}
              options={PRIORITIES}
              labels={PRIORITY_LABEL}
              rawFallback={lead.priorityRaw}
              allowEmpty="לא מסומן"
              disabled={busy}
              onChange={(v) => update(lead.id, { priority: v })}
            />
            <Select
              label="סטטוס"
              value={lead.status}
              options={STATUSES}
              labels={STATUS_LABEL}
              rawFallback={lead.statusRaw}
              disabled={busy}
              onChange={(v) => {
                if (!v) return
                if (v === 'CONTACTED') contacted()
                else update(lead.id, { status: v })
              }}
            />
            <Select
              label="סוג חתונה (רק אם הפוסט אומר זאת)"
              value={lead.weddingType}
              options={WEDDING_TYPES}
              labels={WEDDING_TYPE_LABEL}
              rawFallback={lead.weddingTypeRaw}
              allowEmpty="לא מסומן / לא ידוע"
              disabled={busy}
              onChange={(v) => update(lead.id, { weddingType: v })}
            />
            <Select
              label="אימות"
              value={lead.verification}
              options={VERIFICATIONS}
              labels={VERIFICATION_LABEL}
              rawFallback={lead.verificationRaw}
              allowEmpty="לא מסומן"
              disabled={busy}
              onChange={(v) => update(lead.id, { verification: v })}
            />

            <div className="mt-2 divide-y divide-gray-100">
              <Row label="תקציב מפיק" value={lead.plannerBudget} />
              <Row label="מקור" value={lead.source} />
              <Row label="קהילה" value={lead.community} />
              <Row label="פורסם" value={lead.postDate && formatDate(lead.postDate)} />
              <Row label="נמצא" value={lead.discoveryDate && formatDate(lead.discoveryDate)} />
              <Row label="קשר אחרון" value={lead.lastContactDate && formatDate(lead.lastContactDate)} />
              {extras.map(([k, v]) => (
                <Row key={k} label={k} value={v} />
              ))}
            </div>

            {lead.followUpDate && (
              <button onClick={() => update(lead.id, { followUpDate: '' })} className="mt-2 h-11 w-full rounded-xl border border-gray-200 text-sm text-gray-700">
                ביטול תאריך המעקב ({formatDate(lead.followUpDate)})
              </button>
            )}

            {!editing ? (
              <button onClick={startEdit} className="mt-2 h-11 w-full rounded-xl border border-gray-200 text-sm font-medium text-gray-800">
                עריכת יעד, תאריך, אורחים, תקציב…
              </button>
            ) : (
              <div className="mt-2 space-y-2 rounded-xl bg-gray-50 p-3">
                {TEXT_FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="mb-1 block text-sm text-gray-500">{f.label}</span>
                    {f.multiline ? (
                      <textarea
                        rows={4}
                        dir="auto"
                        value={String((draft as any)[f.key] ?? '')}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 bg-white p-3 text-base"
                      />
                    ) : (
                      <input
                        dir="auto"
                        value={String((draft as any)[f.key] ?? '')}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                        className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base"
                      />
                    )}
                  </label>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditing(false)} className="h-12 flex-1 rounded-xl border border-gray-200 bg-white text-sm font-medium">
                    ביטול
                  </button>
                  <button
                    disabled={busy}
                    onClick={saveEdit}
                    className="h-12 flex-1 rounded-xl bg-gray-900 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? 'שומר…' : 'שמירה'}
                  </button>
                </div>
              </div>
            )}
            <label className="mt-2 flex h-12 items-center justify-between">
              <span className="text-sm text-gray-700">בארכיון (מוסתר מהרשימות)</span>
              <input
                type="checkbox"
                checked={lead.archived}
                disabled={busy}
                onChange={(e) => update(lead.id, { archived: e.target.checked })}
                className="h-6 w-6"
              />
            </label>
            <p className="pt-2 text-center text-xs text-gray-400">
              מזהה {lead.id} · שורה {lead.row} בגיליון
            </p>
          </div>
        </details>
      </div>

      {(onPrevious || onNext) && (
        <nav className="sticky bottom-0 z-20 mx-auto mt-3 flex max-w-xl gap-2 border-t border-gray-200 bg-white/95 px-3 py-2 pb-[calc(8px+env(safe-area-inset-bottom))] backdrop-blur" aria-label="מעבר בין לידים">
          <button disabled={!onPrevious || busy || notesDirty} onClick={onPrevious} className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold disabled:opacity-30">הקודם</button>
          <button disabled={!onNext || busy || notesDirty} onClick={onNext} className="h-11 flex-1 rounded-xl bg-gray-900 text-sm font-semibold text-white disabled:opacity-30">הליד הבא ←</button>
        </nav>
      )}
      <Sheet open={fuOpen} onClose={() => setFuOpen(false)} title="מעקב בתאריך">
        <FollowUpPicker
          value={lead.followUpDate}
          onPick={(d) => {
            setFuOpen(false)
            update(
              lead.id,
              { followUpDate: d, ...(lead.status === 'NEW' || lead.status === 'REVIEWED' ? { status: 'FOLLOW_UP' as const } : {}) },
              { undo: true, okText: `מעקב ב־${shortDate(d)}` }
            )
          }}
        />
      </Sheet>
    </div>
  )
}
