import { useCallback, useEffect, useState } from 'react'

import type { Client, Gallery } from '../types'
import { adminApi } from '../services/adminApi'
import { useAdminNotice, describeError } from './AdminNotice'
import { AlbumManager } from './AlbumManager'
import { PhotoUploader } from './PhotoUploader'
import { PhotoGrid } from './PhotoGrid'
import { SheetDrawer } from './SheetDrawer'
import { UploadProgressWidget } from './UploadProgressWidget'
import { useUploadQueue } from '../hooks/useUploadQueue'
import { useGalleryMutations } from '../hooks/useGalleryMutations'

import type { Album, Photo } from '../types'

const STATUS_HINTS: Record<Gallery['status'], string> = {
  DRAFT: 'Client can preview photos only — no downloads or selecting favorites yet.',
  PROCESSING: 'Client can preview and select favorites, but downloads stay locked until Ready.',
  READY: 'Client can preview, select favorites, and download — once their balance is paid.',
  PUBLISHED: 'Same as Ready, and also listed in the public gallery feed if "public" is checked.',
  DISABLED: 'The client link stops working entirely until this changes.',
  ARCHIVED: 'The client link stops working entirely — use this once a shoot is fully wrapped up.',
}

interface GalleryControlPanelProps {
  gallery: Gallery
  clients: Client[]
  accessToken: string
  albums: Album[]
  photos: Photo[]
  canManageGalleries: boolean
  canUploadPhotos: boolean
  onAlbumsChange: (galleryId: string) => Promise<void>
  onPhotosChange: (galleryId: string) => Promise<void>
  onGalleryRefresh: () => Promise<void>
  onLogsRefresh: () => Promise<void>
  onDeleteGallery: (galleryId: string) => Promise<void>
  /** Called when a gallery field is updated optimistically — lets parent reconcile. */
  onGalleryUpdated?: (gallery: Gallery) => void
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
  onGalleryUpdated,
}: GalleryControlPanelProps) {
  const [selectedAlbumId, setSelectedAlbumId] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [linkAction, setLinkAction] = useState<'regenerate' | 'revoke' | 'email' | 'delete' | null>(null)

  // Local copies of gallery fields for the advanced settings form.
  // These are kept in sync with the gallery prop so external refreshes
  // propagate, but do not cause optimistic flicker.
  const [editGallery, setEditGallery] = useState<Partial<Gallery>>(gallery)
  useEffect(() => { setEditGallery(gallery) }, [gallery])

  // Mutable copies of albums/photos for optimistic mutations.
  // The panel is self-contained: it manages its own local list while
  // also triggering upstream refreshes to keep the parent in sync.
  const [localAlbums, setLocalAlbums] = useState<Album[]>(albums)
  useEffect(() => { setLocalAlbums(albums) }, [albums])

  const notify = useAdminNotice()

  const { uploadQueue, uploading, upload, clearQueue } = useUploadQueue(accessToken)

  // Optimistic gallery/album mutations
  const [galleries, setGalleries] = useState<Gallery[]>([gallery])
  useEffect(() => { setGalleries([gallery]) }, [gallery])

  const { updateGallery, createAlbum, deleteAlbum } = useGalleryMutations({
    accessToken,
    setGalleries,
    setAlbums: setLocalAlbums,
  })

  // Sync gallery optimistic state back to parent
  useEffect(() => {
    const updated = galleries.find(g => g.id === gallery.id)
    if (updated && updated !== gallery) onGalleryUpdated?.(updated)
  }, [galleries, gallery, onGalleryUpdated])

  // ── Gallery status toggle (primary surface) ────────────────────
  async function handleStatusChange(status: Gallery['status']) {
    const result = await updateGallery(gallery.id, { status })
    if (result.ok) {
      notify(`Gallery marked ${status.toLowerCase()}.`, 'success')
      await onLogsRefresh()
    }
    // On failure: the useGalleryMutations hook rolls back state;
    // AlbumManager / this component will show an InlineRetryAlert
    return result
  }

  // ── Advanced settings save ─────────────────────────────────────
  const [savingSettings, setSavingSettings] = useState(false)
  async function saveGallery(event: React.FormEvent) {
    event.preventDefault()
    if (savingSettings) return
    setSavingSettings(true)
    try {
      await adminApi.galleries.update(accessToken, gallery.id, editGallery)
      await onGalleryRefresh()
      await onLogsRefresh()
      notify('Settings saved.', 'success')
      setAdvancedOpen(false)
    } catch (error) {
      notify(describeError(error, "Couldn't save those settings — please try again."), 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  // ── Album mutations (optimistic, inline rollback) ──────────────
  async function handleCreateAlbum(name: string) {
    const result = await createAlbum(gallery.id, name)
    if (result.ok) {
      notify(`Album "${name}" created.`, 'success')
      await onAlbumsChange(gallery.id)
      await onLogsRefresh()
    }
    return result
  }

  async function handleDeleteAlbum(albumId: string) {
    const albumName = localAlbums.find(a => a.id === albumId)?.name ?? 'Album'
    const result = await deleteAlbum(gallery.id, albumId)
    if (result.ok) {
      notify(`"${albumName}" deleted — photos are still here, just ungrouped.`, 'success')
      await onAlbumsChange(gallery.id)
      await onPhotosChange(gallery.id)
    }
    return result
  }

  // ── Photo upload ───────────────────────────────────────────────
  async function uploadPhotos(files: File[]) {
    if (!files.length) return
    if (files.length > 50) {
      notify('You can upload a maximum of 50 photos at a time.', 'error')
      return
    }
    try {
      const result = await upload(gallery.id, files, selectedAlbumId || undefined)
      await onPhotosChange(gallery.id)
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
          notify(`Upload failed for all ${result.total} photos — check the upload status below.`, 'error')
        } else {
          notify(
            `${result.uploadedCount} of ${result.total} uploaded — ${result.failedCount} failed.`,
            'error',
          )
        }
      }
    } catch (error) {
      notify(describeError(error, 'Upload failed — please try again.'), 'error')
    }
  }

  // ── Photo mutations ────────────────────────────────────────────
  async function deletePhoto(photoId: string) {
    try {
      await adminApi.galleries.photos.delete(accessToken, gallery.id, photoId)
      await onPhotosChange(gallery.id)
      await onGalleryRefresh()
      await onLogsRefresh()
      notify('Photo deleted.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't delete that photo — please try again."), 'error')
    }
  }

  async function assignPhotoAlbum(photoId: string, albumId: string) {
    try {
      await adminApi.galleries.photos.update(accessToken, gallery.id, photoId, { album_id: albumId || null })
      await onPhotosChange(gallery.id)
      await onLogsRefresh()
    } catch (error) {
      notify(describeError(error, "Couldn't move that photo — please try again."), 'error')
    }
  }

  // ── Share / danger actions (live in Advanced sheet) ────────────
  const currentClient = clients.find(c => c.id === gallery.client_id) ?? null

  async function sendGalleryEmail() {
    if (!currentClient?.email) {
      notify('Add a client email before sending the gallery link.', 'error')
      return
    }
    setLinkAction('email')
    try {
      const result = await adminApi.galleries.sendEmail(accessToken, gallery.id)
      await onLogsRefresh()
      notify(result.message ?? 'Gallery link emailed to the client.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't send that email — please try again."), 'error')
    } finally {
      setLinkAction(null)
    }
  }

  function shareViaWhatsApp() {
    const shareUrl = `${window.location.origin}/g/${encodeURIComponent(gallery.access_token)}`
    if (!currentClient?.phone) {
      notify('Add a client phone number to share the gallery via WhatsApp.', 'error')
      return
    }
    const digits = currentClient.phone.replace(/\D/g, '')
    if (!digits) {
      notify('This phone number is incomplete, so WhatsApp sharing was skipped.', 'error')
      return
    }
    const message = `Hi ${currentClient?.name || 'there'}, your gallery is ready: ${shareUrl}`
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
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
      await adminApi.galleries.regenerate(accessToken, gallery.id)
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
      await adminApi.galleries.revoke(accessToken, gallery.id)
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
      setAdvancedOpen(false)
      await onDeleteGallery(gallery.id)
    } finally {
      setLinkAction(null)
    }
  }

  // The current gallery as reflected in optimistic state
  const liveGallery = galleries.find(g => g.id === gallery.id) ?? gallery

  return (
    <section className="gallery-workspace">
      {/* ── Floating progress widget (portalled) ── */}
      <UploadProgressWidget
        uploadQueue={uploadQueue}
        uploading={uploading}
        onClear={clearQueue}
      />

      {/* ════════════════════════════════════════════
          PRIMARY SURFACE — always visible
          ════════════════════════════════════════════ */}
      <div className="gallery-workspace__primary">
        <header className="gallery-workspace__header">
          <div className="gallery-workspace__identity">
            <span className={`status-dot${liveGallery.status === 'PUBLISHED' ? ' status-dot--published' : ''}`} />
            <h4 className="gallery-workspace__title">
              {gallery.title}
            </h4>
            {currentClient && (
              <span className="gallery-workspace__client">{currentClient.name}</span>
            )}
          </div>

          {canManageGalleries && (
            <button
              type="button"
              className="admin-button admin-button--secondary gallery-workspace__advanced-btn"
              onClick={() => setAdvancedOpen(true)}
              aria-label="Open advanced gallery settings"
            >
              <SettingsIcon />
              Advanced
            </button>
          )}
        </header>

        {/* ── Gallery status toggle ── */}
        {canManageGalleries && (
          <div className="gallery-workspace__status-row">
            <label htmlFor={`status-${gallery.id}`} className="gallery-workspace__status-label">
              Status
            </label>
            <select
              id={`status-${gallery.id}`}
              className="gallery-workspace__status-select"
              value={liveGallery.status}
              onChange={e => void handleStatusChange(e.target.value as Gallery['status'])}
            >
              {(['DRAFT', 'PROCESSING', 'READY', 'PUBLISHED', 'DISABLED', 'ARCHIVED'] as Gallery['status'][]).map(s => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
            <p className="field-hint gallery-workspace__status-hint">
              {STATUS_HINTS[liveGallery.status]}
            </p>
          </div>
        )}

        {/* ── Photo dropzone ── */}
        {canUploadPhotos && (
          <PhotoUploader
            albums={localAlbums}
            selectedAlbumId={selectedAlbumId}
            uploading={uploading}
            onAlbumChange={setSelectedAlbumId}
            onFilesSelected={uploadPhotos}
          />
        )}

        {/* ── Album manager (optimistic) ── */}
        <AlbumManager
          albums={localAlbums}
          canManage={canManageGalleries}
          onCreate={handleCreateAlbum}
          onDelete={handleDeleteAlbum}
        />

        {/* ── Photo grid ── */}
        <PhotoGrid
          photos={photos}
          albums={localAlbums}
          accessToken={accessToken}
          canManagePhotos={canManageGalleries || canUploadPhotos}
          onDelete={deletePhoto}
          onAlbumChange={assignPhotoAlbum}
        />
      </div>

      {/* ════════════════════════════════════════════
          ADVANCED SETTINGS SHEET DRAWER
          ════════════════════════════════════════════ */}
      <SheetDrawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        title="Advanced Settings"
      >
        <form onSubmit={saveGallery} className="field-stack">

          {/* ── Identity ── */}
          <div className="sheet-drawer__section-label">Gallery Details</div>

          <div className="field">
            <label htmlFor="adv-title">Gallery Title</label>
            <input
              id="adv-title"
              value={editGallery.title ?? ''}
              onChange={e => setEditGallery(cur => ({ ...cur, title: e.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="adv-description">Description</label>
            <input
              id="adv-description"
              value={editGallery.description ?? ''}
              onChange={e => setEditGallery(cur => ({ ...cur, description: e.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="adv-client">Assign Client</label>
            <select
              id="adv-client"
              value={editGallery.client_id ?? ''}
              onChange={e => setEditGallery(cur => ({ ...cur, client_id: e.target.value || null }))}
            >
              <option value="">No Client…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="adv-event-date">Event / Shoot Date</label>
            <input
              id="adv-event-date"
              type="date"
              value={editGallery.event_date?.substring(0, 10) ?? ''}
              onChange={e => setEditGallery(cur => ({ ...cur, event_date: e.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="adv-expiry">Expiration Date <span className="field-label-muted">(optional)</span></label>
            <input
              id="adv-expiry"
              type="date"
              value={editGallery.expiration_date?.substring(0, 10) ?? ''}
              onChange={e => setEditGallery(cur => ({ ...cur, expiration_date: e.target.value || null }))}
            />
          </div>

          {/* ── Permissions ── */}
          <div className="sheet-drawer__section-label">Client Permissions</div>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={editGallery.downloads_enabled ?? true}
              onChange={e => setEditGallery(cur => ({ ...cur, downloads_enabled: e.target.checked }))}
            />
            Allow high-res downloads
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={editGallery.selection_enabled ?? true}
              onChange={e => setEditGallery(cur => ({ ...cur, selection_enabled: e.target.checked }))}
            />
            Allow photo selection
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={editGallery.watermark_enabled ?? false}
              onChange={e => setEditGallery(cur => ({ ...cur, watermark_enabled: e.target.checked }))}
            />
            Apply watermark to previews
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={editGallery.is_public ?? false}
              onChange={e => setEditGallery(cur => ({ ...cur, is_public: e.target.checked }))}
            />
            List in public gallery feed when Published
          </label>

          <div className="form-actions">
            <button
              type="submit"
              className="admin-button admin-button--primary"
              disabled={savingSettings}
            >
              {savingSettings ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* ── Share actions ── */}
        <div className="sheet-drawer__divider" />
        <div className="sheet-drawer__section-label">Share Gallery</div>
        <div className="button-group">
          <button type="button" className="admin-button admin-button--secondary" onClick={copyClientLink}>
            Copy Link
          </button>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={shareViaWhatsApp}
            disabled={!currentClient?.phone}
            title={currentClient?.phone ? `Share via WhatsApp to ${currentClient.phone}` : 'Add a client phone number first'}
          >
            WhatsApp
          </button>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={sendGalleryEmail}
            disabled={linkAction !== null || !currentClient?.email}
            title={currentClient?.email ? `Email link to ${currentClient.email}` : 'Assign a client with an email address first'}
          >
            {linkAction === 'email' ? 'Sending…' : 'Email Client'}
          </button>
        </div>

        {/* ── Danger zone ── */}
        <div className="sheet-drawer__divider" />
        <div className="sheet-drawer__section-label sheet-drawer__section-label--danger">Danger Zone</div>
        <div className="button-group">
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
      </SheetDrawer>
    </section>
  )
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}