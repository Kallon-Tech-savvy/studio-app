import { useEffect, useState } from 'react'

async function generateThumbnail(blob: Blob): Promise<string> {
  if (!blob.type.startsWith('image/')) {
    return URL.createObjectURL(blob)
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const imageBitmap = await createImageBitmap(blob)
      const maxSize = 420
      const scale = Math.min(1, maxSize / Math.max(imageBitmap.width, imageBitmap.height))
      const width = Math.max(1, Math.round(imageBitmap.width * scale))
      const height = Math.max(1, Math.round(imageBitmap.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        imageBitmap.close()
        return URL.createObjectURL(blob)
      }

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(imageBitmap, 0, 0, width, height)

      const thumbBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.82)
      })

      imageBitmap.close()
      return thumbBlob ? URL.createObjectURL(thumbBlob) : URL.createObjectURL(blob)
    } catch {
      // Fall through to a safe object URL if the browser cannot decode the image.
    }
  }

  return URL.createObjectURL(blob)
}

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
    setSrc(null)
    setFailed(false)

    fetch(endpoint, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('load failed'))))
      .then(async (blob) => {
        if (cancelled) return
        const generatedUrl = await generateThumbnail(blob)
        if (cancelled) {
          URL.revokeObjectURL(generatedUrl)
          return
        }
        objectUrl = generatedUrl
        setFailed(false)
        setSrc(generatedUrl)
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