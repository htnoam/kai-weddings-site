export type Status =
  | 'NEW'
  | 'REVIEWED'
  | 'CONTACTED'
  | 'FOLLOW_UP'
  | 'IN_CONVERSATION'
  | 'WON'
  | 'LOST'
  | 'NOT_RELEVANT'
export type Priority = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW'
export type WeddingType = 'JEWISH' | 'KOSHER' | 'GLATT_KOSHER' | 'GENERAL'
export type Verification = 'VERIFIED' | 'NEEDS_REVIEW' | 'UNVERIFIED'

export interface Lead {
  id: string
  row: number
  discoveryDate: string
  source: string
  community: string
  title: string
  destination: string
  weddingDate: string
  guests: string
  budget: string
  plannerBudget: string
  priority: Priority | null
  priorityRaw: string
  status: Status | null
  statusRaw: string
  url: string
  description: string
  notes: string
  publicReply: string
  privateMessage: string
  weddingType: WeddingType | null
  weddingTypeRaw: string
  followUpDate: string
  lastContactDate: string
  lastUpdated: string
  dateAdded: string
  postDate: string
  archived: boolean
  sourcePostId: string
  budgetCurrency: string
  budgetAmount: number | null
  verification: Verification | null
  verificationRaw: string
  extra: Record<string, string>
}

export type EditableKey =
  | 'status'
  | 'priority'
  | 'notes'
  | 'publicReply'
  | 'privateMessage'
  | 'followUpDate'
  | 'lastContactDate'
  | 'destination'
  | 'weddingDate'
  | 'budget'
  | 'budgetAmount'
  | 'budgetCurrency'
  | 'guests'
  | 'weddingType'
  | 'verification'
  | 'archived'
  | 'title'
  | 'description'
  | 'plannerBudget'
  | 'source'
  | 'community'
  | 'url'
  | 'postDate'

export type Changes = Partial<Pick<Lead, EditableKey>>

export type SortKey = 'default' | 'newest' | 'priority' | 'weddingDate' | 'budget' | 'followUp'

export interface Filters {
  q: string
  destinations: string[]
  sources: string[]
  statuses: Status[]
  priorities: Priority[]
  weddingTypes: (WeddingType | 'UNSET')[]
  years: string[]
  budgetCurrency: 'EUR' | 'USD'
  budgets: string[]
  sort: SortKey
}
