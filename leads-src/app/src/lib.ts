import type { Changes, Filters, Lead, Priority, Status, WeddingType, Verification } from './types'

/* ───────── Labels & colors ───────── */

export const STATUSES: Status[] = [
  'NEW',
  'REVIEWED',
  'CONTACTED',
  'FOLLOW_UP',
  'IN_CONVERSATION',
  'WON',
  'LOST',
  'NOT_RELEVANT',
]
export const STATUS_LABEL: Record<Status, string> = {
  NEW: 'חדש',
  REVIEWED: 'נבדק',
  CONTACTED: 'נוצר קשר',
  FOLLOW_UP: 'למעקב',
  IN_CONVERSATION: 'בשיחה',
  WON: 'נסגר',
  LOST: 'אבד',
  NOT_RELEVANT: 'לא רלוונטי',
}
export const STATUS_STYLE: Record<Status, string> = {
  NEW: 'bg-blue-50 text-blue-700 ring-blue-200',
  REVIEWED: 'bg-gray-100 text-gray-700 ring-gray-200',
  CONTACTED: 'bg-purple-50 text-purple-700 ring-purple-200',
  FOLLOW_UP: 'bg-orange-50 text-orange-700 ring-orange-200',
  IN_CONVERSATION: 'bg-green-50 text-green-700 ring-green-200',
  WON: 'bg-green-700 text-white ring-green-700',
  LOST: 'bg-gray-100 text-gray-500 ring-gray-200',
  NOT_RELEVANT: 'bg-gray-50 text-gray-400 ring-gray-100',
}
export const CLOSED: Status[] = ['WON', 'LOST', 'NOT_RELEVANT']

export const PRIORITIES: Priority[] = ['VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW']
export const PRIORITY_LABEL: Record<Priority, string> = {
  VERY_HIGH: 'גבוה מאוד',
  HIGH: 'גבוה',
  MEDIUM: 'בינוני',
  LOW: 'נמוך',
}
export const PRIORITY_DOT: Record<Priority, string> = {
  VERY_HIGH: 'bg-red-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-gray-400',
  LOW: 'bg-gray-200',
}
const PRIORITY_RANK: Record<Priority, number> = { VERY_HIGH: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export const WEDDING_TYPES: WeddingType[] = ['JEWISH', 'KOSHER', 'GLATT_KOSHER', 'GENERAL']
export const WEDDING_TYPE_LABEL: Record<WeddingType, string> = {
  JEWISH: 'יהודית',
  KOSHER: 'כשרה',
  GLATT_KOSHER: 'כשר למהדרין',
  GENERAL: 'כללית',
}
export const VERIFICATIONS: Verification[] = ['VERIFIED', 'NEEDS_REVIEW', 'UNVERIFIED']
export const VERIFICATION_LABEL: Record<Verification, string> = {
  VERIFIED: 'מאומת',
  NEEDS_REVIEW: 'דורש בדיקה',
  UNVERIFIED: 'לא מאומת',
}

/* ───────── Destinations ───────── */

export const DESTINATIONS: { key: string; words: string[] }[] = [
  { key: 'Greece', words: ['יוון', 'greece', 'greek', 'אתונה', 'athens', 'כרתים', 'crete', 'רודוס', 'rhodes', 'קורפו', 'corfu', 'סנטוריני', 'santorini', 'מיקונוס', 'mykonos', 'פורטו חלי', 'porto heli'] },
  { key: 'Cyprus', words: ['קפריסין', 'cyprus', 'פרוטארס', 'protaras', 'לימסול', 'limassol', 'פאפוס', 'paphos', 'איה נאפה', 'ayia napa', 'לרנקה', 'larnaca'] },
  { key: 'Israel', words: ['ישראל', 'israel', 'תל אביב', 'tel aviv', 'ירושלים', 'jerusalem'] },
  { key: 'Italy', words: ['איטליה', 'italy', 'italian', 'טוסקנה', 'tuscany', 'סיציליה', 'sicily', 'רומא', 'rome', 'קומו', 'como', 'גארדה', 'garda', 'מאג׳ורה', 'maggiore', 'אמלפי', 'amalfi', 'פוליה', 'puglia'] },
  { key: 'France', words: ['צרפת', 'france', 'french', 'פרובנס', 'provence', 'פריז', 'paris', 'ריביירה', 'riviera'] },
  { key: 'Spain', words: ['ספרד', 'spain', 'spanish', 'ברצלונה', 'barcelona', 'מיורקה', 'mallorca', 'majorca', 'מדריד', 'madrid', 'סביליה', 'seville', 'איביזה', 'ibiza', 'מרבייה', 'marbella', 'ולנסיה', 'valencia'] },
]

export function destinationsOf(lead: Lead): string[] {
  const text = (lead.destination || lead.title || '').toLowerCase()
  const found = DESTINATIONS.filter((d) => d.words.some((w) => text.includes(w))).map((d) => d.key)
  return found.length ? found : ['Other']
}

export function sourceKey(lead: Lead): string {
  const s = (lead.source || '').toLowerCase()
  if (s.includes('reddit')) return 'Reddit'
  if (s.includes('facebook') || s.includes('fb')) return 'Facebook'
  return 'Other'
}

export function sourceFromUrl(url: string): string {
  if (/reddit\.com|redd\.it/i.test(url)) return 'Reddit'
  if (/facebook\.com|fb\.com/i.test(url)) return 'Facebook'
  return ''
}

export function communityFromUrl(url: string): string {
  const m = url.match(/reddit\.com\/r\/([A-Za-z0-9_]+)/i)
  return m ? m[1] : ''
}

/* ───────── Years & dates ───────── */

export function yearsOf(lead: Lead): string[] {
  return Array.from(new Set((lead.weddingDate.match(/20\d{2}/g) || []).map(String)))
}

const MONTHS: [RegExp, number][] = [
  [/ינואר|january|jan\b/i, 1],
  [/פברואר|february|feb\b/i, 2],
  [/מרץ|march|mar\b/i, 3],
  [/אפריל|april|apr\b/i, 4],
  [/מאי|may\b/i, 5],
  [/יוני|june|jun\b/i, 6],
  [/יולי|july|jul\b/i, 7],
  [/אוגוסט|august|aug\b/i, 8],
  [/ספטמבר|september|sep\b/i, 9],
  [/אוקטובר|october|oct\b/i, 10],
  [/נובמבר|november|nov\b/i, 11],
  [/דצמבר|december|dec\b/i, 12],
  [/חורף|winter/i, 1],
  [/אביב|spring/i, 4],
  [/קיץ|summer/i, 7],
  [/סתיו|autumn|fall/i, 10],
  [/סוף|end of|late/i, 11],
]

/** Sortable value for free-text wedding dates; unknown dates sort last. */
export function weddingSortValue(text: string): number {
  const y = text.match(/20\d{2}/)
  if (!y) return Number.MAX_SAFE_INTEGER
  const before = text.slice(0, (y.index ?? 0) + 4)
  let month = 6
  for (const [re, m] of MONTHS) {
    if (re.test(before)) {
      month = m
      break
    }
  }
  return Number(y[0]) * 100 + month
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysFromToday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return NaN
  const target = new Date(y, m - 1, d).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - today) / 864e5)
}

export function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function followUpLabel(iso: string): string {
  const n = daysFromToday(iso)
  if (isNaN(n)) return iso
  if (n === -1) return 'באיחור של יום'
  if (n < 0) return `באיחור ${-n} ימים`
  if (n === 0) return 'היום'
  if (n === 1) return 'מחר'
  return formatDate(iso)
}

/* ───────── Budget ───────── */

export function parseBudget(text: string): { currency: string; amount: number | null } {
  const t = text || ''
  if (!t.trim()) return { currency: '', amount: null }
  const currency = /€|eur|יורו/i.test(t)
    ? 'EUR'
    : /\$|usd|דולר/i.test(t)
      ? 'USD'
      : /£|gbp/i.test(t)
        ? 'GBP'
        : /₪|ils|nis|ש"ח|שקל/i.test(t)
          ? 'ILS'
          : ''
  const nums = (t.replace(/,/g, '').match(/\d+(?:\.\d+)?\s*[kK]?/g) || [])
    .map((s) => parseFloat(s) * (/k/i.test(s) ? 1000 : 1))
    .filter((n) => n >= 100)
  return { currency, amount: nums.length ? Math.max(...nums) : null }
}

export const BUDGET_BUCKETS = [
  { key: 'u30', label: (c: string) => `עד ${c}30K`, test: (n: number) => n < 30000 },
  { key: '30-50', label: (c: string) => `${c}30K–50K`, test: (n: number) => n >= 30000 && n < 50000 },
  { key: '50-100', label: (c: string) => `${c}50K–100K`, test: (n: number) => n >= 50000 && n < 100000 },
  { key: '100+', label: (c: string) => `${c}100K+`, test: (n: number) => n >= 100000 },
]
export const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', ILS: '₪' }

/* ───────── Filtering & sorting ───────── */

export const EMPTY_FILTERS: Filters = {
  q: '',
  destinations: [],
  sources: [],
  statuses: [],
  priorities: [],
  weddingTypes: [],
  years: [],
  budgetCurrency: 'EUR',
  budgets: [],
  sort: 'default',
}

export function activeFilterCount(f: Filters): number {
  return (
    f.destinations.length +
    f.sources.length +
    f.statuses.length +
    f.priorities.length +
    f.weddingTypes.length +
    f.years.length +
    f.budgets.length
  )
}

export function applyFilters(leads: Lead[], f: Filters): Lead[] {
  const q = f.q.trim().toLowerCase()
  return leads.filter((l) => {
    if (q) {
      const hay = [l.title, l.destination, l.description, l.community, l.notes].join(' ').toLowerCase()
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false
    }
    if (f.destinations.length && !destinationsOf(l).some((d) => f.destinations.includes(d))) return false
    if (f.sources.length && !f.sources.includes(sourceKey(l))) return false
    if (f.statuses.length && !(l.status && f.statuses.includes(l.status))) return false
    if (f.priorities.length && !(l.priority && f.priorities.includes(l.priority))) return false
    if (f.weddingTypes.length && !f.weddingTypes.includes(l.weddingType ?? 'UNSET')) return false
    if (f.years.length) {
      const ys = yearsOf(l)
      const known = ['2027', '2028', '2029']
      const ok = f.years.some((y) => (y === 'Other' ? !ys.some((x) => known.includes(x)) : ys.includes(y)))
      if (!ok) return false
    }
    if (f.budgets.length) {
      const sameCurrency = l.budgetCurrency === f.budgetCurrency && l.budgetAmount !== null
      const ok = f.budgets.some((b) => {
        if (b === 'unknown') return !l.budgetCurrency || l.budgetAmount === null
        const bucket = BUDGET_BUCKETS.find((x) => x.key === b)
        return sameCurrency && !!bucket && bucket.test(l.budgetAmount as number)
      })
      if (!ok) return false
    }
    return true
  })
}

const prRank = (l: Lead) => (l.priority ? PRIORITY_RANK[l.priority] : 9)
const byDiscovery = (a: Lead, b: Lead) =>
  (b.discoveryDate || '').localeCompare(a.discoveryDate || '') || b.row - a.row

function defaultCompare(a: Lead, b: Lead): number {
  const an = a.status === 'NEW' ? 0 : 1
  const bn = b.status === 'NEW' ? 0 : 1
  return an - bn || prRank(a) - prRank(b) || byDiscovery(a, b)
}

const CUR_ORDER: Record<string, number> = { EUR: 0, USD: 1 }

export function sortLeads(leads: Lead[], sort: Filters['sort']): Lead[] {
  const arr = [...leads]
  switch (sort) {
    case 'newest':
      return arr.sort(byDiscovery)
    case 'priority':
      return arr.sort((a, b) => prRank(a) - prRank(b) || defaultCompare(a, b))
    case 'weddingDate':
      return arr.sort(
        (a, b) => weddingSortValue(a.weddingDate) - weddingSortValue(b.weddingDate) || defaultCompare(a, b)
      )
    case 'budget':
      return arr.sort((a, b) => {
        const ca = a.budgetAmount === null ? 9 : (CUR_ORDER[a.budgetCurrency] ?? 2)
        const cb = b.budgetAmount === null ? 9 : (CUR_ORDER[b.budgetCurrency] ?? 2)
        return ca - cb || (b.budgetAmount ?? 0) - (a.budgetAmount ?? 0) || defaultCompare(a, b)
      })
    case 'followUp':
      return arr.sort(
        (a, b) =>
          (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999') || defaultCompare(a, b)
      )
    default:
      return arr.sort(defaultCompare)
  }
}

export const SORT_LABEL: Record<Filters['sort'], string> = {
  default: 'מומלץ (חדשים, ואז עדיפות)',
  newest: 'נמצאו לאחרונה',
  priority: 'עדיפות גבוהה',
  weddingDate: 'תאריך חתונה',
  budget: 'תקציב גבוה (€ ואז $)',
  followUp: 'תאריך מעקב',
}

/* ───────── Views ───────── */

export function isOpen(l: Lead): boolean {
  return !l.archived && !(l.status && CLOSED.includes(l.status))
}

export function inInbox(l: Lead): boolean {
  return isOpen(l)
}

export function needsFollowUp(l: Lead): boolean {
  return isOpen(l) && (!!l.followUpDate || l.status === 'FOLLOW_UP')
}

export function lastNote(notes: string): string {
  const lines = notes
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  return lines[lines.length - 1] || ''
}

export function guestsText(g: string): string {
  if (!g) return ''
  return /[a-z֐-׿]{3,}/i.test(g.replace(/כ־|כ-/g, '')) ? g : `${g} אורחים`
}

export const DEST_LABEL: Record<string, string> = {
  Greece: 'יוון',
  Cyprus: 'קפריסין',
  Israel: 'ישראל',
  Italy: 'איטליה',
  France: 'צרפת',
  Spain: 'ספרד',
  Other: 'אחר',
}

export function displayStatus(l: Lead): string {
  return l.status ? STATUS_LABEL[l.status] : l.statusRaw || '—'
}

/** "Contacted" = status + today's contact date + automatic follow-up in 3 days. */
export const CONTACT_FOLLOWUP_DAYS = 3
export function contactedChanges(): Changes {
  return { status: 'CONTACTED', lastContactDate: todayIso(), followUpDate: addDaysIso(CONTACT_FOLLOWUP_DAYS) }
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return m && d ? `${d}.${m}` : iso
}

export function titleFromUrl(url: string): string {
  const m = url.match(/\/comments\/[a-z0-9]+\/([^/?#]+)/i)
  if (!m) return ''
  let t = ''
  try {
    t = decodeURIComponent(m[1])
  } catch {
    t = m[1]
  }
  t = t.replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}
