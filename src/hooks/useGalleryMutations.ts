import { useCallback } from 'react'
import type { Album, Gallery } from '../types'
import { adminApi, ApiError } from '../services/adminApi'

function errorMessage(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong — please try again.'
}

/**
 * Optimistic mutation hook for galleries and albums.
 *
 * Each mutation immediately reflects in the UI, then either confirms
 * on success or rolls back with a { ok: false, error } result that
 * callers can surface as an inline retry alert (not a toast).
 *
 * Pattern:
 *   const result = await updateGallery(id, patch)
 *   if (!result.ok) setInlineError(result.error)   // show retry alert
 */
export function useGalleryMutations({
  accessToken,
  setGalleries,
  setAlbums,
}: {
  accessToken: string
  setGalleries: React.Dispatch<React.SetStateAction<Gallery[]>>
  setAlbums: React.Dispatch<React.SetStateAction<Album[]>>
}) {
  /**
   * Optimistically update a single gallery in local state.
   * Rolls back to the previous value if the PATCH fails.
   */
  const updateGallery = useCallback(
    async (
      id: string,
      patch: Partial<Gallery>,
    ): Promise<{ ok: true; gallery: Gallery } | { ok: false; error: string }> => {
      // Capture snapshot for rollback
      let snapshot: Gallery | undefined

      setGalleries(prev => {
        const next = prev.map(g => {
          if (g.id === id) {
            snapshot = g
            return { ...g, ...patch }
          }
          return g
        })
        return next
      })

      try {
        const { gallery } = await adminApi.galleries.update(accessToken, id, patch)
        // Reconcile with server truth
        setGalleries(prev => prev.map(g => (g.id === id ? gallery : g)))
        return { ok: true, gallery }
      } catch (e) {
        // Roll back to the captured snapshot
        if (snapshot) {
          const rollback = snapshot
          setGalleries(prev => prev.map(g => (g.id === id ? rollback : g)))
        }
        return { ok: false, error: errorMessage(e) }
      }
    },
    [accessToken, setGalleries],
  )

  /**
   * Optimistically add an album with a temporary client-side ID.
   * Replaces the temp entry with the real server row on success,
   * or removes it on failure.
   */
  const createAlbum = useCallback(
    async (
      galleryId: string,
      name: string,
    ): Promise<{ ok: true; album: Album } | { ok: false; error: string }> => {
      const tempId = `__optimistic__${Date.now()}`
      const optimisticAlbum: Album & { _optimistic: true } = {
        id: tempId,
        gallery_id: galleryId,
        name,
        description: null,
        cover_photo_id: null,
        sort_order: 0,
        _optimistic: true,
      }

      setAlbums(prev => [...prev, optimisticAlbum])

      try {
        const { album } = await adminApi.galleries.albums.create(accessToken, galleryId, { name })
        // Replace temp entry with real row
        setAlbums(prev => prev.map(a => (a.id === tempId ? album : a)))
        return { ok: true, album }
      } catch (e) {
        // Remove the optimistic entry
        setAlbums(prev => prev.filter(a => a.id !== tempId))
        return { ok: false, error: errorMessage(e) }
      }
    },
    [accessToken, setAlbums],
  )

  /**
   * Optimistically remove an album from local state.
   * Re-inserts it on failure so nothing is silently lost.
   */
  const deleteAlbum = useCallback(
    async (
      galleryId: string,
      albumId: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      let snapshot: Album | undefined

      setAlbums(prev => {
        snapshot = prev.find(a => a.id === albumId)
        return prev.filter(a => a.id !== albumId)
      })

      try {
        await adminApi.galleries.albums.delete(accessToken, galleryId, albumId)
        return { ok: true }
      } catch (e) {
        // Re-insert at original position (append is fine for the error case)
        if (snapshot) {
          const rollback = snapshot
          setAlbums(prev => [...prev, rollback])
        }
        return { ok: false, error: errorMessage(e) }
      }
    },
    [accessToken, setAlbums],
  )

  return { updateGallery, createAlbum, deleteAlbum }
}
