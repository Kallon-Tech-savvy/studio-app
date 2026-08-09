import { useEffect, useState } from 'react'

export function AuthedImage({
  src: endpoint,
  accessToken,
  alt,
}: {
  /** Full fetch URL for this photo's bytes — e.g. /api/photos/:id for the
   * owner's authenticated view, or /api/g/:token/photos/:id for a client. */
  src: string
  accessToken?: string
  alt: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    fetch(endpoint, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('load failed'))))
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [endpoint, accessToken])

  // Toggling this a frame after the <img> mounts is what makes the
  // blur-to-sharp transition actually fire, rather than snapping in.
  useEffect(() => {
    if (!src) {
      setRevealed(false)
      return
    }
    const raf = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(raf)
  }, [src])

  if (failed) return <div className="thumb-error">Photo unavailable</div>
  if (!src) return <div className="thumb-loading" aria-label="Developing…">···</div>

  return <img src={src} alt={alt} className={`thumb${revealed ? ' thumb--loaded' : ''}`} />
}
