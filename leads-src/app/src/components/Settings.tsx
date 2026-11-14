import { useState } from 'react'
import { api, clearCache, clearSession } from '../api'
import { useStore } from '../store'
import { ConnectForm } from './Login'

export function Settings({ onSignedOut }: { onSignedOut: () => void }) {
  const { syncedAt, sheetUrl, refresh, loading, leads, loadError } = useStore()
  const [busy, setBusy] = useState(false)
  const card = 'rounded-2xl border border-gray-200 bg-white p-4'
  const btn = 'h-12 w-full rounded-xl border border-gray-200 text-sm font-medium text-gray-800 disabled:opacity-40'

  return (
    <div className="space-y-3 pb-6 pt-2">
      <div className={card}>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">סנכרון</div>
        <p className="mt-2 text-sm text-gray-700">
          {leads.length} לידים · סנכרון אחרון {syncedAt ? new Date(syncedAt).toLocaleString('he-IL') : 'עדיין לא'}
        </p>
        {loadError && <p className="mt-1 text-sm text-red-600">{loadError}</p>}
        <div className="mt-3 space-y-2">
          <button className={btn} disabled={loading} onClick={() => refresh()}>
            {loading ? 'מרענן…' : 'רענון עכשיו'}
          </button>
          {sheetUrl && (
            <a className={`${btn} flex items-center justify-center`} href={sheetUrl} target="_blank" rel="noopener noreferrer">
              פתיחת הגיליון
            </a>
          )}
        </div>
      </div>

      <div className={card}>
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">חיבור</div>
        <ConnectForm compact />
      </div>

      <div className={card}>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">חשבון</div>
        <div className="mt-3 space-y-2">
          <button
            className={btn}
            onClick={() => {
              clearSession()
              clearCache()
              onSignedOut()
            }}
          >
            יציאה במכשיר הזה
          </button>
          <button
            className={`${btn} text-red-600`}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await api.logoutAll()
              } catch {
                /* still sign out locally */
              }
              clearSession()
              clearCache()
              onSignedOut()
            }}
          >
            יציאה בכל המכשירים
          </button>
        </div>
      </div>
      <p className="text-center text-xs text-gray-400">KAI LEADS v1.0 · הנתונים נשמרים ב־Google Sheets</p>
    </div>
  )
}
