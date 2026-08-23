import { createContext, useCallback, useContext, useRef, useState, type PropsWithChildren } from 'react'

import { ApiError } from '../services/adminApi'

type NoticeTone = 'success' | 'error' | 'info'
type Notice = { message: string; tone: NoticeTone } | null

const AdminNoticeContext = createContext<((message: string, tone?: NoticeTone) => void) | null>(null)

// Every mutation in the admin panel (save, create, delete, revoke...) used to
// fail silently — a thrown request just vanished into an unhandled promise
// rejection with nothing on screen. A studio owner clicking "Revoke Link"
// deserves to know whether that actually happened. This is one small toast,
// shared through context so any nested view can reach it without prop-drilling
// a callback through four levels of components.
export function AdminNoticeProvider({ children }: PropsWithChildren) {
  const [notice, setNotice] = useState<Notice>(null)
  const timer = useRef<number | undefined>(undefined)

  const notify = useCallback((message: string, tone: NoticeTone = 'info') => {
    window.clearTimeout(timer.current)
    setNotice({ message, tone })
    timer.current = window.setTimeout(() => setNotice(null), tone === 'error' ? 6500 : 3200)
  }, [])

  return (
    <AdminNoticeContext.Provider value={notify}>
      {children}
      <div
        className={`admin-toast admin-toast--${notice?.tone ?? 'info'} ${notice ? 'admin-toast--visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        {notice?.message}
      </div>
    </AdminNoticeContext.Provider>
  )
}

export function useAdminNotice() {
  const ctx = useContext(AdminNoticeContext)
  if (!ctx) throw new Error('useAdminNotice must be used within AdminNoticeProvider')
  return ctx
}

/** Turns a caught error into a message worth showing a person. */
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return fallback
}
