import App from './App'
import { ClientGallery } from './ClientGallery'

export function Router() {
  const match = window.location.pathname.match(/^\/g\/([^/]+)\/?$/)
  if (match) {
    return <ClientGallery token={match[1]} />
  }
  return <App />
}