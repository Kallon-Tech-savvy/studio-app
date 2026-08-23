import { useCallback, useState } from 'react'

import { adminApi, ApiError } from '../services/adminApi'

import type {
  UploadQueueItem,
} from '../types'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

function describeUnsupportedFile(file: File): string | null {
  if (ALLOWED_TYPES.has(file.type)) return null

  const looksLikeHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name)
  if (looksLikeHeic) {
    return 'HEIC photos (the iPhone default) aren\'t supported yet — export or convert to JPEG first, then re-upload.'
  }

  return file.type
    ? `"${file.type}" isn't a supported format — use JPEG, PNG, WebP, or AVIF.`
    : "Couldn't tell what type of file this is — use JPEG, PNG, WebP, or AVIF."
}

/** Detect WebP encoding support once at module load. */
function detectWebPEncoding(): boolean {
  try {
    const c = document.createElement('canvas')
    c.width = 1; c.height = 1
    return c.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
}
const CAN_ENCODE_WEBP = detectWebPEncoding()

/**
 * Compress the master file for upload.
 *
 * Algorithm:
 *  • Scale down only when the long edge > 6 000 px (no upscaling).
 *  • Re-encode as WebP (≈25-34 % smaller than JPEG at equal SSIM).
 *    Falls back to JPEG on browsers that can't encode WebP (Safari <14).
 *  • Adaptive quality:
 *      > 4 MB original  → 0.82   (very large, some headroom)
 *      1–4 MB original  → 0.88   (medium, balanced)
 *      < 1 MB original  → 0.92   (already small, preserve quality)
 *
 * Returns null if canvas is unavailable (worker context etc.), so the caller
 * can fall back to the raw file.
 */
async function compressMaster(file: File): Promise<{ blob: Blob; type: string } | null> {
  if (!file.type.startsWith('image/')) return null
  try {
    const bitmap = await createImageBitmap(file)

    const MAX_LONG_EDGE = 6000
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1

    const w = Math.max(1, Math.round(bitmap.width  * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h

    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return null }

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const mb = file.size / (1024 * 1024)
    const quality = mb > 4 ? 0.82 : mb > 1 ? 0.88 : 0.92

    const mimeType = CAN_ENCODE_WEBP ? 'image/webp' : 'image/jpeg'
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, quality))
    if (!blob) return null

    return { blob, type: mimeType }
  } catch {
    return null
  }
}

/**
 * Create a small preview thumbnail for fast gallery loading.
 * 1200 px / WebP 0.72 — ~40 % smaller than the old 1600 px / JPEG 0.78.
 */
async function createPreview(file: File): Promise<Blob | null> {
  if (!file.type.startsWith('image/')) return null
  try {
    const bitmap = await createImageBitmap(file)
    const MAX = 1200
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width  = Math.max(1, Math.round(bitmap.width  * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return null }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const mimeType = CAN_ENCODE_WEBP ? 'image/webp' : 'image/jpeg'
    return await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.72))
  } catch {
    return null
  }
}

/**
 * Run at most `limit` async tasks in parallel.
 * Prevents OOM when processing large photo batches.
 */
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let cursor = 0
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

export function useUploadQueue(
  accessToken: string,
) {
  const [uploadQueue, setUploadQueue] = useState<Map<string, UploadQueueItem>>(new Map())
  const [uploading, setUploading] = useState(false)

  const upload = useCallback(
    async (
      galleryId: string,
      files: File[],
      albumId?: string,
    ) => {
      if (!files.length) return

      const queue = files.map(
        (file, index) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
          filename: file.name,
          status: 'pending' as const,
        }),
      )

      setUploadQueue(new Map(queue.map(item => [item.id, item])))
      setUploading(true)

      let uploadedCount = 0

      try {
        const tasks = files.map((file, index) => async () => {
          const queueItem = queue[index]

          const unsupportedReason = describeUnsupportedFile(file)
          if (unsupportedReason) {
            setUploadQueue(prev => {
              const next = new Map(prev)
              const cur = next.get(queueItem.id)
              if (cur) next.set(queueItem.id, { ...cur, status: 'failed', error: unsupportedReason })
              return next
            })
            return
          }

          try {
            // Compress master + generate preview concurrently
            const [compressed, preview] = await Promise.all([
              compressMaster(file),
              createPreview(file),
            ])

            const uploadFile = compressed
              ? new File([compressed.blob], file.name, { type: compressed.type })
              : file

            await adminApi.galleries.photos.upload(
              accessToken,
              galleryId,
              uploadFile,
              {
                albumId,
                sortOrder: index,
                preview: preview ?? undefined,
              },
            )

            uploadedCount++
            setUploadQueue(prev => {
              const next = new Map(prev)
              const cur = next.get(queueItem.id)
              if (cur) next.set(queueItem.id, { ...cur, status: 'success' })
              return next
            })
          } catch (error) {
            const reason =
              error instanceof ApiError || error instanceof Error
                ? error.message
                : 'Upload failed — please try again.'

            setUploadQueue(prev => {
              const next = new Map(prev)
              const cur = next.get(queueItem.id)
              if (cur) next.set(queueItem.id, { ...cur, status: 'failed', error: reason })
              return next
            })
          }
        })

        // Upload 3 files concurrently — good throughput without OOM
        await withConcurrency(tasks, 3)

        return {
          uploadedCount,
          failedCount: files.length - uploadedCount,
          total: files.length,
        }
      } finally {
        setUploading(false)
      }
    },
    [accessToken],
  )

  const clearQueue = useCallback(() => {
    setUploadQueue(new Map())
  }, [])

  return {
    uploadQueue,
    uploading,
    upload,
    clearQueue,
  }
}