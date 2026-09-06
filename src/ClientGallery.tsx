import { useCallback, useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { AuthedImage } from './AuthedImage'
import { ToastProvider, useToast } from './components/Toast'
import { SelectionBar } from './components/SelectionBar'
import { Lightbox } from './components/Lightbox'
import type { ProofAlbum, ProofGalleryMeta, ProofPhoto } from './components/proofTypes'
import { loadSelectionSnapshot, saveSelectionSnapshot } from './storage/indexedDb'
import { getSyncStatus } from './sync/client'
import {
  enqueueOutboxMutation,
  getPendingOutboxMutations,
  hydrateOutboxMutationFromSelection,
  type OutboxMutation,
} from './sync/outbox'
import { createSelectionMutation } from './sync/selection'
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

function outboxCacheKey(accessToken: string) {
  return `proof-gallery-outbox:${accessToken}`
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
  const [showOnlySelected, setShowOnlySelected] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`proof-gallery-filter:${accessToken}`) === 'selected'
    } catch {
      return false
    }
  })
  const [selected, setSelected] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`proof-gallery-selection:${accessToken}`) || '[]'))
    } catch {
      return new Set()
    }
  })
  const [outbox, setOutbox] = useState<OutboxMutation[]>(() => {
    try {
      const raw = localStorage.getItem(outboxCacheKey(accessToken))
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    let cancelled = false
    void loadSelectionSnapshot(accessToken).then((ids) => {
      if (!cancelled) setSelected(new Set(ids))
    })

    return () => {
      cancelled = true
    }
  }, [accessToken])

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

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
    const source = activeAlbumId === 'all' ? photos : photos.filter((photo) => photo.albumId === activeAlbumId)
    if (showOnlySelected) return source.filter((photo) => selected.has(photo.id))
    return source
  }, [photos, activeAlbumId, selected, showOnlySelected])

  const toggleSelect = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      const selectedNow = next.has(id)
      const mutation = createSelectionMutation(id, !selectedNow, 'favorites')
      setOutbox((queue) => enqueueOutboxMutation(queue, hydrateOutboxMutationFromSelection(mutation)))
      if (selectedNow) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    const idsToClear = Array.from(selected)
    if (idsToClear.length === 0) return

    setOutbox((queue) => {
      const nextQueue = [...queue]
      for (const id of idsToClear) {
        const mutation = createSelectionMutation(id, false, 'favorites')
        nextQueue.unshift(hydrateOutboxMutationFromSelection(mutation))
      }
      return nextQueue
    })
    setSelected(new Set())
  }, [selected])

  useEffect(() => {
    try {
      localStorage.setItem(`proof-gallery-selection:${accessToken}`, JSON.stringify(Array.from(selected)))
    } catch {
      // Selection persistence is best effort.
    }

    void saveSelectionSnapshot(accessToken, Array.from(selected))
  }, [accessToken, selected])

  useEffect(() => {
    try {
      localStorage.setItem(`proof-gallery-filter:${accessToken}`, showOnlySelected ? 'selected' : 'all')
    } catch {
      // Filter persistence is best effort.
    }
  }, [accessToken, showOnlySelected])

  useEffect(() => {
    try {
      localStorage.setItem(outboxCacheKey(accessToken), JSON.stringify(outbox))
    } catch {
      // Outbox persistence is best effort.
    }
  }, [accessToken, outbox])

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
    setDownloadProgress(0)

    try {
      const zip = new JSZip()
      const photoIds = Array.from(selected)
      const chunkSize = 3

      for (let chunkIndex = 0; chunkIndex < photoIds.length; chunkIndex += chunkSize) {
        const slice = photoIds.slice(chunkIndex, chunkIndex + chunkSize)

        for (let itemIndex = 0; itemIndex < slice.length; itemIndex += 1) {
          const photoId = slice[itemIndex]
          const absoluteIndex = chunkIndex + itemIndex + 1
          const res = await fetch(
            `/api/g/${encodeURIComponent(accessToken)}/photos/${encodeURIComponent(photoId)}?download=true`,
          )

          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `Could not download proof ${absoluteIndex}.`)
          }

          const blob = await res.blob()
          const safeName = `proof-${String(absoluteIndex).padStart(3, '0')}${blob.type.includes('png') ? '.png' : '.jpg'}`
          zip.file(safeName, blob)
          setDownloadProgress(Math.round((absoluteIndex / photoIds.length) * 100))
        }
      }

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })
      const url = URL.createObjectURL(blob)
      const galleryTitle = state.status === 'ready' ? state.gallery.title : 'proofs'
      const link = document.createElement('a')
      link.href = url
      link.download = `${galleryTitle.replace(/\s+/g, '-').toLowerCase()}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      setDownloadProgress(100)
      const count = selected.size
      showToast(`${count} ${count === 1 ? 'proof' : 'proofs'} downloaded.`, { tone: 'success' })
      clearSelection()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Download failed. Try again.', { tone: 'error' })
    } finally {
      setDownloading(false)
      setDownloadProgress(0)
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
  const pendingMutations = useMemo(() => getPendingOutboxMutations(outbox), [outbox])
  const pendingCount = pendingMutations.length
  const syncStatus = getSyncStatus(isOnline, pendingCount)

  useEffect(() => {
    if (!isOnline || pendingMutations.length === 0) return

    let cancelled = false
    const syncIds = new Set(pendingMutations.map((mutation) => mutation.id))

    setOutbox((queue) => queue.map((item) => (syncIds.has(item.id) ? { ...item, status: 'syncing' } : item)))

    const replaySelectionMutations = async () => {
      try {
        const response = await fetch(`/api/g/${encodeURIComponent(accessToken)}/selection/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mutations: pendingMutations.map((mutation) => ({
              id: mutation.id,
              type: mutation.type,
              payload: mutation.payload,
              createdAt: mutation.createdAt,
              retryCount: mutation.retryCount,
            })),
          }),
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          const errorMessage = body.error || 'Selection sync is temporarily unavailable.'
          throw new Error(errorMessage)
        }

        if (!cancelled) {
          setOutbox((queue) => queue.filter((item) => !syncIds.has(item.id)))
        }
      } catch (error) {
        if (cancelled) return

        const message = error instanceof Error ? error.message : 'Selection sync failed. We will retry when the connection is back.'
        showToast(message, { tone: 'info' })
        setOutbox((queue) => queue.map((item) => (syncIds.has(item.id) ? { ...item, status: 'failed', retryCount: item.retryCount + 1 } : item)))
      }
    }

    void replaySelectionMutations()

    return () => {
      cancelled = true
    }
  }, [accessToken, isOnline, pendingMutations, showToast])

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
            All photos
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
          <button
            type="button"
            className={`pg-chip pg-chip--toggle${showOnlySelected ? ' pg-chip--active' : ''}`}
            onClick={() => setShowOnlySelected((current) => !current)}
            aria-pressed={showOnlySelected}
          >
            {showOnlySelected ? 'Selected proofs only' : 'Selected proofs'}
          </button>
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
        total={photos.length}
        onDownload={handleDownload}
        onClear={clearSelection}
        downloading={downloading}
        downloadProgress={downloadProgress}
        syncStatus={syncStatus}
        showOnlySelected={showOnlySelected}
        onToggleShowOnlySelected={() => setShowOnlySelected((current) => !current)}
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
