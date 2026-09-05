import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    const handleOffline = () => {
      setOffline(true)
      setWasOffline(true)
    }
    const handleOnline = () => {
      setOffline(false)
      setWasOffline(true)
      window.setTimeout(() => setWasOffline(false), 3500)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  const visible = offline || (wasOffline && !offline)
  if (!visible) return null

  return (
    <div className={`offline-banner${offline ? '' : ' offline-banner--reconnected'}`} role="status" aria-live="polite">
      <span className="offline-banner__dot" aria-hidden="true" />
      {offline ? 'Offline mode: showing saved studio data where available.' : 'Back online. New studio data will sync when you refresh.'}
    </div>
  )
}
