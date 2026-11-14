import { useMemo, useState } from 'react'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, communityFromUrl, parseBudget, sourceFromUrl, titleFromUrl } from '../lib'
import { useStore } from '../store'
import type { Changes, Lead, Priority, Status } from '../types'
import { Icon } from './ui'

function urlKey(u: string): string {
  const s = u.trim()
  if (!s) return ''
  const m = s.match(/\/comments\/([a-z0-9]+)/i)
  if (m && /reddit\.com|redd\.it/i.test(s)) return 'reddit:' + m[1].toLowerCase()
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^(www|m|old|new|mobile)\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
}

export function AddLead({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const { leads, create } = useStore()
  const [f, setF] = useState({
    url: '',
    source: '',
    community: '',
    title: '',
    destination: '',
    budget: '',
    description: '',
    priority: '' as Priority | '',
    status: 'NEW' as Status,
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [serverDup, setServerDup] = useState<Lead | null>(null)

  const localDup = useMemo(() => {
    const k = urlKey(f.url)
    return k ? leads.find((l) => urlKey(l.url) === k) || null : null
  }, [f.url, leads])
  const dup = localDup || serverDup

  const setUrl = (url: string) => {
    setServerDup(null)
    setF((p) => ({
      ...p,
      url,
      source: p.source || sourceFromUrl(url),
      community: p.community || communityFromUrl(url),
      title: p.title || titleFromUrl(url),
    }))
  }

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setUrl(t.trim())
    } catch {
      /* clipboard permission denied — user can paste manually */
    }
  }

  const urlValid = !f.url || /^https?:\/\/\S+$/i.test(f.url.trim())
  const canSave = !busy && !dup && urlValid && (f.url.trim() || f.title.trim() || f.description.trim())

  const save = async () => {
    setBusy(true)
    setError('')
    const lead: Changes = {
      url: f.url.trim(),
      source: f.source.trim(),
      community: f.community.trim(),
      title: f.title.trim(),
      destination: f.destination.trim(),
      description: f.description.trim(),
      notes: f.notes.trim(),
      status: f.status,
      ...(f.priority ? { priority: f.priority } : {}),
    }
    if (f.budget.trim()) {
      const b = parseBudget(f.budget)
      lead.budget = f.budget.trim()
      if (b.currency) lead.budgetCurrency = b.currency
      if (b.amount !== null) lead.budgetAmount = b.amount
    }
    const res = await create(lead)
    setBusy(false)
    if (res.lead) {
      onClose()
      onOpen(res.lead.id)
    } else if (res.duplicate) setServerDup(res.duplicate)
    else setError(res.error || 'לא הצלחתי להוסיף את הליד.')
  }

  const input = 'h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base'
  const lbl = 'mb-1 block text-sm text-gray-500'

  return (
    <div className="min-h-dvh bg-gray-50 pb-[calc(24px+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 flex h-[calc(52px+env(safe-area-inset-top))] items-end justify-between border-b border-gray-200 bg-white/95 px-1 pb-1 pt-[env(safe-area-inset-top)] backdrop-blur">
        <button onClick={onClose} className="flex h-11 items-center px-2 text-blue-600">
          {Icon.back}
          <span className="text-[15px] font-medium">ביטול</span>
        </button>
        <div className="mb-3 text-[15px] font-semibold">ליד חדש</div>
        <button disabled={!canSave} onClick={save} className="h-11 px-3 text-[15px] font-semibold text-blue-600 disabled:text-gray-300">
          {busy ? 'שומר…' : 'שמירה'}
        </button>
      </header>

      <div className="mx-auto max-w-xl space-y-3 px-3 pt-3">
        <div>
          <span className={lbl}>קישור לפוסט</span>
          <div className="flex gap-2">
            <input
              value={f.url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="https://www.reddit.com/r/…"
              className={input}
            />
            <button onClick={paste} className="h-12 shrink-0 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium">
              הדבק
            </button>
          </div>
          {!urlValid && <p className="mt-1 text-sm text-red-600">הקישור חייב להתחיל ב־http:// או https://</p>}
          {dup && (
            <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
              <div className="font-semibold text-orange-800">הליד הזה כבר קיים</div>
              <div className="mt-0.5 text-orange-900" dir="auto">
                {dup.title}
              </div>
              <button
                onClick={() => {
                  onClose()
                  onOpen(dup.id)
                }}
                className="mt-2 font-semibold text-blue-600"
              >
                פתח את הליד הקיים ←
              </button>
            </div>
          )}
          {f.title && !dup && (
            <p className="mt-2 text-sm text-gray-700" dir="auto">
              {f.title}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">מספיק להדביק קישור ולשמור. הכותרת נלקחת מהקישור; כל השאר לא חובה.</p>
        </div>

        <details className="rounded-2xl border border-gray-200 bg-white px-3 py-2">
        <summary className="flex h-9 cursor-pointer items-center text-sm font-semibold text-blue-600">פרטים נוספים (לא חובה)</summary>
        <div className="space-y-3 pb-2 pt-2">
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={lbl}>מקור</span>
            <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className={input}>
              <option value="">—</option>
              <option>Reddit</option>
              <option>Facebook</option>
              <option value="Other">אחר</option>
            </select>
          </label>
          <label>
            <span className={lbl}>קהילה</span>
            <input value={f.community} onChange={(e) => setF({ ...f, community: e.target.value })} className={input} />
          </label>
        </div>

        <label className="block">
          <span className={lbl}>כותרת</span>
          <input dir="auto" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={input} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={lbl}>יעד</span>
            <input dir="auto" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} className={input} />
          </label>
          <label>
            <span className={lbl}>תקציב</span>
            <input value={f.budget} placeholder="€100,000" onChange={(e) => setF({ ...f, budget: e.target.value })} className={input} />
          </label>
        </div>
        <label className="block">
          <span className={lbl}>תיאור</span>
          <textarea
            dir="auto"
            rows={4}
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
            className="w-full rounded-xl border border-gray-200 bg-white p-3 text-base"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={lbl}>עדיפות</span>
            <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority | '' })} className={input}>
              <option value="">לא מסומן</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={lbl}>סטטוס</span>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Status })} className={input}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={lbl}>הערות</span>
          <textarea
            dir="auto"
            rows={3}
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            className="w-full rounded-xl border border-gray-200 bg-white p-3 text-base"
          />
        </label>
        </div>
        </details>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} מה שמילאת נשמר. לחץ שמירה כדי לנסות שוב.</p>}
        <button
          disabled={!canSave}
          onClick={save}
          className="h-12 w-full rounded-xl bg-gray-900 text-[15px] font-semibold text-white disabled:opacity-30"
        >
          {busy ? 'שומר…' : 'הוסף ליד'}
        </button>
        <p className="text-center text-xs text-gray-400">תאריך האיתור נרשם אוטומטית.</p>
      </div>
    </div>
  )
}
