import { useEffect, useState } from 'react'
import { AuthedImage } from './AuthedImage'

type Gallery = { id: string; title: string }
type Photo = { id: string; taken_at: string | null }

export function ClientGallery({ token }: { token: string }) {
  const [gallery, setGallery] = useState<Gallery | null | undefined>(undefined)
  const [photos, setPhotos] = useState<Photo[] | null>(null)

  useEffect(() => {
    fetch(`/api/g/${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => setGallery(body.gallery))
      .catch(() => setGallery(null))

    fetch(`/api/g/${token}/photos`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => setPhotos(body.photos ?? []))
      .catch(() => setPhotos([]))
  }, [token])

  // undefined = still loading, null = the token didn't resolve to anything
  if (gallery === undefined) {
    return (
      <main className="page client-page">
        <p className="status-note">Loading…</p>
      </main>
    )
  }

  if (gallery === null) {
    return (
      <main className="page client-page">
        <header className="site-header">
          <h1 className="wordmark">Proof</h1>
        </header>
        <p className="empty-note">
          This link doesn't match a gallery. Double-check it against the one your photographer sent.
        </p>
      </main>
    )
  }

  return (
    <main className="page client-page">
      <header className="site-header">
        <h1 className="wordmark">Proof</h1>
        <p className="wordmark-tag">{gallery.title}</p>
      </header>

      {!photos && <p className="empty-note">Loading photographs…</p>}
      {photos?.length === 0 && <p className="empty-note">Nothing's been delivered here yet.</p>}
      {photos && photos.length > 0 && (
        <div className="frame-grid">
          {photos.map((p, i) => (
            <div className="frame" key={p.id}>
              <div className="thumb-wrap">
                <AuthedImage src={`/api/g/${token}/photos/${p.id}`} alt={gallery.title} />
              </div>
              <div className="frame-number">No. {String(i + 1).padStart(2, '0')}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
