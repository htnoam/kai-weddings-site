import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, readCache, writeCache, getSession } from './api'
import type { Changes, Lead } from './types'

interface Toast {
  id: number
  kind: 'info' | 'ok' | 'error'
  text: string
  retry?: () => void
  actionLabel?: string
  duration?: number
}

interface Store {
  leads: Lead[]
  loading: boolean
  loadError: string
  syncedAt: string
  sheetUrl: string
  saving: Record<string, boolean>
  refresh: (opts?: { quiet?: boolean }) => Promise<void>
  update: (id: string, changes: Changes, opts?: { undo?: boolean; okText?: string }) => Promise<Lead | null>
  create: (lead: Changes) => Promise<{ lead?: Lead; duplicate?: Lead; error?: string }>
  toast: (t: Omit<Toast, 'id'>) => void
  toasts: Toast[]
  dismissToast: (id: number) => void
  onUnauthorized: () => void
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => useContext(Ctx) as Store

export function StoreProvider({ children, onUnauthorized }: { children: ReactNode; onUnauthorized: () => void }) {
  const cached = readCache()
  const [leads, setLeads] = useState<Lead[]>(cached?.leads || [])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [syncedAt, setSyncedAt] = useState(cached?.syncedAt || '')
  const [sheetUrl, setSheetUrl] = useState(cached?.sheetUrl || '')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [toasts, setToasts] = useState<Toast[]>([])
  const leadsRef = useRef(leads)
  leadsRef.current = leads
  const savingRef = useRef(saving)
  savingRef.current = saving
  const lastFetch = useRef(0)
  const inflight = useRef<Promise<void> | null>(null)

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts.filter((x) => x.kind !== 'info'), { ...t, id }])
    if (t.kind !== 'error') setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.duration || 2200)
  }, [])
  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), [])

  const handleAuth = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'unauthorized') onUnauthorized()
    },
    [onUnauthorized]
  )

  const persist = useCallback((next: Lead[], when?: string, url?: string) => {
    writeCache({ leads: next, syncedAt: when || new Date().toISOString(), sheetUrl: url })
  }, [])

  const refresh = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!getSession()) return
      if (inflight.current) return inflight.current
      const run = (async () => {
        setLoading(true)
        try {
          const res = await api.list()
          // Keep local versions of leads that are being saved right now.
          const pending = savingRef.current
          const local = new Map(leadsRef.current.map((l) => [l.id, l]))
          const next = res.leads.map((l) => (pending[l.id] && local.get(l.id)) || l)
          setLeads(next)
          setSyncedAt(res.serverTime)
          setSheetUrl(res.sheetUrl)
          setLoadError('')
          persist(next, res.serverTime, res.sheetUrl)
          lastFetch.current = Date.now()
        } catch (e: any) {
          handleAuth(e)
          setLoadError(e.message || 'לא הצלחתי לטעון לידים.')
          if (!opts?.quiet) toast({ kind: 'error', text: e.message || 'לא הצלחתי לטעון לידים.', retry: () => refresh() })
        } finally {
          setLoading(false)
          inflight.current = null
        }
      })()
      inflight.current = run
      return run
    },
    [handleAuth, persist, toast]
  )

  // Initial load + refresh when the app comes back to the foreground.
  useEffect(() => {
    refresh({ quiet: !!readCache() })
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > 20000) refresh({ quiet: true })
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onVis)
    }
  }, [refresh])

  const replaceLead = useCallback(
    (lead: Lead) => {
      setLeads((ls) => {
        const next = ls.some((l) => l.id === lead.id) ? ls.map((l) => (l.id === lead.id ? lead : l)) : [...ls, lead]
        persist(next)
        return next
      })
    },
    [persist]
  )

  const update = useCallback(
    async (id: string, changes: Changes, opts?: { undo?: boolean; okText?: string }): Promise<Lead | null> => {
      const before = leadsRef.current.find((l) => l.id === id)
      if (!before) return null
      const base: Partial<Lead> = {}
      ;(Object.keys(changes) as (keyof Changes)[]).forEach((k) => {
        ;(base as any)[k] = before[k]
      })
      setSaving((s) => ({ ...s, [id]: true }))
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...changes } : l)))
      toast({ kind: 'info', text: 'שומר…' })
      try {
        const res = await api.update(id, changes, base)
        replaceLead(res.lead)
        if (opts?.undo) {
          const prev: Changes = {}
          ;(Object.keys(changes) as (keyof Changes)[]).forEach((k) => {
            ;(prev as any)[k] = before[k]
          })
          toast({ kind: 'ok', text: opts.okText || 'נשמר', actionLabel: 'בטל', duration: 6000, retry: () => update(id, prev) })
        } else toast({ kind: 'ok', text: opts?.okText || 'נשמר בגיליון' })
        return res.lead
      } catch (e: any) {
        handleAuth(e)
        if (e instanceof ApiError && e.code === 'conflict' && e.data?.lead) {
          replaceLead(e.data.lead)
          toast({ kind: 'error', text: e.message })
        } else {
          setLeads((ls) => ls.map((l) => (l.id === id ? before : l)))
          toast({
            kind: 'error',
            text: `לא נשמר. ${e.message || ''}`.trim(),
            retry: () => {
              update(id, changes)
            },
          })
        }
        return null
      } finally {
        setSaving((s) => {
          const n = { ...s }
          delete n[id]
          return n
        })
      }
    },
    [handleAuth, replaceLead, toast]
  )

  const create = useCallback(
    async (lead: Changes) => {
      try {
        const res = await api.create(lead)
        replaceLead(res.lead)
        toast({ kind: 'ok', text: 'הליד נוסף לגיליון' })
        return { lead: res.lead }
      } catch (e: any) {
        handleAuth(e)
        if (e instanceof ApiError && e.code === 'duplicate') return { duplicate: e.data?.lead as Lead }
        return { error: e.message || 'לא הצלחתי להוסיף את הליד.' }
      }
    },
    [handleAuth, replaceLead, toast]
  )

  return (
    <Ctx.Provider
      value={{
        leads,
        loading,
        loadError,
        syncedAt,
        sheetUrl,
        saving,
        refresh,
        update,
        create,
        toast,
        toasts,
        dismissToast,
        onUnauthorized,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
