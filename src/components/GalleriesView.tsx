import {
  useState,
} from 'react'

import type {
  Client,
  Gallery,
} from '../types'

import { adminApi } from '../services/adminApi'
import { useAdminNotice, describeError } from './AdminNotice'

import {
  GalleryCreateForm,
  type GalleryFormState,
} from './GalleryCreateForm'

import { GalleryDirectory } from './GalleryDirectory'
import { GalleryControlPanel } from './GalleryControlPanel'

interface GalleriesViewProps {
  accessToken: string

  galleries: Gallery[]
  clients: Client[]

  albums: import('../types').Album[]
  photos: import('../types').Photo[]

  canManageGalleries: boolean
  canUploadPhotos: boolean

  loadGalleries: () => Promise<void>
  loadAlbums: (
    galleryId: string,
  ) => Promise<void>
  loadPhotos: (
    galleryId: string,
  ) => Promise<void>
  loadLogs: () => Promise<void>
}



function createDefaultGalleryForm(): GalleryFormState {
  return {
    title: '',
    description: '',
    is_public: false,
    client_id: '',
    downloads_enabled: true,
    selection_enabled: true,
    watermark_enabled: false,
    expiration_date: '',
    event_date:
      new Date()
        .toISOString()
        .substring(0, 10),
  }
}

export function GalleriesView({
  accessToken,
  galleries,
  clients,
  albums,
  photos,
  canManageGalleries,
  canUploadPhotos,
  loadGalleries,
  loadAlbums,
  loadPhotos,
  loadLogs,
}: GalleriesViewProps) {
  const [
    selectedGalleryId,
    setSelectedGalleryId,
  ] = useState('')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const notify = useAdminNotice()

  const [
    form,
    setForm,
  ] = useState(
    createDefaultGalleryForm(),
  )

  const selectedGallery =
    galleries.find(
      gallery =>
        gallery.id ===
        selectedGalleryId,
    ) ?? null

  function updateForm(
    updates: Partial<GalleryFormState>,
  ) {
    setForm(current => ({
      ...current,
      ...updates,
    }))
  }

  async function createGallery(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    if (creating) return
    setCreating(true)

    try {
      const result =
        await adminApi.galleries.create(
          accessToken,
          form,
        )

      setForm(
        createDefaultGalleryForm(),
      )

      await loadGalleries()

      setSelectedGalleryId(
        result.gallery.id,
      )

      await loadAlbums(
        result.gallery.id,
      )

      await loadPhotos(
        result.gallery.id,
      )

      await loadLogs()

      notify(`"${result.gallery.title}" is ready. ⚡ +25 XP!`, 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't create that gallery — please try again."), 'error')
    } finally {
      setCreating(false)
    }
  }

  async function deleteGallery(
    galleryId: string,
  ) {
    if (
      !window.confirm(
        'Are you sure you want to permanently delete this gallery and all of its storage photos?',
      )
    ) {
      return
    }

    setDeletingId(galleryId)

    try {
      await adminApi.galleries.delete(
        accessToken,
        galleryId,
      )

      if (
        selectedGalleryId ===
        galleryId
      ) {
        setSelectedGalleryId('')
      }

      await loadGalleries()
      await loadLogs()
      notify('Gallery deleted.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't delete that gallery — please try again."), 'error')
    } finally {
      setDeletingId(null)
    }
  }

  function selectGallery(
    galleryId: string,
  ) {
    setSelectedGalleryId(
      galleryId,
    )

    void loadAlbums(
      galleryId,
    )

    void loadPhotos(
      galleryId,
    )
  }

  return (
    <div className="admin-view">
      <div className="gallery-directory-layout">
        {canManageGalleries && (
          <GalleryCreateForm
            form={form}
            clients={clients}
            creating={creating}
            onChange={updateForm}
            onSubmit={createGallery}
          />
        )}

        <GalleryDirectory
          galleries={galleries}
          clientById={
            new Map(
              clients.map(client => [
                client.id,
                client,
              ]),
            )
          }
          selectedGalleryId={
            selectedGalleryId
          }
          copiedToken={copiedToken}
          deletingId={deletingId}
          canManageGalleries={
            canManageGalleries
          }
          onSelect={
            selectGallery
          }
          onCopyLink={async token => {
            const url =
              `${window.location.origin}/g/${token}`

            try {
              await navigator.clipboard.writeText(url)
              setCopiedToken(token)
              window.setTimeout(() => setCopiedToken(current => current === token ? null : current), 1800)
            } catch {
              notify("Couldn't copy the link — you can select and copy it manually.", 'error')
            }
          }}
          onDelete={
            deleteGallery
          }
        />
      </div>

      {selectedGallery && (
        <GalleryControlPanel
          gallery={selectedGallery}
          clients={clients}
          accessToken={accessToken}
          albums={albums}
          photos={photos}
          canManageGalleries={
            canManageGalleries
          }
          canUploadPhotos={
            canUploadPhotos
          }
          onAlbumsChange={
            loadAlbums
          }
          onPhotosChange={
            loadPhotos
          }
          onGalleryRefresh={
            loadGalleries
          }
          onLogsRefresh={
            loadLogs
          }
          onDeleteGallery={
            deleteGallery
          }
        />
      )}
    </div>
  )
}