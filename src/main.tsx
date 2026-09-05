import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import './index.css'
import { SetupNotice } from './components/SetupNotice'
import { OfflineBanner } from './components/OfflineBanner'

const root = createRoot(document.getElementById('root')!)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  }, { once: true })
}

function renderApp(children: ReactNode) {
  root.render(
    <StrictMode>
      <OfflineBanner />
      {children}
    </StrictMode>,
  )
}

const missingEnv = [
  !import.meta.env.VITE_SUPABASE_URL && 'VITE_SUPABASE_URL',
  !import.meta.env.VITE_SUPABASE_ANON_KEY && 'VITE_SUPABASE_ANON_KEY',
].filter((v): v is string => Boolean(v))

if (missingEnv.length > 0) {
  // Checked here, before Router (and therefore lib/supabase.ts) is ever
  // imported — a static import at the top of this file would run that
  // whole module graph regardless of any check placed below it, so the
  // Supabase client construction has to be avoided via this dynamic
  // import rather than caught after the fact.
  renderApp(<SetupNotice missing={missingEnv} />)
} else {
  import('./Router').then(({ Router }) => {
    renderApp(<Router />)
  })
}