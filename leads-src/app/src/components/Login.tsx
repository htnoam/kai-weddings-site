import { useState } from 'react'
import { api, getConfig, saveConfig, setSession, type Config } from '../api'

export function ConnectForm({ onSaved, compact }: { onSaved?: (c: Config) => void; compact?: boolean }) {
  const [c, setC] = useState<Config>(getConfig())
  const [saved, setSaved] = useState(false)
  const valid = (u: string) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u.trim())
  const ok = valid(c.apiUrl) && valid(c.signInUrl) && c.apiUrl.trim() !== c.signInUrl.trim()
  const input = 'h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm'
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-gray-600">כתובת ה־API (גישה: כולם)</span>
        <input
          className={input}
          value={c.apiUrl}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="https://script.google.com/macros/s/…/exec"
          onChange={(e) => {
            setSaved(false)
            setC({ ...c, apiUrl: e.target.value })
          }}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-gray-600">כתובת דף הכניסה (גישה: רק לי)</span>
        <input
          className={input}
          value={c.signInUrl}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="https://script.google.com/macros/s/…/exec"
          onChange={(e) => {
            setSaved(false)
            setC({ ...c, signInUrl: e.target.value })
          }}
        />
      </label>
      {!ok && (c.apiUrl || c.signInUrl) && (
        <p className="text-xs text-red-600">שתי כתובות Apps Script שונות שמסתיימות ב־/exec.</p>
      )}
      <button
        disabled={!ok}
        onClick={() => {
          const clean = { apiUrl: c.apiUrl.trim(), signInUrl: c.signInUrl.trim() }
          saveConfig(clean)
          setSaved(true)
          onSaved?.(clean)
        }}
        className={`h-12 w-full rounded-xl text-sm font-semibold disabled:opacity-30 ${compact ? 'border border-gray-200 text-gray-800' : 'bg-gray-900 text-white'}`}
      >
        {saved ? '✓ נשמר' : 'שמירת חיבור'}
      </button>
    </div>
  )
}

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [config, setConfig] = useState(getConfig())
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const connected = !!(config.apiUrl && config.signInUrl)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await api.pair(code)
      setSession(res.session)
      onSignedIn()
    } catch (e: any) {
      setError(e.message || 'הכניסה נכשלה.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white px-5 pb-10 pt-[calc(48px+env(safe-area-inset-top))]">
      <h1 className="text-2xl font-bold tracking-wide">KAI LEADS</h1>
      <p className="mt-1 text-sm text-gray-500">ניהול לידים פרטי</p>

      {!connected ? (
        <div className="mt-8">
          <h2 className="mb-1 font-semibold">חיבור לגיליון Google</h2>
          <p className="mb-4 text-sm text-gray-500">הדבק את שתי הכתובות של Apps Script (פעם אחת).</p>
          <ConnectForm onSaved={setConfig} />
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          <div>
            <div className="text-sm font-semibold">1. קבל קוד כניסה</div>
            <p className="mt-1 text-sm text-gray-500">פותח דף של Google שרק החשבון שלך יכול לפתוח.</p>
            <a
              href={config.signInUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex h-12 items-center justify-center rounded-xl border border-gray-300 text-[15px] font-semibold"
            >
              קבלת קוד דרך Google
            </a>
          </div>
          <div>
            <div className="text-sm font-semibold">2. הדבק את הקוד</div>
            <div className="mt-2 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="one-time-code"
                placeholder="ABCD2345"
                className="h-12 min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-center text-lg font-semibold tracking-[0.2em]"
              />
              <button
                onClick={async () => {
                  try {
                    const t = await navigator.clipboard.readText()
                    if (t) setCode(t.trim().toUpperCase())
                  } catch {
                    /* manual paste */
                  }
                }}
                className="h-12 rounded-xl border border-gray-200 px-3 text-sm font-medium"
              >
                הדבק
              </button>
            </div>
            <button
              disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length !== 8}
              onClick={submit}
              className="mt-3 h-12 w-full rounded-xl bg-gray-900 text-[15px] font-semibold text-white disabled:opacity-30"
            >
              {busy ? 'נכנס…' : 'כניסה'}
            </button>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
          <details className="pt-4 text-sm text-gray-500">
            <summary className="cursor-pointer">הגדרות חיבור</summary>
            <div className="mt-3">
              <ConnectForm compact onSaved={setConfig} />
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
