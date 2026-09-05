import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Non-blocking toast system. Nothing in this file ever calls window.alert,
// window.confirm, or window.prompt — every status update, warning, or
// confirmation the gallery needs to show a client should route through
// showToast() instead, so the browser never freezes their scroll position
// or steals focus into a native dialog.

type ToastTone = 'info' | 'success' | 'error'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface ShowToastOptions {
  tone?: ToastTone
  actionLabel?: string
  onAction?: () => void
  /** ms before auto-dismiss. Errors default longer since they matter more. */
  duration?: number
}

interface ToastContextValue {
  showToast: (message: string, options?: ShowToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be called within a <ToastProvider>')
  }
  return ctx
}

let idSeq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback<ToastContextValue['showToast']>(
    (message, options) => {
      const id = ++idSeq
      const tone = options?.tone ?? 'info'
      const duration = options?.duration ?? (tone === 'error' ? 7000 : 4500)

      setToasts((current) => [
        ...current,
        {
          id,
          tone,
          message,
          actionLabel: options?.actionLabel,
          onAction: options?.onAction,
        },
      ])

      const timer = setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  const pauseTimer = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
  }, [])

  const resumeTimer = useCallback(
    (id: number) => {
      const timer = setTimeout(() => dismiss(id), 2000)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="pg-toast-viewport" role="region" aria-label="Notifications">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                role={toast.tone === 'error' ? 'alert' : 'status'}
                aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
                className={`pg-toast pg-toast--${toast.tone}`}
                onMouseEnter={() => pauseTimer(toast.id)}
                onMouseLeave={() => resumeTimer(toast.id)}
              >
                <ToastGlyph tone={toast.tone} />
                <p className="pg-toast-message">{toast.message}</p>
                {toast.actionLabel && (
                  <button
                    type="button"
                    className="pg-toast-action"
                    onClick={() => {
                      toast.onAction?.()
                      dismiss(toast.id)
                    }}
                  >
                    {toast.actionLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="pg-toast-close"
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(toast.id)}
                >
                  <CloseGlyph />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

function ToastGlyph({ tone }: { tone: ToastTone }) {
  if (tone === 'success') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12.5 10 17 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (tone === 'error') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7.5v5.5M12 16.2v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.8v5M12 7.8v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
