import { useMemo, useState } from 'react'
import {
  BUDGET_BUCKETS,
  CURRENCY_SYMBOL,
  DESTINATIONS,
  PRIORITIES,
  PRIORITY_LABEL,
  SORT_LABEL,
  STATUSES,
  STATUS_LABEL,
  WEDDING_TYPES,
  WEDDING_TYPE_LABEL,
  activeFilterCount,
  applyFilters,
  sortLeads,
  DEST_LABEL,
} from '../lib'
import type { Filters, Lead, SortKey } from '../types'
import { LeadCard } from './LeadCard'
import { Icon, Sheet } from './ui'

export function LeadList({
  leads,
  filters,
  setFilters,
  onOpen,
  showStatusFilter,
  emptyText,
}: {
  leads: Lead[]
  filters: Filters
  setFilters: (f: Filters) => void
  onOpen: (id: string) => void
  showStatusFilter?: boolean
  emptyText: string
}) {
  const [open, setOpen] = useState(false)
  const shown = useMemo(() => sortLeads(applyFilters(leads, filters), filters.sort), [leads, filters])
  const count = activeFilterCount(filters)

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-3 bg-gray-50/95 px-3 pb-2 pt-2 backdrop-blur">
        <div className="flex gap-2">
          <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-gray-400">
            {Icon.search}
            <input
              type="search"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="חיפוש בכותרת, יעד, הערות…"
              className="h-full w-full bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400"
              dir="auto"
            />
          </label>
          <button
            onClick={() => setOpen(true)}
            className={`relative flex h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium ${
              count ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'
            }`}
          >
            {Icon.filter}
            {count ? count : 'סינון'}
          </button>
        </div>
      </div>

      <div className="space-y-2.5 pb-4">
        {shown.map((l) => (
          <LeadCard key={l.id} lead={l} onOpen={onOpen} />
        ))}
        {!shown.length && <div className="py-12 text-center text-sm text-gray-500">{emptyText}</div>}
      </div>

      <FilterSheet open={open} onClose={() => setOpen(false)} filters={filters} setFilters={setFilters} showStatus={showStatusFilter} />
    </div>
  )
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 rounded-full border px-3.5 text-sm font-medium ${
        on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
      {note && <div className="mt-2 text-xs text-gray-500">{note}</div>}
    </div>
  )
}

function FilterSheet({
  open,
  onClose,
  filters: f,
  setFilters,
  showStatus,
}: {
  open: boolean
  onClose: () => void
  filters: Filters
  setFilters: (f: Filters) => void
  showStatus?: boolean
}) {
  const sym = CURRENCY_SYMBOL[f.budgetCurrency]
  return (
    <Sheet open={open} onClose={onClose} title="סינון ומיון">
      <div className="divide-y divide-gray-100">
        <div className="py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">מיון לפי</div>
          <select
            value={f.sort}
            onChange={(e) => setFilters({ ...f, sort: e.target.value as SortKey })}
            className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <Group title="יעד">
          {[...DESTINATIONS.map((d) => d.key), 'Other'].map((d) => (
            <Chip key={d} on={f.destinations.includes(d)} onClick={() => setFilters({ ...f, destinations: toggle(f.destinations, d) })}>
              {DEST_LABEL[d] || d}
            </Chip>
          ))}
        </Group>
        <Group title="עדיפות">
          {PRIORITIES.map((p) => (
            <Chip key={p} on={f.priorities.includes(p)} onClick={() => setFilters({ ...f, priorities: toggle(f.priorities, p) })}>
              {PRIORITY_LABEL[p]}
            </Chip>
          ))}
        </Group>
        <Group title="שנת חתונה">
          {['2027', '2028', '2029', 'Other'].map((y) => (
            <Chip key={y} on={f.years.includes(y)} onClick={() => setFilters({ ...f, years: toggle(f.years, y) })}>
              {y === 'Other' ? 'אחר' : y}
            </Chip>
          ))}
        </Group>
        <details className="py-1">
          <summary className="flex h-12 cursor-pointer items-center text-sm font-semibold text-blue-600">עוד סינונים</summary>
          <div className="divide-y divide-gray-100">
        <Group title="סוג חתונה" note="מסומן רק כשהפוסט אומר זאת במפורש, ללא ניחוש.">
          {WEDDING_TYPES.map((w) => (
            <Chip key={w} on={f.weddingTypes.includes(w)} onClick={() => setFilters({ ...f, weddingTypes: toggle(f.weddingTypes, w) })}>
              {WEDDING_TYPE_LABEL[w]}
            </Chip>
          ))}
          <Chip on={f.weddingTypes.includes('UNSET')} onClick={() => setFilters({ ...f, weddingTypes: toggle(f.weddingTypes, 'UNSET') })}>
            לא מסומן
          </Chip>
        </Group>
        {showStatus && (
          <Group title="סטטוס">
            {STATUSES.map((s) => (
              <Chip key={s} on={f.statuses.includes(s)} onClick={() => setFilters({ ...f, statuses: toggle(f.statuses, s) })}>
                {STATUS_LABEL[s]}
              </Chip>
            ))}
          </Group>
        )}
        <Group
          title="תקציב"
          note={`משווה רק לידים שהתקציב שלהם ב־${f.budgetCurrency}. בטווח נלקח הסכום העליון. אין המרת מטבע.`}
        >
          <div className="mb-1 flex w-full gap-2">
            {(['EUR', 'USD'] as const).map((c) => (
              <Chip key={c} on={f.budgetCurrency === c} onClick={() => setFilters({ ...f, budgetCurrency: c })}>
                {CURRENCY_SYMBOL[c]} {c}
              </Chip>
            ))}
          </div>
          {BUDGET_BUCKETS.map((b) => (
            <Chip key={b.key} on={f.budgets.includes(b.key)} onClick={() => setFilters({ ...f, budgets: toggle(f.budgets, b.key) })}>
              <bdi>{b.label(sym)}</bdi>
            </Chip>
          ))}
          <Chip on={f.budgets.includes('unknown')} onClick={() => setFilters({ ...f, budgets: toggle(f.budgets, 'unknown') })}>
            לא ידוע
          </Chip>
        </Group>
        <Group title="מקור">
          {['Reddit', 'Facebook', 'Other'].map((s) => (
            <Chip key={s} on={f.sources.includes(s)} onClick={() => setFilters({ ...f, sources: toggle(f.sources, s) })}>
              {s === 'Other' ? 'אחר' : s}
            </Chip>
          ))}
        </Group>
          </div>
        </details>
        <div className="py-3">
          <button
            onClick={() =>
              setFilters({ ...f, destinations: [], sources: [], statuses: [], priorities: [], weddingTypes: [], years: [], budgets: [] })
            }
            className="h-12 w-full rounded-xl border border-gray-200 text-sm font-medium text-gray-700"
          >
            ניקוי כל הסינונים
          </button>
        </div>
      </div>
    </Sheet>
  )
}
