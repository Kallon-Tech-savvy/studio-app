import { useCallback, useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { AuthedImage } from './AuthedImage'
import { ToastProvider, useToast } from './components/Toast'
import { SelectionBar } from './components/SelectionBar'
import { Lightbox } from './components/Lightbox'
import type { ProofAlbum, ProofGalleryMeta, ProofPhoto } from './components/proofTypes'
import './client-gallery.css'

// Client-facing gallery for a single roll, reached at /g/:accessToken.
//
// Expected API surface (adjust to match your real backend):
//   GET  /api/g/:accessToken             -> { gallery, albums, photos }
//   POST /api/g/:accessToken/download    -> zip blob, body: { photoIds: string[] }
//   photo bytes                          -> /api/g/:accessToken/photos/:id (via AuthedImage)

interface ClientGalleryProps {
  accessToken: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; gallery: ProofGalleryMeta; albums: ProofAlbum[]; photos: ProofPhoto[] }

function galleryCacheKey(accessToken: string) {
  return `proof-gallery-cache:${accessToken}`
}

function readGalleryCache(accessToken: string): LoadState {
  try {
    const cached = localStorage.getItem(galleryCacheKey(accessToken))
    if (cached) return JSON.parse(cached) as LoadState
  } catch {
    // Cache hydration is best effort.
  }
  return { status: 'loading' }
}

// A repeating span pattern gives the grid the uneven rhythm of a contact
// sheet an editor has marked up — some frames called out bigger — rather
// than a uniform Pinterest-style wall. Kept short and legible in code so
// the ratio is easy to retune.
const SPAN_PATTERN: Array<'normal' | 'wide' | 'tall'> = [
  'normal',
  'normal',
  'wide',
  'normal',
  'tall',
  'normal',
  'wide',
  'normal',
  'normal',
  'tall',
]

function spanClassFor(index: number): string {
  const kind = SPAN_PATTERN[index % SPAN_PATTERN.length]
  if (kind === 'wide') return 'pg-tile--wide'
  if (kind === 'tall') return 'pg-tile--tall'
  return ''
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  return reduced
}

export default function ClientGallery({ accessToken }: ClientGalleryProps) {
  // The toast system needs a provider above anything that calls useToast(),
  // so the public export wraps the real component rather than each page
  // that renders <ClientGallery /> having to remember to add one.
  return (
    <ToastProvider>
      <ClientGalleryInner accessToken={accessToken} />
    </ToastProvider>
  )
}

function ClientGalleryInner({ accessToken }: ClientGalleryProps) {
  const { showToast } = useToast()
  const prefersReducedMotion = usePrefersReducedMotion()

  const [state, setState] = useState<LoadState>(() => readGalleryCache(accessToken))
  const [activeAlbumId, setActiveAlbumId] = useState<string | 'all'>('all')
  const [selected, setSelected] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`proof-gallery-selection:${accessToken}`) || '[]'))
    } catch {
      return new Set()
    }
  })
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setState(readGalleryCache(accessToken))

    const getJson = async (path: string) => {
      const res = await fetch(path, { signal: controller.signal })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'This gallery link is no longer valid.')
      return body
    }

    Promise.all([
      getJson(`/api/g/${accessToken}`),
      getJson(`/api/g/${accessToken}/albums`),
      getJson(`/api/g/${accessToken}/photos`),
    ])
      .then(([galleryBody, albumsBody, photosBody]) => {
        const gallery = galleryBody.gallery
        const totalAmount = Number(gallery.total_amount ?? 0)
        const amountPaid = Number(gallery.amount_paid ?? 0)
        const isDraft = gallery.status === 'DRAFT'
        const hasOutstandingBalance = totalAmount > amountPaid
        const locked = isDraft || hasOutstandingBalance || !gallery.downloads_enabled
        const lockedReason = isDraft
          ? 'Previews only for now — downloads open once the gallery is finalized.'
          : hasOutstandingBalance
            ? 'Downloads unlock once the remaining balance is paid.'
            : !gallery.downloads_enabled
              ? 'Downloads are not enabled for this gallery yet.'
              : undefined

        const nextState: LoadState = {
          status: 'ready',
          gallery: {
            id: gallery.id,
            title: gallery.title,
            description: gallery.description,
            welcomeMessage: gallery.description,
            status: gallery.status,
            downloadsEnabled: gallery.downloads_enabled,
            selectionEnabled: gallery.selection_enabled,
            watermarkEnabled: gallery.watermark_enabled,
            totalAmount,
            amountPaid,
            locked,
            lockedReason,
          },
          albums: (albumsBody.albums ?? []).map((album: { id: string; name: string; description: string | null; cover_photo_id: string | null }) => ({
            id: album.id,
            title: album.name,
            description: album.description,
            coverPhotoId: album.cover_photo_id,
          })),
          photos: (photosBody.photos ?? []).map((photo: { id: string; album_id: string | null }) => ({
            id: photo.id,
            albumId: photo.album_id,
            filename: `Proof ${photo.id.slice(0, 8)}`,
            locked,
            lockedReason,
          })),
        }
        setState(nextState)
        try {
          localStorage.setItem(galleryCacheKey(accessToken), JSON.stringify(nextState))
        } catch {
          // Cache hydration is best effort.
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => controller.abort()
  }, [accessToken])

  const photos = state.status === 'ready' ? state.photos : []

  const visiblePhotos = useMemo(() => {
    if (activeAlbumId === 'all') return photos
    return photos.filter((photo) => photo.albumId === activeAlbumId)
  }, [photos, activeAlbumId])

  const toggleSelect = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  useEffect(() => {
    try {
      localStorage.setItem(`proof-gallery-selection:${accessToken}`, JSON.stringify(Array.from(selected)))
    } catch {
      // Selection persistence is best effort.
    }
  }, [accessToken, selected])

  const handleLockedSelect = useCallback(
    (photo: ProofPhoto) => {
      showToast(
        photo.lockedReason || 'This proof unlocks once the gallery is marked delivered.',
        { tone: 'info' },
      )
    },
    [showToast],
  )

  const handleDownload = useCallback(async () => {
    if (selected.size === 0) return
    setDownloading(true)
    try {
      const zip = new JSZip()
      const photoIds = Array.from(selected)
      const responses = await Promise.all(
        photoIds.map(async (photoId, index) => {
          const res = await fetch(
            `/api/g/${encodeURIComponent(accessToken)}/photos/${encodeURIComponent(photoId)}?download=true`,
          )
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `Could not download proof ${index + 1}.`)
          }
          return { index, blob: await res.blob() }
        }),
      )

      for (const { index, blob } of responses) {
        zip.file(`proof-${String(index + 1).padStart(3, '0')}.jpg`, blob)
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const galleryTitle = state.status === 'ready' ? state.gallery.title : 'proofs'
      const link = document.createElement('a')
      link.href = url
      link.download = `${galleryTitle.replace(/\s+/g, '-').toLowerCase()}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      const count = selected.size
      showToast(`${count} ${count === 1 ? 'proof' : 'proofs'} downloaded.`, { tone: 'success' })
      clearSelection()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Download failed. Try again.', { tone: 'error' })
    } finally {
      setDownloading(false)
    }
  }, [accessToken, selected, state, showToast, clearSelection])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showToast('Link copied.', { tone: 'success' })
    } catch {
      showToast('Could not copy automatically — copy it from the address bar instead.', { tone: 'error' })
    }
  }, [showToast])

  if (state.status === 'loading') {
    return (
      <div className="pg-gallery pg-gallery--loading">
        <div className="pg-skeleton-grid" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={`pg-skeleton-tile ${spanClassFor(i)}`} />
          ))}
        </div>
        <p className="pg-status-note" role="status">
          Developing your gallery…
        </p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="pg-gallery pg-gallery--error">
        <p className="pg-status-note pg-status-note--error" role="alert">
          {state.message}
        </p>
      </div>
    )
  }

  const { gallery, albums } = state

  return (
    <div className={`pg-gallery${prefersReducedMotion ? ' pg-gallery--reduced-motion' : ''}`}>
      <div className="pg-sprockets" aria-hidden="true" />

      <header className="pg-header">
        <div className="pg-header-text">
          <p className="pg-eyebrow">Private gallery</p>
          <h1 className="pg-title">{gallery.title}</h1>
          {gallery.welcomeMessage && <p className="pg-welcome">{gallery.welcomeMessage}</p>}
          <p className="pg-meta">
            {photos.length} {photos.length === 1 ? 'proof' : 'proofs'}
            {albums.length > 0
              ? ` across ${albums.length} ${albums.length === 1 ? 'album' : 'albums'}`
              : ''}
          </p>
        </div>
        <button type="button" className="pg-btn pg-btn--ghost" onClick={handleCopyLink}>
          Copy link
        </button>
      </header>

      {gallery.locked && (
        <div className="pg-lock-banner" role="note">
          <LockGlyph />
          <p>
            {gallery.lockedReason ||
              'Previews only for now — full-resolution downloads open once your gallery is marked delivered.'}
          </p>
        </div>
      )}

      {albums.length > 0 && (
        <div className="pg-album-filters" role="tablist" aria-label="Filter by album">
          <button
            type="button"
            role="tab"
            aria-selected={activeAlbumId === 'all'}
            className={`pg-chip${activeAlbumId === 'all' ? ' pg-chip--active' : ''}`}
            onClick={() => setActiveAlbumId('all')}
          >
            All
          </button>
          {albums.map((album) => (
            <button
              key={album.id}
              type="button"
              role="tab"
              aria-selected={activeAlbumId === album.id}
              className={`pg-chip${activeAlbumId === album.id ? ' pg-chip--active' : ''}`}
              onClick={() => setActiveAlbumId(album.id)}
            >
              {album.title}
            </button>
          ))}
        </div>
      )}

      {visiblePhotos.length === 0 ? (
        <p className="pg-empty-note">No proofs in this album yet.</p>
      ) : (
        <ul className="pg-grid">
          {visiblePhotos.map((photo, i) => {
            const isSelected = selected.has(photo.id)
            return (
              <li key={photo.id} className={`pg-tile ${spanClassFor(i)}`}>
                <button
                  type="button"
                  className="pg-tile-frame"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`Open proof ${i + 1} of ${visiblePhotos.length}, ${photo.filename}`}
                >
                  <AuthedImage
                    src={`/api/g/${accessToken}/photos/${photo.id}`}
                    alt={photo.filename}
                  />
                  <span className="pg-tile-number" aria-hidden="true">
                    {String(i + 1).padStart(3, '0')}
                  </span>
                  {photo.locked && (
                    <span className="pg-tile-lock" aria-hidden="true">
                      <LockGlyph small />
                    </span>
                  )}
                </button>

                <label
                  className={`pg-tile-check${isSelected ? ' pg-tile-check--checked' : ''}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => (photo.locked ? handleLockedSelect(photo) : toggleSelect(photo.id))}
                    aria-label={
                      isSelected
                        ? `Deselect proof ${i + 1}`
                        : photo.locked
                          ? `Proof ${i + 1} is locked`
                          : `Select proof ${i + 1}`
                    }
                  />
                  <span className="pg-tile-check-mark" aria-hidden="true">
                    <CheckGlyph />
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          photos={visiblePhotos}
          index={lightboxIndex}
          accessToken={accessToken}
          isSelected={(id) => selected.has(id)}
          onToggleSelect={toggleSelect}
          onLockedSelect={handleLockedSelect}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      <SelectionBar
        count={selected.size}
        onDownload={handleDownload}
        onClear={clearSelection}
        downloading={downloading}
      />
    </div>
  )
}

function LockGlyph({ small }: { small?: boolean }) {
  const size = small ? 13 : 18
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5 10 17 19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
