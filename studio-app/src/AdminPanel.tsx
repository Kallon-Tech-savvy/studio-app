import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { AuthedImage } from './AuthedImage'

type MyGallery = {
  id: string
  title: string
  is_public: boolean
  client_email: string | null
  access_token: string
}
type Photo = { id: string; r2_key: string; taken_at: string | null }

export function AdminPanel({ session }: { session: Session }) {
  const [myGalleries, setMyGalleries] = useState<MyGallery[]>([])
  const [selectedGalleryId, setSelectedGalleryId] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newIsPublic, setNewIsPublic] = useState(false)
  const [newClientEmail, setNewClientEmail] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  async function loadGalleries() {
    // Runs with the browser's own session — RLS's "owners can read
    // their own galleries" policy is what scopes this to just theirs.
    const { data } = await supabase
      .from('galleries')
      .select('id, title, is_public, client_email, access_token')
      .order('created_at', { ascending: false })
    setMyGalleries(data ?? [])
  }

  async function loadPhotos(galleryId: string) {
    if (!galleryId) {
      setPhotos([])
      return
    }
    const res = await fetch(`/api/galleries/${galleryId}/photos`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const body = await res.json()
    setPhotos(body.photos ?? [])
  }

  useEffect(() => {
    loadGalleries()
  }, [])

  useEffect(() => {
    loadPhotos(selectedGalleryId)
  }, [selectedGalleryId])

  async function handleCreateGallery(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/galleries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ title: newTitle, is_public: newIsPublic, client_email: newClientEmail }),
    })
    const body = await res.json()

    if (res.ok) {
      setNewTitle('')
      setNewIsPublic(false)
      setNewClientEmail('')
      await loadGalleries()
      setSelectedGalleryId(body.gallery.id)
      setStatus(`New roll: "${body.gallery.title}" — copy its link below to share it.`)
    } else {
      setStatus(`Error: ${body.error}`)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0 || !selectedGalleryId) return

    let uploaded = 0
    for (const file of files) {
      setStatus(`Loading ${uploaded + 1} of ${files.length} — ${file.name}…`)
      const res = await fetch(
        `/api/galleries/${selectedGalleryId}/photos?filename=${encodeURIComponent(file.name)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        },
      )
      if (!res.ok) {
        const body = await res.json()
        setStatus(`Stopped at "${file.name}" (${uploaded} of ${files.length} loaded): ${body.error}`)
        e.target.value = ''
        if (uploaded > 0) await loadPhotos(selectedGalleryId)
        return
      }
      uploaded++
    }

    setStatus(`Loaded ${uploaded} photo${uploaded === 1 ? '' : 's'}`)
    e.target.value = ''
    await loadPhotos(selectedGalleryId)
  }

  async function handleCopyLink(token: string) {
    const url = `${window.location.origin}/g/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Link copied.')
    } catch {
      setStatus(url)
    }
  }

  return (
    <section className="darkroom">
      <div className="darkroom-heading">
        <h2 className="section-heading">Darkroom</h2>
        <p className="signed-in-as">
          {session.user.email} ·{' '}
          <button className="btn-link" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </p>
      </div>

      <form onSubmit={handleCreateGallery} className="field-stack">
        <div className="field">
          <label htmlFor="new-gallery-title">Roll title</label>
          <input
            id="new-gallery-title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="new-gallery-client">Client email (optional)</label>
          <input
            id="new-gallery-client"
            type="email"
            value={newClientEmail}
            onChange={(e) => setNewClientEmail(e.target.value)}
            placeholder="client@example.com"
          />
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={newIsPublic}
            onChange={(e) => setNewIsPublic(e.target.checked)}
          />
          Publish to the Lightbox
        </label>
        <button type="submit" className="btn">
          Load roll
        </button>
      </form>

      {myGalleries.length > 0 && (
        <ul className="roll-status-list">
          {myGalleries.map((g) => (
            <li key={g.id}>
              <span
                className={`status-dot${g.is_public ? ' status-dot--published' : ''}`}
                aria-hidden="true"
              />
              {g.title}
              {g.client_email && <span className="status-label">for {g.client_email}</span>}
              <button className="btn-link" onClick={() => handleCopyLink(g.access_token)}>
                Copy link
              </button>
            </li>
          ))}
        </ul>
      )}

      {myGalleries.length > 0 && (
        <div className="field-stack upload-block">
          <div className="field">
            <label htmlFor="gallery-select">Loading into</label>
            <select
              id="gallery-select"
              value={selectedGalleryId}
              onChange={(e) => setSelectedGalleryId(e.target.value)}
            >
              <option value="">Choose a roll…</option>
              {myGalleries.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
          <label
            className={`btn btn-secondary file-btn${!selectedGalleryId ? ' is-disabled' : ''}`}
            aria-disabled={!selectedGalleryId}
          >
            Load photos
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              disabled={!selectedGalleryId}
              hidden
            />
          </label>
        </div>
      )}

      {selectedGalleryId && (
        <div className="frame-grid">
          {photos.length === 0 && <p className="empty-note">This roll is empty. Load photos above.</p>}
          {photos.map((p, i) => (
            <div className="frame" key={p.id}>
              <div className="thumb-wrap">
                <AuthedImage src={`/api/photos/${p.id}`} accessToken={session.access_token} alt="Uploaded photo" />
              </div>
              <div className="frame-number">No. {String(i + 1).padStart(2, '0')}</div>
            </div>
          ))}
        </div>
      )}

      {status && <p className="status-note">{status}</p>}
    </section>
  )
}
