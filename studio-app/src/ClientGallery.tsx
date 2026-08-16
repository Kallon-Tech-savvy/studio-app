import { useEffect, useState } from 'react'
import { AuthedImage } from './AuthedImage'

type Gallery = { 
  id: string
  title: string
  description: string | null
  status: string
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
  photo_count: number
}

type Photo = { 
  id: string
  album_id: string | null
  taken_at: string | null 
}

// Crisp SVG Icons
const HeartOutline = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  </svg>
)

const HeartFilled = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  </svg>
)

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" x2="12" y1="15" y2="3"/>
  </svg>
)

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  </svg>
)

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" x2="6" y1="6" y2="18"/>
    <line x1="6" x2="18" y1="6" y2="18"/>
  </svg>
)

export function ClientGallery({ token }: { token: string }) {
  const [gallery, setGallery] = useState<Gallery | null | undefined>(undefined)
  const [albums, setAlbums] = useState<Album[]>([])
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  
  // Filtering & curation
  const [activeAlbumId, setActiveAlbumId] = useState<string>('all')
  const [likedIds, setLikedIds] = useState<string[]>([])
  const [copiedFavorites, setCopiedFavorites] = useState(false)
  const [zipStatus, setZipStatus] = useState<string | null>(null)
  
  // Lightbox index
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Load liked items from localstorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`shoot_it_liked_${token}`)
      if (stored) {
        const parsed: unknown = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.every((id): id is string => typeof id === 'string')) {
          setLikedIds(parsed)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, [token])

  const saveLikes = (newLikes: string[]) => {
    const uniqueLikes = [...new Set(newLikes)]
    setLikedIds(uniqueLikes)
    try {
      localStorage.setItem(`shoot_it_liked_${token}`, JSON.stringify(uniqueLikes))
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

  // Computed Business Rules
  const totalAmount = Number(gallery?.total_amount ?? 0)
  const amountPaid = Number(gallery?.amount_paid ?? 0)
  const outstandingBalance = Math.max(0, totalAmount - amountPaid)
  const hasUnpaidBalance = outstandingBalance > 0
  const isDraft = gallery?.status === 'DRAFT'
  const isDeliveryReady = gallery ? ['READY', 'PUBLISHED'].includes(gallery.status) : false

  // Clients can preview gallery content, but full downloads stay locked while
  // a shoot is still in draft mode, still processing, or has an unpaid balance.
  const canDownload = Boolean(gallery?.downloads_enabled) && !hasUnpaidBalance && !isDraft && isDeliveryReady
  const canSelect = Boolean(gallery?.selection_enabled) && !hasUnpaidBalance && !isDraft

  const deliveryStatusTone =
    isDraft ? 'warning' : hasUnpaidBalance ? 'danger' : !isDeliveryReady ? 'muted' : 'success'

  const deliveryStatusMessage =
    isDraft
      ? 'Draft preview is live for review. Final delivery, downloads, and approval tools unlock once processing is complete.'
      : hasUnpaidBalance
        ? `Download access is locked until the remaining balance of NLe ${outstandingBalance.toLocaleString()} is settled.`
        : !isDeliveryReady
          ? 'This gallery is not yet ready for delivery. You can still review the preview while the final selection is being prepared.'
          : 'This gallery is ready for delivery and download access is active.'

  // Filter photos by active album selection
  const filteredPhotos = photos
    ? activeAlbumId === 'all'
      ? photos
      : photos.filter((p) => p.album_id === activeAlbumId)
    : []

  useEffect(() => {
    if (lightboxIndex === null || filteredPhotos.length === 0) return

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
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, filteredPhotos])

  const handleDownload = async (photoId: string, index: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!canDownload) {
      if (isDraft) {
        alert('Draft Shoot Preview: Image downloads will unlock once final processing is completed.')
      } else if (hasUnpaidBalance) {
        alert(`Download Access Locked: An outstanding balance of NLe ${outstandingBalance.toLocaleString()} remains on this photoshoot package. Please settle your remaining balance with the studio to unlock master downloads.`)
      } else if (!isDeliveryReady) {
        alert('This gallery is not ready for delivery yet. Please check back when the final gallery is published.')
      }
      return
    }

    const url = `/api/g/${encodeURIComponent(token)}/photos/${encodeURIComponent(photoId)}?download=true`
    const filename = `Frame_${String(index + 1).padStart(2, '0')}.jpg`
    
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch {
      alert("Oops! Could not download master. Try again.")
    }
  }

  const handleDownloadAll = async () => {
    if (!canDownload || !photos || photos.length === 0 || !gallery) {
      if (isDraft) {
        alert('Draft Shoot Preview: Image downloads will unlock once final processing is completed.')
      } else if (hasUnpaidBalance) {
        alert(`Download Access Locked: An outstanding balance of NLe ${outstandingBalance.toLocaleString()} remains on this photoshoot package. Please settle your remaining balance with the studio to unlock master downloads.`)
      } else if (!isDeliveryReady) {
        alert('This gallery is not ready for delivery yet. Please check back when the final gallery is published.')
      }
      return
    }
    setZipStatus("Preparing download...")
    
    try {
      if (!(window as any).JSZip) {
        setZipStatus("Loading ZIP utility...")
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
          script.onload = resolve
          script.onerror = reject
          document.body.appendChild(script)
        })
      }
      
      const JSZip = (window as any).JSZip
      const zip = new JSZip()
      
      setZipStatus("Downloading photos...")
      let loaded = 0
      
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i]
        setZipStatus(`Downloading frame ${i + 1} of ${photos.length}...`)
        
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
        }
      }

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
      a.download = `shoot_it_${safeTitle}.zip`
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
    if (likedIds.includes(photoId)) {
      saveLikes(likedIds.filter((id) => id !== photoId))
    } else {
      saveLikes([...likedIds, photoId])
    }
  }

  const handleCopyFavorites = async () => {
    if (!photos || !gallery) return
    
    const likedFrames = photos
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => likedIds.includes(p.id))
      .map(({ index }) => `Frame No. ${String(index + 1).padStart(2, '0')}`)
      
    const text = `My Selected Frames from "${gallery.title}" on Shoot it:\n` + 
                 likedFrames.map((f) => `- ${f}`).join('\n') + 
                 `\n\nTotal: ${likedFrames.length} photos selected.`

    try {
      await navigator.clipboard.writeText(text)
      setCopiedFavorites(true)
      setTimeout(() => setCopiedFavorites(false), 3000)
    } catch {
      alert("Failed to copy Favorites list.")
    }
  }

  if (gallery === undefined) {
    return (
      <main className="page client-page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
          <div className="custom-loader" />
          <p className="status-note" style={{ background: 'none' }}>Opening Shoot it Lightbox…</p>
        </div>
      </main>
    )
  }

  if (gallery === null) {
    return (
      <main className="page client-page">
        <header className="site-header">
          <div className="site-header-corners" />
          <h1 className="wordmark">Shoot it</h1>
        </header>
        <p className="empty-note status-error">
          This private link doesn't match a gallery. Double-check it against the one your photographer sent.
        </p>
      </main>
    )
  }

  return (
    <main className="page client-page">
      <header className="site-header">
        <div className="site-header-corners" />
        <div className="wordmark-wrap">
          <div>
            <h1 className="wordmark">Shoot it</h1>
            <p className="wordmark-tag">{gallery.title}</p>
            {gallery.description && <p style={{ fontSize: '0.8rem', color: 'var(--olive)', marginTop: '4px', fontStyle: 'italic', maxWidth: '320px' }}>{gallery.description}</p>}
          </div>

          {photos && photos.length > 0 && (
            canDownload ? (
              <button className="btn btn-secondary" onClick={handleDownloadAll} disabled={zipStatus !== null}>
                {zipStatus ? (
                  <>
                    <div className="custom-loader" style={{ width: '12px', height: '12px', borderTopColor: '#E07A5F' }} />
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
                style={{ opacity: 0.8, cursor: 'not-allowed', borderColor: '#F8B4B4', color: '#9B1C1C' }} 
                onClick={() => alert(`Download Access Locked: An outstanding balance of NLe ${outstandingBalance.toLocaleString()} remains on this photoshoot. Settle your balance with the studio to unlock downloads.`)}
              >
                <LockIcon />
                Downloads Locked (Unpaid Balance)
              </button>
            ) : isDraft ? (
              <button 
                className="btn btn-secondary" 
                style={{ opacity: 0.8, cursor: 'not-allowed' }} 
                onClick={() => alert("Draft Shoot Preview: Image downloads will unlock once final processing is completed.")}
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
          <div className="client-status-card__icon">
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
          <div className="status-note" style={{ background: 'var(--accent-glow)', color: 'var(--accent-dark)', border: '1px solid var(--accent)', padding: '6px 16px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🔐 Proofing Active: Previews Watermarked. Clean master downloads upon full delivery.
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
              {a.name} ({a.photo_count})
            </button>
          ))}
        </div>
      )}

      {!photos && <p className="empty-note">Developing photographs…</p>}
      {photos?.length === 0 && <p className="empty-note">Nothing's been delivered here yet.</p>}
      
      {photos && photos.length > 0 && (
        <div className="frame-grid">
          {filteredPhotos.map((p, i) => {
            const originalIndex = photos.findIndex((item) => item.id === p.id)
            const isLiked = likedIds.includes(p.id)
            return (
              <div className="frame" key={p.id}>
                {/* Actions overlay conditionally loaded by gallery permissions */}
                <div className="frame-actions-overlay">
                  {canSelect && (
                    <button 
                      className={`frame-btn-icon ${isLiked ? 'frame-btn-icon--active' : ''}`}
                      onClick={(e) => toggleLike(p.id, e)}
                      title={isLiked ? 'Unlike photo' : 'Like photo'}
                    >
                      {isLiked ? <HeartFilled /> : <HeartOutline />}
                    </button>
                  )}
                  {canDownload && (
                    <button 
                      className="frame-btn-icon"
                      onClick={(e) => handleDownload(p.id, originalIndex, e)}
                      title="Download high-res master"
                    >
                      <DownloadIcon />
                    </button>
                  )}
                </div>

                <div className="thumb-wrap" onClick={() => setLightboxIndex(originalIndex)}>
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <AuthedImage src={`/api/g/${encodeURIComponent(token)}/photos/${encodeURIComponent(p.id)}`} alt={gallery.title} />
                    
                    {/* Visual Watermark pattern overlay on thumbnail preview */}
                    {gallery.watermark_enabled && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                        <div style={{ transform: 'rotate(-30deg)', fontSize: '0.8rem', fontWeight: 800, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', border: '1px solid rgba(255,255,255,0.15)', padding: '2px 8px', textTransform: 'uppercase' }}>
                          Shoot it
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="frame-number">
                  <span>No. {String(originalIndex + 1).padStart(2, '0')}</span>
                  {isLiked && <span className="favorites-bar-heart" style={{ display: 'inline' }}>❤️</span>}
                  <span className="frame-handwritten">Shoot it</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Floating Bottom favorites curation bar */}
      {canSelect && (
        <div className={`favorites-bar ${likedIds.length > 0 ? 'favorites-bar--visible' : ''}`}>
          <div className="favorites-bar-info">
            <span className="favorites-bar-heart">❤️</span>
            <span><strong>{likedIds.length}</strong> {likedIds.length === 1 ? 'frame' : 'frames'} selected</span>
          </div>
          <div className="favorites-bar-actions">
            <button className="btn" style={{ padding: '6px 16px', fontSize: '0.75rem' }} onClick={handleCopyFavorites}>
              {copiedFavorites ? <CheckIcon /> : <CopyIcon />}
              {copiedFavorites ? 'Copied list!' : 'Copy List'}
            </button>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '0.75rem' }} 
              onClick={() => saveLikes([])}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Slide Lightbox zoom Modal */}
      {lightboxIndex !== null && photos && (
        <div className="lightbox-modal" role="dialog" aria-modal="true" aria-label={`${gallery.title} lightbox`} onClick={() => setLightboxIndex(null)}>
          <button type="button" className="lightbox-modal-close" onClick={() => setLightboxIndex(null)} aria-label="Close lightbox">
            <CloseIcon />
          </button>

          {lightboxIndex > 0 && (
            <button 
              className="lightbox-modal-nav lightbox-modal-nav--prev" 
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1) }}
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
                    SHOOT IT PROOF
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
                  className={`btn ${likedIds.includes(filteredPhotos[lightboxIndex].id) ? '' : 'btn-secondary'}`}
                  style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                  onClick={() => toggleLike(filteredPhotos[lightboxIndex].id)}
                >
                  {likedIds.includes(filteredPhotos[lightboxIndex].id) ? <HeartFilled /> : <HeartOutline />}
                  {likedIds.includes(filteredPhotos[lightboxIndex].id) ? 'Selected' : 'Select Frame'}
                </button>
              )}
              {canDownload && (
                <button 
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                  onClick={() => handleDownload(filteredPhotos[lightboxIndex].id, photos.findIndex((p) => p.id === filteredPhotos[lightboxIndex].id))}
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
            >
              ▶
            </button>
          )}
        </div>
      )}
    </main>
  )
}