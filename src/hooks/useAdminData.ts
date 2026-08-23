import { useCallback, useEffect, useState } from 'react'
import type { Album, Client, Gallery, Log, Photo, StaffRecord } from '../types'
import { adminApi, ApiError } from '../services/adminApi'

type AdminData = {
  clients: Client[]
  galleries: Gallery[]
  albums: Album[]
  photos: Photo[]
  logs: Log[]
  staff: StaffRecord[]
  loading: boolean
  error: string | null
  loadClients: () => Promise<void>
  loadGalleries: () => Promise<void>
  loadAlbums: (galleryId: string) => Promise<void>
  loadPhotos: (galleryId: string) => Promise<void>
  loadLogs: () => Promise<void>
  loadStaff: () => Promise<void>
}

const errorMessage = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : 'Unable to load studio data.'

export function useAdminData({
  accessToken,
  canViewFinances,
  canManageStaff,
}: {
  accessToken: string
  canViewFinances: boolean
  canManageStaff: boolean
}): AdminData {
  const [clients, setClients] = useState<Client[]>([])
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadClients = useCallback(async () => {
    if (!canViewFinances) {
      setClients([])
      return
    }
    setClients((await adminApi.clients.list(accessToken)).clients)
  }, [accessToken, canViewFinances])

  const loadGalleries = useCallback(async () => {
    setGalleries((await adminApi.galleries.list(accessToken)).galleries)
  }, [accessToken])

  const loadAlbums = useCallback(async (id: string) => {
    setAlbums((await adminApi.galleries.albums.list(accessToken, id)).albums)
  }, [accessToken])

  const loadPhotos = useCallback(async (id: string) => {
    setPhotos((await adminApi.galleries.photos.list(accessToken, id)).photos)
  }, [accessToken])

  const loadLogs = useCallback(async () => {
    if (!canManageStaff) {
      setLogs([])
      return
    }
    setLogs((await adminApi.logs.list(accessToken)).logs)
  }, [accessToken, canManageStaff])

  const loadStaff = useCallback(async () => {
    if (!canManageStaff) {
      setStaff([])
      return
    }
    setStaff((await adminApi.staff.list(accessToken)).staff)
  }, [accessToken, canManageStaff])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([loadGalleries(), loadClients(), loadLogs(), loadStaff()])
      .catch(e => {
        if (!cancelled) setError(errorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadGalleries, loadClients, loadLogs, loadStaff])

  return {
    clients,
    galleries,
    albums,
    photos,
    logs,
    staff,
    loading,
    error,
    loadClients,
    loadGalleries,
    loadAlbums,
    loadPhotos,
    loadLogs,
    loadStaff,
  }
}
