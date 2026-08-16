import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import { LoginForm } from './LoginForm'
import { AdminPanel } from './AdminPanel'
import { AuthedImage } from './AuthedImage'
import type { StaffMember } from './types'

type Gallery = {
  id: string
  title: string
  cover_path: string | null
  created_at: string
}

type Photo = { id: string; r2_key: string; taken_at: string | null }

// Anyone who can complete Supabase sign-up (see LoginForm's "Create staff
// account" mode) lands here on first login. This MUST stay zero-permission —
// it only exists so the UI has something to render before an owner/admin
// promotes the person via the real staff table. Do not default this to any
// role that can manage galleries, upload, or see finances: the client-side
// roster below is a convenience cache, not an access-control system, and a
// generous default here would let any self-registered visitor reach the
// Darkroom's write actions purely because the button became visible.
function createDefaultStaffMember(email: string, fullName?: string): StaffMember {
  return {
    email,
    name: fullName || email.split('@')[0],
    role: 'assistant',
    permissions: {
      manageGalleries: false,
      uploadPhotos: false,
      manageStaff: false,
      viewFinances: false,
    },
  }
}

function Roll({ gallery, index }: { gallery: Gallery; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (!expanded && photos === null && !loading) {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(`/api/galleries/${encodeURIComponent(gallery.id)}/photos`)
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'Unable to load this gallery.')
        setPhotos(Array.isArray(body.photos) ? body.photos : [])
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Unable to load this gallery.')
      } finally {
        setLoading(false)
      }
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
          {loading ? 'Loading…' : photos ? `${photos.length} frame${photos.length === 1 ? '' : 's'}` : ''} {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className="frame-grid">
          {loadError && <p className="empty-note status-error">{loadError}</p>}
          {!loadError && photos?.length === 0 && <p className="empty-note">No images yet</p>}
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
  const [staffAccess, setStaffAccess] = useState<StaffMember | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/galleries', { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'Unable to load the Lightbox.')
        return body
      })
      .then((body) => {
        if (Array.isArray(body.galleries)) setGalleries(body.galleries)
        else setGalleries([])
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : String(err))
      })

    return () => controller.abort()
  }, [])

  const [staffLoading, setStaffLoading] = useState(false)

  useEffect(() => {
    if (!session?.access_token) {
      setStaffAccess(null)
      setStaffLoading(false)
      return
    }

    const controller = new AbortController()
    setStaffLoading(true)

    fetch('/api/studio/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'Unable to fetch staff profile.')
        return body
      })
      .then((body) => {
        if (body.staff) {
          const profile: StaffMember = {
            email: body.staff.email || session.user.email || '',
            name: body.staff.full_name || session.user.email?.split('@')[0] || 'Staff Member',
            role: body.staff.role || 'assistant',
            permissions: {
              manageGalleries: Boolean(body.staff.permissions?.manageGalleries ?? (body.staff.role === 'owner')),
              uploadPhotos: Boolean(body.staff.permissions?.uploadPhotos ?? (body.staff.role === 'owner')),
              manageStaff: Boolean(body.staff.permissions?.manageStaff ?? (body.staff.role === 'owner')),
              viewFinances: Boolean(body.staff.permissions?.viewFinances ?? (body.staff.role === 'owner')),
            },
          }
          setStaffAccess(profile)
        } else {
          setStaffAccess(null)
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const ownerEmail = import.meta.env.VITE_OWNER_EMAIL as string | undefined
        if (ownerEmail && session.user?.email?.toLowerCase() === ownerEmail.toLowerCase()) {
          setStaffAccess({
            email: session.user.email,
            name: 'Studio owner',
            role: 'owner',
            permissions: {
              manageGalleries: true,
              uploadPhotos: true,
              manageStaff: true,
              viewFinances: true,
            },
          })
        } else {
          setStaffAccess(null)
        }
      })
      .finally(() => {
        setStaffLoading(false)
      })

    return () => controller.abort()
  }, [session])

  const canAccessAdmin = Boolean(staffAccess)

  return (
    <main className="page">
      <header className="site-header">
        <div className="site-header-corners" aria-hidden="true" />
        <div className="brand-wrap">
          <p className="eyebrow">MJ Photo Studio</p>
          <h1 className="wordmark">Proof</h1>
        </div>
        <p className="wordmark-tag">Thoughtful portraits, quiet stories, and the work we love to keep close.</p>
      </header>

      <section className="lightbox-section">
        <div className="section-headline">
          <div>
            <h2 className="section-heading">The Lightbox</h2>
            <p className="section-sub">Fresh moments, beautifully framed.</p>
          </div>
          <span className="pill">Selected works</span>
        </div>

        <div className="sprocket-strip" aria-hidden="true" />

        {error && <p className="status-note status-error">Error: {error}</p>}
        {!error && !galleries && <p className="empty-note">Loading photoshoot…</p>}
        {galleries?.length === 0 && <p className="empty-note">Nothing's in the Lightbox yet.</p>}
        {galleries && galleries.length > 0 && (
          <ul className="roll-list">
            {galleries.map((g, i) => (
              <Roll key={g.id} gallery={g} index={i} />
            ))}
          </ul>
        )}
      </section>

      {sessionLoading || staffLoading ? (
        <div className="darkroom darkroom-shell">
          <p className="status-note">Verifying studio staff permissions…</p>
        </div>
      ) : session && canAccessAdmin ? (
        <AdminPanel session={session} staff={staffAccess!} />
      ) : session ? (
        <div className="darkroom darkroom-shell">
          <div className="access-copy">
            <p className="eyebrow">Studio access</p>
            <h2 className="section-heading">This area is for the team.</h2>
            <p className="status-note">
              This sign-in is for studio staff only. If you're a client, use the private
              link your photographer sent you instead — no login needed.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      ) : (
        <div className="darkroom darkroom-shell">
          <div className="access-copy">
            <p className="eyebrow">Trusted access</p>
            <h2 className="section-heading">Darkroom entrance</h2>
            <p className="status-note">
              Staff log in here to manage shoots, gallery rolls, and image delivery.
            </p>
          </div>
          <div className="access-slot">
            <LoginForm />
          </div>
        </div>
      )}
    </main>
  )
}