import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import { LoginForm } from './LoginForm'
import { AdminPanel } from './AdminPanel'
import { AuthedImage } from './AuthedImage'

type Gallery = {
  id: string
  title: string
  cover_path: string | null
  created_at: string
}

type Photo = { id: string; r2_key: string; taken_at: string | null }

function Roll({ gallery, index }: { gallery: Gallery; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const [photos, setPhotos] = useState<Photo[] | null>(null)

  async function toggle() {
    if (!expanded && photos === null) {
      const res = await fetch(`/api/galleries/${gallery.id}/photos`)
      const body = await res.json()
      setPhotos(body.photos ?? [])
    }
    setExpanded((e) => !e)
  }

  return (
    <li className="roll">
      <button className="roll-header" onClick={toggle} aria-expanded={expanded}>
        <span>
          <span className="roll-label">Roll {String(index + 1).padStart(2, '0')}</span>
          <span className="roll-title">{gallery.title}</span>
        </span>
        <span className="roll-count">
          {photos ? `${photos.length} frame${photos.length === 1 ? '' : 's'}` : ''} {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className="frame-grid">
          {photos?.length === 0 && <p className="empty-note">Nothing's been developed for this roll yet.</p>}
          {photos?.map((p, i) => (
            <div className="frame" key={p.id}>
              <div className="thumb-wrap">
                <AuthedImage src={`/api/photos/${p.id}`} alt={gallery.title} />
              </div>
              <div className="frame-number">No. {String(i + 1).padStart(2, '0')}</div>
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

export default function App() {
  const { session, loading: sessionLoading } = useSession()
  const [galleries, setGalleries] = useState<Gallery[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/galleries')
      .then((res) => res.json())
      .then((body) => {
        if (body.error) setError(body.error)
        else setGalleries(body.galleries)
      })
      .catch((err) => setError(String(err)))
  }, [])

  return (
    <main className="page">
      <header className="site-header">
        <h1 className="wordmark">
          Proof
          <span className="wordmark-tag">Client galleries, developed to order</span>
        </h1>
      </header>

      <section className="lightbox-section">
        <h2 className="section-heading">The Lightbox</h2>
        <p className="section-sub">Recent rolls, developed and ready to view.</p>

        <div className="sprocket-strip" aria-hidden="true" />

        {error && <p className="status-note status-error">Error: {error}</p>}
        {!error && !galleries && <p className="empty-note">Loading rolls…</p>}
        {galleries?.length === 0 && <p className="empty-note">Nothing's in the Lightbox yet.</p>}
        {galleries && galleries.length > 0 && (
          <ul className="roll-list">
            {galleries.map((g, i) => (
              <Roll key={g.id} gallery={g} index={i} />
            ))}
          </ul>
        )}
      </section>

      {sessionLoading ? (
        <p className="status-note">Loading session…</p>
      ) : session && session.user.email === import.meta.env.VITE_OWNER_EMAIL ? (
        <AdminPanel session={session} />
      ) : session ? (
        <div className="darkroom">
          <p className="status-note">
            This sign-in is for studio staff only. If you're a client, use the private
            link your photographer sent you instead — no login needed.
          </p>
          <button className="btn-link" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      ) : (
        <div className="darkroom">
          <LoginForm />
        </div>
      )}
    </main>
  )
}
