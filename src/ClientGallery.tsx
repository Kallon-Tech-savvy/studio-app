import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { AuthedImage } from './AuthedImage'
import type { GalleryStatus } from './types'
import {
  canDownloadGallery,
  canSelectFromGallery,
  getDeliveryStatusMessage,
  getDeliveryStatusTone,
} from './domain/gallery'

type Gallery = { 
  id: string
  title: string
  description: string | null
  status: GalleryStatus
  downloads_enabled: boolean
  selection_enabled: boolean
  watermark_enabled: boolean
  event_date: string
  total_amount?: number | null
  amount_paid?: number | null
  client_name?: string | null
}

type Album = {
  id: string
  name: string
  description: string | null
  cover_photo_id: string | null
}

type Photo = { 
  id: string
  album_id: string | null
  taken_at: string | null 
}

import { CheckIcon, CloseIcon, CopyIcon, DownloadIcon, HeartFilled, HeartOutline, LockIcon } from './components/icon'
import { PhotoStack3D } from './components/PhotoStack3D'

export function ClientGallery({ token }: { token: string }) {
  const [gallery, setGallery] = useState<Gallery | null | undefined>(undefined)
  const [albums, setAlbums] = useState<Album[]>([])
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  
  // Filtering & curation
  const [activeAlbumId, setActiveAlbumId] = useState<string>('all')
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [copiedFavorites, setCopiedFavorites] = useState(false)
  const [zipStatus, setZipStatus] = useState<string | null>(null)
  
  // Lightbox index
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const isLightboxOpen = lightboxIndex !== null
  const lightboxModalRef = useRef<HTMLDivElement>(null)
  const lightboxTriggerRef = useRef<HTMLElement | null>(null)

  // A quiet in-app note instead of the browser's own alert() dialog — a
  // system alert box breaks the mood of the whole page and feels like an
  // error even when the message is just "not quite yet". This fades in
  // as a small card near the top and clears itself after a few seconds.
  const [note, setNote] = useState<string | null>(null)
  const showNote = (message: string) => {
    setNote(message)
    window.clearTimeout((showNote as unknown as { timer?: number }).timer)
    ;(showNote as unknown as { timer?: number }).timer = window.setTimeout(() => setNote(null), 5000)
  }

  // Load liked items from localstorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`proof_liked_${token}`)
      if (stored) {
        const parsed: unknown = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.every((id): id is string => typeof id === 'string')) {
          setLikedIds(new Set(parsed))
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, [token])

  const saveLikes = (newLikes: Set<string>) => {
    setLikedIds(newLikes)
    try {
      localStorage.setItem(`proof_liked_${token}`, JSON.stringify([...newLikes]))
    } catch (e) {
      console.error(e)
    }
  }

  // API loading
  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    setGallery(undefined)
    setAlbums([])
    setPhotos(null)
    setActiveAlbumId('all')
    setLightboxIndex(null)

    fetch(`/api/g/${encodeURIComponent(token)}`, { signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Gallery not found')
        return res.json()
      })
      .then((body) => setGallery(body.gallery ?? null))
      .catch((err) => {
        if (err?.name !== 'AbortError') setGallery(null)
      })

    fetch(`/api/g/${encodeURIComponent(token)}/albums`, { signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load albums')
        return res.json()
      })
      .then((body) => setAlbums(Array.isArray(body.albums) ? body.albums : []))
      .catch((err) => {
        if (err?.name !== 'AbortError') setAlbums([])
      })

    fetch(`/api/g/${encodeURIComponent(token)}/photos`, { signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load photos')
        return res.json()
      })
      .then((body) => setPhotos(Array.isArray(body.photos) ? body.photos : []))
      .catch((err) => {
        if (err?.name !== 'AbortError') setPhotos([])
      })

    return () => controller.abort()
  }, [token])

  // Computed Business Rules — delegated to src/domain/gallery.ts so this
  // view can't drift from AdminPanel's copy of the same rules.
  const totalAmount = Number(gallery?.total_amount ?? 0)
  const amountPaid = Number(gallery?.amount_paid ?? 0)
  const outstandingBalance = Math.max(0, totalAmount - amountPaid)
  const hasUnpaidBalance = outstandingBalance > 0
  const isDraft = gallery?.status === 'DRAFT'
  const isDeliveryReady = gallery ? gallery.status === 'READY' || gallery.status === 'PUBLISHED' : false

  // The client record is flattened onto the gallery payload for this
  // token-gated view, so we shape it into the Pick<Client, ...> the domain
  // functions expect.
  const clientLike = { total_amount: totalAmount, amount_paid: amountPaid }

  const canDownload = gallery ? canDownloadGallery(gallery, clientLike) : false
  const canSelect = gallery ? canSelectFromGallery(gallery, clientLike) : false
  const deliveryStatusTone = gallery ? getDeliveryStatusTone(gallery, clientLike) : 'muted'
  const deliveryStatusMessage = gallery ? getDeliveryStatusMessage(gallery, clientLike) : ''

  // Filter photos by active album selection
  const filteredPhotos = useMemo(
    () => photos
      ? activeAlbumId === 'all'
        ? photos
        : photos.filter((p) => p.album_id === activeAlbumId)
      : [],
    [photos, activeAlbumId],
  )

  const albumCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const photo of photos ?? []) {
      if (photo.album_id) counts.set(photo.album_id, (counts.get(photo.album_id) ?? 0) + 1)
    }
    return counts
  }, [photos])

  // Maps a photo id back to its position in the unfiltered roll ("Frame No.
  // 07 of 40" etc.) in O(1). The frame grid previously called
  // `photos.findIndex(...)` once per rendered card — an O(n) scan repeated
  // n times — so opening an album tab on a few-hundred-photo gallery did
  // O(n²) work just to paint frame numbers. Building this lookup once per
  // `photos` change makes both the grid and the lightbox O(n) overall.
  const photoIndexById = useMemo(() => {
    const map = new Map<string, number>()
    photos?.forEach((photo, index) => map.set(photo.id, index))
    return map
  }, [photos])

  useEffect(() => {
    if (lightboxIndex !== null && lightboxIndex >= filteredPhotos.length) {
      setLightboxIndex(null)
    }
  }, [lightboxIndex, filteredPhotos.length])

  useEffect(() => {
    if (lightboxIndex === null || filteredPhotos.length === 0) return

    // Remember what had focus before the modal opened, then move focus
    // inside it. Without this, a keyboard/screen-reader user's focus stays
    // wherever it was on the page behind an overlay that visually covers it.
    lightboxTriggerRef.current = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => {
      lightboxModalRef.current?.querySelector<HTMLElement>('.lightbox-modal-close')?.focus()
    }, 0)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null)
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) =>
          prev !== null && prev < filteredPhotos.length - 1 ? prev + 1 : prev
        )
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) =>
          prev !== null && prev > 0 ? prev - 1 : prev
        )
      } else if (e.key === 'Tab') {
        // Basic focus trap: keep Tab/Shift+Tab cycling within the dialog
        // rather than escaping to the (still-present, just covered) page.
        const focusable = lightboxModalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusable || focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(focusTimer)
    }
  }, [lightboxIndex, filteredPhotos])

  // Return focus to whatever opened the lightbox once it closes.
  useEffect(() => {
    if (lightboxIndex === null) {
      lightboxTriggerRef.current?.focus()
    }
  }, [lightboxIndex])

  // Lock background scroll while the lightbox is open. Restores whatever
  // the page's own overflow value was, rather than assuming it was empty,
  // in case something else on the page ever sets it too.
  useEffect(() => {
    if (!isLightboxOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isLightboxOpen])

  const handleDownload = async (photoId: string, index: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!canDownload) {
      if (isDraft) {
        showNote('This gallery is still a draft preview — downloads unlock once the final edit is ready.')
      } else if (hasUnpaidBalance) {
        showNote(`Downloads unlock once the remaining balance is settled — NLe ${outstandingBalance.toLocaleString()} outstanding. Reach out to the studio to finish up.`)
      } else if (!isDeliveryReady) {
        showNote('This gallery isn\'t ready for delivery yet — check back once it\'s published.')
      }
      return
    }

    const url = `/api/g/${encodeURIComponent(token)}/photos/${encodeURIComponent(photoId)}?download=true`

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      // Match the actual file type instead of always assuming .jpg — a
      // studio delivering PNG masters would otherwise have every single
      // download mislabeled, which trips up some apps' file handling.
      const ext = res.headers.get('content-type')?.includes('png') ? 'png' : 'jpg'
      const filename = `Frame_${String(index + 1).padStart(2, '0')}.${ext}`
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch {
      showNote('Couldn\'t download that photo — please try again.')
    }
  }

  const handleDownloadAll = async () => {
    if (!canDownload || !photos || photos.length === 0 || !gallery) {
      if (isDraft) {
        showNote('This gallery is still a draft preview — downloads unlock once the final edit is ready.')
      } else if (hasUnpaidBalance) {
        showNote(`Downloads unlock once the remaining balance is settled — NLe ${outstandingBalance.toLocaleString()} outstanding. Reach out to the studio to finish up.`)
      } else if (!isDeliveryReady) {
        showNote('This gallery isn\'t ready for delivery yet — check back once it\'s published.')
      }
      return
    }
    setZipStatus("Preparing download...")
    
    try {
      const zip = new JSZip()

      setZipStatus(`Downloading 0 of ${photos.length}...`)
      let loaded = 0
      let finished = 0

      // Downloading one photo at a time here used to mean a 200-photo
      // wedding gallery took several minutes before the ZIP even started
      // compiling. A small worker pool fetches several photos at once —
      // still gentle on the connection, but a lot faster for the person
      // waiting on the other end.
      const CONCURRENCY = 5
      let nextIndex = 0

      async function worker() {
        while (true) {
          const i = nextIndex++
          if (i >= photos!.length) return
          const p = photos![i]

          try {
            const res = await fetch(`/api/g/${encodeURIComponent(token)}/photos/${encodeURIComponent(p.id)}?download=true`)
            if (res.ok) {
              const blob = await res.blob()
              const ext = res.headers.get('content-type')?.includes('png') ? 'png' : 'jpg'
              const filename = `Frame_${String(i + 1).padStart(2, '0')}.${ext}`
              zip.file(filename, blob)
              loaded++
            }
          } catch (e) {
            console.error(e)
          } finally {
            finished++
            setZipStatus(`Downloading ${finished} of ${photos!.length}...`)
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, photos.length) }, () => worker()))

      if (loaded === 0) {
        setZipStatus("Download failed.")
        setTimeout(() => setZipStatus(null), 3000)
        return
      }

      setZipStatus("Compiling ZIP...")
      const content = await zip.generateAsync({ type: 'blob' })
      
      setZipStatus("Saving archive...")
      const objectUrl = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = objectUrl
      const safeTitle = gallery.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      a.download = `proof_${safeTitle}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
      
      setZipStatus("Success!")
      setTimeout(() => setZipStatus(null), 3000)
    } catch {
      setZipStatus("ZIP compilation failed.")
      setTimeout(() => setZipStatus(null), 3000)
    }
  }

  const toggleLike = (photoId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const next = new Set(likedIds)
    if (next.has(photoId)) {
      next.delete(photoId)
    } else {
      next.add(photoId)
    }
    saveLikes(next)
  }

  const handleCopyFavorites = async () => {
    if (!photos || !gallery) return
    
    const likedFrames: string[] = []
    photos.forEach((p, index) => {
      if (likedIds.has(p.id)) likedFrames.push(`Frame No. ${String(index + 1).padStart(2, '0')}`)
    })

    const text = `My selected frames from "${gallery.title}":\n` + 
                 likedFrames.map((f) => `- ${f}`).join('\n') + 
                 `\n\nTotal: ${likedFrames.length} photos selected.`

    try {
      await navigator.clipboard.writeText(text)
      setCopiedFavorites(true)
      setTimeout(() => setCopiedFavorites(false), 3000)
    } catch {
      showNote('Couldn\'t copy your list — please try again.')
    }
  }

  if (gallery === undefined) {
    return (
      <main className="page client-page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
          <div className="custom-loader" />
          <p className="status-note" style={{ background: 'none' }}>Opening your gallery…</p>
        </div>
      </main>
    )
  }

  if (gallery === null) {
    return (
      <main className="page client-page">
        <header className="site-header">
          <div className="site-header-corners" />
          <h1 className="wordmark">Proof</h1>
        </header>
        <div style={{ textAlign: 'center' }}>
          <PhotoStack3D />
          <p className="empty-note status-error">
            This private link doesn't match a gallery. Double-check it against the one your photographer sent.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="page client-page">
      <div className={`toast-note ${note ? 'toast-note--visible' : ''}`} role="status" aria-live="polite">
        {note}
      </div>

      <header className="site-header">
        <div className="site-header-corners" />
        <div className="wordmark-wrap">
          <div>
            <h1 className="wordmark">Proof</h1>
            <p className="wordmark-tag">{gallery.title}</p>
            {gallery.description && <p style={{ fontSize: '0.8rem', color: 'var(--olive)', marginTop: '4px', fontStyle: 'italic', maxWidth: '320px' }}>{gallery.description}</p>}
          </div>

          {photos && photos.length > 0 && (
            canDownload ? (
              <button className="btn btn-secondary" onClick={handleDownloadAll} disabled={zipStatus !== null}>
                {zipStatus ? (
                  <>
                    <div className="custom-loader" style={{ width: '12px', height: '12px', borderTopColor: 'var(--accent)' }} />
                    {zipStatus}
                  </>
                ) : (
                  <>
                    <DownloadIcon />
                    Download Gallery
                  </>
                )}
              </button>
            ) : hasUnpaidBalance ? (
              <button 
                className="btn btn-secondary" 
                style={{ opacity: 0.85, cursor: 'not-allowed', borderColor: 'var(--negative)', color: 'var(--negative)' }} 
                onClick={() => showNote(`Downloads unlock once the remaining balance is settled — NLe ${outstandingBalance.toLocaleString()} outstanding.`)}
              >
                <LockIcon />
                Downloads Locked (Unpaid Balance)
              </button>
            ) : isDraft ? (
              <button 
                className="btn btn-secondary" 
                style={{ opacity: 0.8, cursor: 'not-allowed' }} 
                onClick={() => showNote('This gallery is still a draft preview — downloads unlock once the final edit is ready.')}
              >
                Draft Preview (View Only)
              </button>
            ) : null
          )}
        </div>
      </header>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <div
          className={`client-status-card client-status-card--${deliveryStatusTone}`}
          style={{ maxWidth: '760px', width: '100%' }}
        >
          <div className="client-status-card__icon" aria-hidden="true">
            {isDraft ? '📷' : hasUnpaidBalance ? '💳' : !isDeliveryReady ? '⏳' : '✅'}
          </div>
          <div className="client-status-card__content">
            <strong>
              {isDraft
                ? 'Draft Preview'
                : hasUnpaidBalance
                  ? 'Download Locked'
                  : !isDeliveryReady
                    ? 'Gallery in Progress'
                    : 'Delivery Ready'}
            </strong>
            <span>{deliveryStatusMessage}</span>
          </div>
        </div>
      </div>

      {/* Watermark Label warning (if enabled) */}
      {gallery.watermark_enabled && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div className="status-note" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--accent)', padding: '6px 16px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span aria-hidden="true">🔐</span> These previews are watermarked for proofing — clean files once the gallery's fully delivered.
          </div>
        </div>
      )}

      {/* Album tabs selector (Ceremony, Portraits, etc.) */}
      {albums.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <button 
            className={`btn ${activeAlbumId === 'all' ? '' : 'btn-secondary'}`}
            style={{ borderRadius: '20px', padding: '6px 16px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
            onClick={() => setActiveAlbumId('all')}
          >
            All Frames ({photos?.length ?? 0})
          </button>
          {albums.map((a) => (
            <button 
              key={a.id}
              className={`btn ${activeAlbumId === a.id ? '' : 'btn-secondary'}`}
              style={{ borderRadius: '20px', padding: '6px 16px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
              onClick={() => setActiveAlbumId(a.id)}
            >
              {a.name} ({albumCounts.get(a.id) ?? 0})
            </button>
          ))}
        </div>
      )}

      {!photos && <p className="empty-note">Developing photographs…</p>}
      {photos?.length === 0 && (
        <div style={{ textAlign: 'center' }}>
          <PhotoStack3D size="sm" />
          <p className="empty-note">Nothing's been delivered here yet — check back soon.</p>
        </div>
      )}
      
      {photos && photos.length > 0 && (
        <div className="frame-grid">
          {filteredPhotos.map((p, i) => {
            const originalIndex = photoIndexById.get(p.id) ?? i
            const isLiked = likedIds.has(p.id)
            return (
              <div className="frame" key={p.id}>
                {/* Actions overlay conditionally loaded by gallery permissions */}
                <div className="frame-actions-overlay">
                  {canSelect && (
                    <button 
                      className={`frame-btn-icon ${isLiked ? 'frame-btn-icon--active' : ''}`}
                      onClick={(e) => toggleLike(p.id, e)}
                      title={isLiked ? 'Unlike photo' : 'Like photo'}
                      aria-label={isLiked ? `Unlike frame ${originalIndex + 1}` : `Like frame ${originalIndex + 1}`}
                      aria-pressed={isLiked}
                    >
                      {isLiked ? <HeartFilled /> : <HeartOutline />}
                    </button>
                  )}
                  {canDownload && (
                    <button 
                      className="frame-btn-icon"
                      onClick={(e) => handleDownload(p.id, originalIndex, e)}
                      title="Download high-res master"
                      aria-label={`Download frame ${originalIndex + 1}`}
                    >
                      <DownloadIcon />
                    </button>
                  )}
                </div>

                <div
                  className="thumb-wrap"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open frame ${originalIndex + 1} in the lightbox`}
                  onClick={() => setLightboxIndex(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setLightboxIndex(i)
                    }
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <AuthedImage src={`/api/g/${encodeURIComponent(token)}/photos/${encodeURIComponent(p.id)}`} alt={gallery.title} />
                    
                    {/* Visual Watermark pattern overlay on thumbnail preview */}
                    {gallery.watermark_enabled && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                        <div style={{ transform: 'rotate(-30deg)', fontSize: '0.8rem', fontWeight: 800, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', border: '1px solid rgba(255,255,255,0.15)', padding: '2px 8px', textTransform: 'uppercase' }}>
                          Proof
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="frame-number">
                  <span>No. {String(originalIndex + 1).padStart(2, '0')}</span>
                  {isLiked && <span className="favorites-bar-heart" style={{ display: 'inline' }} aria-hidden="true">❤️</span>}
                  <span className="frame-handwritten">Proof</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Floating Bottom favorites curation bar */}
      {canSelect && (
        <div className={`favorites-bar ${likedIds.size > 0 ? 'favorites-bar--visible' : ''}`}>
          <div className="favorites-bar-info">
            <span className="favorites-bar-heart" aria-hidden="true">❤️</span>
            <span><strong>{likedIds.size}</strong> {likedIds.size === 1 ? 'frame' : 'frames'} selected</span>
          </div>
          <div className="favorites-bar-actions">
            <button className="btn" style={{ padding: '6px 16px', fontSize: '0.75rem' }} onClick={handleCopyFavorites}>
              {copiedFavorites ? <CheckIcon /> : <CopyIcon />}
              {copiedFavorites ? 'Copied list!' : 'Copy List'}
            </button>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '0.75rem' }} 
              onClick={() => {
                if (likedIds.size > 1 && !window.confirm(`Clear all ${likedIds.size} selected frames?`)) return
                saveLikes(new Set())
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Slide Lightbox zoom Modal */}
      {lightboxIndex !== null && photos && (
        <div ref={lightboxModalRef} className="lightbox-modal" role="dialog" aria-modal="true" aria-label={`${gallery.title} lightbox`} onClick={() => setLightboxIndex(null)}>
          <button type="button" className="lightbox-modal-close" onClick={() => setLightboxIndex(null)} aria-label="Close lightbox">
            <CloseIcon />
          </button>

          {lightboxIndex > 0 && (
            <button 
              className="lightbox-modal-nav lightbox-modal-nav--prev" 
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1) }}
              aria-label="Previous photo"
            >
              ◀
            </button>
          )}

          <div className="lightbox-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ position: 'relative' }}>
              <img 
                src={`/api/g/${encodeURIComponent(token)}/photos/${filteredPhotos[lightboxIndex].id}`} 
                alt={`Frame ${lightboxIndex + 1}`} 
                className="lightbox-modal-image"
              />
              {/* Visual Watermark on large Lightbox viewer preview */}
              {gallery.watermark_enabled && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', overflow: 'hidden' }}>
                  <div style={{ transform: 'rotate(-30deg)', fontSize: '2.5rem', fontWeight: 800, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)', border: '4px solid rgba(255,255,255,0.12)', padding: '10px 30px', textTransform: 'uppercase' }}>
                    PROOF · NOT FINAL
                  </div>
                </div>
              )}
            </div>
            
            <div className="lightbox-modal-title">
              Frame No. {String(lightboxIndex + 1).padStart(2, '0')} · {gallery.title}
            </div>
            
            <div className="lightbox-modal-actions">
              {canSelect && (
                <button 
                  className={`btn ${likedIds.has(filteredPhotos[lightboxIndex].id) ? '' : 'btn-secondary'}`}
                  style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                  onClick={() => toggleLike(filteredPhotos[lightboxIndex].id)}
                >
                  {likedIds.has(filteredPhotos[lightboxIndex].id) ? <HeartFilled /> : <HeartOutline />}
                  {likedIds.has(filteredPhotos[lightboxIndex].id) ? 'Selected' : 'Select Frame'}
                </button>
              )}
              {canDownload && (
                <button 
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                  onClick={() => {
                    const photo = filteredPhotos[lightboxIndex]
                    const originalIndex = photoIndexById.get(photo.id) ?? lightboxIndex
                    void handleDownload(photo.id, originalIndex)
                  }}
                >
                  <DownloadIcon />
                  Download
                </button>
              )}
            </div>
          </div>

          {lightboxIndex < filteredPhotos.length - 1 && (
            <button 
              className="lightbox-modal-nav lightbox-modal-nav--next" 
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1) }}
              aria-label="Next photo"
            >
              ▶
            </button>
          )}
        </div>
      )}
    </main>
  )
}