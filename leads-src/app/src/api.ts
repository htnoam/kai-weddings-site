import type { Changes, Lead } from './types'

const LS_CONFIG = 'kai.config'
const LS_SESSION = 'kai.session'
const LS_CACHE = 'kai.cache'

export interface Config {
  apiUrl: string
  signInUrl: string
}

let fileConfig: Config = { apiUrl: '', signInUrl: '' }

export async function loadConfig(): Promise<Config> {
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'config.json', { cache: 'no-store' })
    if (res.ok) fileConfig = { ...fileConfig, ...(await res.json()) }
  } catch {
    /* offline: fall back to saved config */
  }
  return getConfig()
}

export function getConfig(): Config {
  let saved: Partial<Config> = {}
  try {
    saved = JSON.parse(localStorage.getItem(LS_CONFIG) || '{}')
  } catch {
    /* ignore */
  }
  return {
    apiUrl: saved.apiUrl || fileConfig.apiUrl || '',
    signInUrl: saved.signInUrl || fileConfig.signInUrl || '',
  }
}

export function saveConfig(c: Config) {
  localStorage.setItem(LS_CONFIG, JSON.stringify(c))
}

export const getSession = () => localStorage.getItem(LS_SESSION) || ''
export const setSession = (s: string) => localStorage.setItem(LS_SESSION, s)
export const clearSession = () => localStorage.removeItem(LS_SESSION)

export interface Cache {
  leads: Lead[]
  syncedAt: string
  sheetUrl?: string
}
export function readCache(): Cache | null {
  try {
    return JSON.parse(localStorage.getItem(LS_CACHE) || 'null')
  } catch {
    return null
  }
}
export function writeCache(c: Cache) {
  try {
    localStorage.setItem(LS_CACHE, JSON.stringify(c))
  } catch {
    /* storage full — not critical */
  }
}
export const clearCache = () => localStorage.removeItem(LS_CACHE)

export class ApiError extends Error {
  code: string
  data: any
  constructor(code: string, message: string, data?: any) {
    super(message)
    this.code = code
    this.data = data
  }
}

const MESSAGES: Record<string, string> = {
  network: 'אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.',
  timeout: 'השרת לא ענה בזמן. נסה שוב.',
  unauthorized: 'יצאת מהמערכת. צריך להיכנס שוב.',
  server_error: 'השרת החזיר שגיאה.',
  bad_request: 'הבקשה נדחתה.',
  not_found: 'הליד לא נמצא בגיליון.',
  conflict: 'הליד השתנה בגיליון. הגרסה העדכנית נטענה, בצע את השינוי שוב.',
  duplicate: 'הקישור הזה כבר קיים בלידים.',
  bad_code: 'הקוד שגוי או שפג תוקפו.',
  locked: 'יותר מדי ניסיונות. נסה שוב בעוד 15 דקות.',
}

async function call<T = any>(body: Record<string, unknown>): Promise<T> {
  const { apiUrl } = getConfig()
  if (!apiUrl) throw new ApiError('config', 'האפליקציה עוד לא מחוברת. הוסף את כתובת ה־API בהגדרות.')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  let res: Response
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      // text/plain avoids a CORS preflight, which Apps Script cannot answer.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, session: getSession() }),
      redirect: 'follow',
      signal: ctrl.signal,
    })
  } catch (e: any) {
    throw new ApiError(e?.name === 'AbortError' ? 'timeout' : 'network', MESSAGES[e?.name === 'AbortError' ? 'timeout' : 'network'])
  } finally {
    clearTimeout(timer)
  }
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new ApiError('server_error', `תשובה לא צפויה מהשרת (HTTP ${res.status}). בדוק את כתובת ה־API ואת הגישה בפריסה ("כולם").`)
  }
  if (!data.ok) {
    if (data.error === 'unauthorized') clearSession()
    throw new ApiError(data.error, (MESSAGES[data.error] || 'משהו השתבש.') + (data.error === 'server_error' && data.message ? ` (${data.message})` : ''), data)
  }
  return data
}

export const api = {
  pair: (code: string) => call<{ session: string; email: string }>({ action: 'pair', code }),
  list: () => call<{ leads: Lead[]; serverTime: string; sheetUrl: string }>({ action: 'list' }),
  update: (id: string, changes: Changes, base: Partial<Lead>) =>
    call<{ lead: Lead }>({ action: 'update', id, changes, base }),
  create: (lead: Changes) => call<{ lead: Lead }>({ action: 'create', lead }),
  checkUrl: (url: string) => call<{ duplicate: Lead | null }>({ action: 'checkUrl', url }),
  logoutAll: () => call({ action: 'logoutAll' }),
}
