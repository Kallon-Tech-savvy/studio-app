import {
  useEffect,
  useState,
} from 'react'

import type {
  Client,
  Gallery,
} from '../types'

import {
  adminApi,
} from '../services/adminApi'

import { useAdminNotice, describeError } from './AdminNotice'

import { GallerySettings } from './GallerySetting'
import { AlbumManager } from './AlbumManager'
import { PhotoUploader } from './PhotoUploader'
import { PhotoGrid } from './PhotoGrid'

import { useUploadQueue } from '../hooks/useUploadQueue'

interface GalleryControlPanelProps {
  gallery: Gallery
  clients: Client[]

  accessToken: string

  albums: import('../types').Album[]
  photos: import('../types').Photo[]

  canManageGalleries: boolean
  canUploadPhotos: boolean

  onAlbumsChange: (
    galleryId: string,
  ) => Promise<void>

  onPhotosChange: (
    galleryId: string,
  ) => Promise<void>

  onGalleryRefresh: () => Promise<void>
  onLogsRefresh: () => Promise<void>

  onDeleteGallery: (
    galleryId: string,
  ) => Promise<void>
}

export function GalleryControlPanel({
  gallery,
  clients,
  accessToken,
  albums,
  photos,
  canManageGalleries,
  canUploadPhotos,
  onAlbumsChange,
  onPhotosChange,
  onGalleryRefresh,
  onLogsRefresh,
  onDeleteGallery,
}: GalleryControlPanelProps) {
  const [
    editGallery,
    setEditGallery,
  ] = useState<
    Partial<Gallery>
  >(gallery)

  const [
    selectedAlbumId,
    setSelectedAlbumId,
  ] = useState('')

  const [savingSettings, setSavingSettings] = useState(false)
  const [creatingAlbum, setCreatingAlbum] = useState(false)
  const [linkAction, setLinkAction] = useState<'regenerate' | 'revoke' | 'email' | 'delete' | null>(null)

  const notify = useAdminNotice()

  const {
    uploadQueue,
    uploading,
    upload,
  } = useUploadQueue(
    accessToken,
  )

  useEffect(() => {
    setEditGallery(gallery)
  }, [gallery])

  async function saveGallery(
    event: React.FormEvent,
  ) {
    event.preventDefault()
    if (savingSettings) return
    setSavingSettings(true)

    try {
      await adminApi.galleries.update(
        accessToken,
        gallery.id,
        editGallery,
      )

      await onGalleryRefresh()
      await onLogsRefresh()
      notify('Settings saved.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't save those settings — please try again."), 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  async function createAlbum(
    name: string,
  ) {
    if (creatingAlbum) return
    setCreatingAlbum(true)

    try {
      await adminApi.galleries.albums.create(
        accessToken,
        gallery.id,
        {
          name,
          description: '',
        },
      )

      await onAlbumsChange(
        gallery.id,
      )

      await onLogsRefresh()
      notify(`Album "${name}" created.`, 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't create that album — please try again."), 'error')
    } finally {
      setCreatingAlbum(false)
    }
  }

  async function deleteAlbum(
    albumId: string,
  ) {
    try {
      await adminApi.galleries.albums.delete(
        accessToken,
        gallery.id,
        albumId,
      )

      await onAlbumsChange(
        gallery.id,
      )

      await onPhotosChange(
        gallery.id,
      )
      notify('Album deleted — photos are still here, just ungrouped.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't delete that album — please try again."), 'error')
    }
  }

  async function deletePhoto(
    photoId: string,
  ) {
    try {
      await adminApi.galleries.photos.delete(
        accessToken,
        gallery.id,
        photoId,
      )

      await onPhotosChange(
        gallery.id,
      )

      await onGalleryRefresh()
      await onLogsRefresh()
      notify('Photo deleted.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't delete that photo — please try again."), 'error')
    }
  }

  async function assignPhotoAlbum(
    photoId: string,
    albumId: string,
  ) {
    try {
      await adminApi.galleries.photos.update(
        accessToken,
        gallery.id,
        photoId,
        {
          album_id:
            albumId || null,
        },
      )

      await onPhotosChange(
        gallery.id,
      )

      await onLogsRefresh()
    } catch (error) {
      notify(describeError(error, "Couldn't move that photo — please try again."), 'error')
    }
  }

  async function uploadPhotos(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(
      event.target.files ?? [],
    )

    if (!files.length) return

    if (files.length > 50) {
      notify('You can upload a maximum of 50 photos at a time.', 'error')
      event.target.value = ''
      return
    }

    try {
      const result = await upload(
        gallery.id,
        files,
        selectedAlbumId ||
          undefined,
      )

      await onPhotosChange(
        gallery.id,
      )

      await onGalleryRefresh()
      await onLogsRefresh()

      if (result) {
        if (result.failedCount === 0) {
          notify(
            result.total === 1
              ? 'Photo uploaded. ⚡ +10 XP!'
              : `${result.uploadedCount} photos uploaded. ⚡ +${result.uploadedCount * 10} XP!`,
            'success',
          )
        } else if (result.uploadedCount === 0) {
          notify(`Upload failed for all ${result.total} photos — please try again.`, 'error')
        } else {
          notify(
            `${result.uploadedCount} of ${result.total} uploaded — ${result.failedCount} failed. Check the upload status below and try those again.`,
            'error',
          )
        }
      }
    } catch (error) {
      notify(describeError(error, 'Upload failed — please try again.'), 'error')
    } finally {
      event.target.value = ''
    }
  }

  async function sendGalleryEmail() {
    if (!currentClient?.email) {
      notify('Add a client email before sending the gallery link.', 'error')
      return
    }

    setLinkAction('email')

    try {
      const result = await adminApi.galleries.sendEmail(
        accessToken,
        gallery.id,
      )

      await onLogsRefresh()
      notify(result.message ?? 'Gallery link emailed to the client.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't send that email — please try again."), 'error')
    } finally {
      setLinkAction(null)
    }
  }

  function shareClientLinkViaWhatsApp() {
    const recipientName = currentClient?.name || 'there'
    const shareUrl = `${window.location.origin}/g/${encodeURIComponent(gallery.access_token)}`
    const message = `Hi ${recipientName}, your gallery is ready: ${shareUrl}`

    if (!currentClient?.phone) {
      notify('Add a client phone number to share the gallery via WhatsApp.', 'error')
      return
    }

    const digits = currentClient.phone.replace(/\D/g, '')
    if (!digits) {
      notify('This phone number is incomplete, so WhatsApp sharing was skipped.', 'error')
      return
    }

    const whatsappUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
    notify('WhatsApp share opened in a new tab.', 'success')
  }

  async function copyClientLink() {
    const shareUrl = `${window.location.origin}/g/${encodeURIComponent(gallery.access_token)}`

    try {
      await navigator.clipboard.writeText(shareUrl)
      notify('Private gallery link copied to the clipboard.', 'success')
    } catch {
      notify("Couldn't copy the link — use the copy action manually from the browser.", 'error')
    }
  }

  async function regenerateLink() {
    setLinkAction('regenerate')

    try {
      await adminApi.galleries.regenerate(
        accessToken,
        gallery.id,
      )

      await onGalleryRefresh()
      await onLogsRefresh()
      notify('New private link generated — the old link no longer works.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't regenerate the link — please try again."), 'error')
    } finally {
      setLinkAction(null)
    }
  }

  async function revokeLink() {
    setLinkAction('revoke')

    try {
      await adminApi.galleries.revoke(
        accessToken,
        gallery.id,
      )

      await onGalleryRefresh()
      await onLogsRefresh()
      notify('Access revoked — the client link no longer works.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't revoke the link — please try again."), 'error')
    } finally {
      setLinkAction(null)
    }
  }

  async function deleteThisGallery() {
    setLinkAction('delete')
    try {
      await onDeleteGallery(gallery.id)
    } finally {
      setLinkAction(null)
    }
  }

  const currentClient = clients.find(client => client.id === gallery.client_id) ?? null

  return (
    <section className="gallery-control-panel">
      <header className="gallery-control-panel__header">
        <h4>
          Shoot Control Panel:{' '}
          "{gallery.title}"
        </h4>

        {canManageGalleries && (
          <div className="button-group">
            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={copyClientLink}
              title="Copy the client gallery URL"
            >
              Copy Link
            </button>

            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={shareClientLinkViaWhatsApp}
              disabled={!currentClient?.phone}
              title={currentClient?.phone ? `Share the gallery on WhatsApp to ${currentClient.phone}` : 'Add a client phone number first'}
            >
              WhatsApp
            </button>

            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={sendGalleryEmail}
              disabled={linkAction !== null || !currentClient?.email}
              title={currentClient?.email ? `Email the gallery link to ${currentClient.email}` : 'Assign a client with an email address first'}
            >
              {linkAction === 'email' ? 'Sending…' : 'Email Client'}
            </button>

            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={regenerateLink}
              disabled={linkAction !== null}
            >
              {linkAction === 'regenerate' ? 'Regenerating…' : 'Reset Link Token'}
            </button>

            <button
              type="button"
              className="admin-button admin-button--danger"
              onClick={revokeLink}
              disabled={linkAction !== null}
            >
              {linkAction === 'revoke' ? 'Revoking…' : 'Revoke Link'}
            </button>

            <button
              type="button"
              className="admin-button admin-button--danger"
              onClick={deleteThisGallery}
              disabled={linkAction !== null}
            >
              {linkAction === 'delete' ? 'Deleting…' : 'Delete Gallery'}
            </button>
          </div>
        )}
      </header>

      <GallerySettings
        gallery={editGallery}
        clients={clients}
        disabled={!canManageGalleries}
        saving={savingSettings}
        onChange={updates =>
          setEditGallery(
            current => ({
              ...current,
              ...updates,
            }),
          )
        }
        onSubmit={saveGallery}
      />

      <AlbumManager
        albums={albums}
        canManage={
          canManageGalleries
        }
        creating={creatingAlbum}
        onCreate={createAlbum}
        onDelete={deleteAlbum}
      />

      {canUploadPhotos && (
        <PhotoUploader
          albums={albums}
          selectedAlbumId={
            selectedAlbumId
          }
          uploadQueue={
            uploadQueue
          }
          uploading={uploading}
          onAlbumChange={
            setSelectedAlbumId
          }
          onFilesSelected={
            uploadPhotos
          }
        />
      )}

      <PhotoGrid
        photos={photos}
        albums={albums}
        accessToken={accessToken}
        canManagePhotos={
          canManageGalleries || canUploadPhotos
        }
        onDelete={deletePhoto}
        onAlbumChange={
          assignPhotoAlbum
        }
      />
    </section>
  )
}