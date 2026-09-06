import {
  CheckIcon,
  LinkIcon,
  TrashIcon,
} from './icon'

import type {
  Client,
  Gallery,
} from '../types'

import {
  getGalleryAccessState,
  GALLERY_ACCESS_LABELS,
} from '../domain/gallery'

interface GalleryDirectoryProps {
  galleries: Gallery[]
  clientById: Map<string, Client>
  selectedGalleryId: string
  copiedToken: string | null
  deletingId: string | null
  canManageGalleries: boolean
  onSelect: (id: string) => void
  onCopyLink: (token: string) => void
  onDelete: (id: string) => void
}

export function GalleryDirectory({
  galleries,
  clientById,
  selectedGalleryId,
  copiedToken,
  deletingId,
  canManageGalleries,
  onSelect,
  onCopyLink,
  onDelete,
}: GalleryDirectoryProps) {
  return (
    <div>
      <h3>Shoot Roll Directory</h3>

      {galleries.length === 0 ? (
        <p className="empty-note">
          {canManageGalleries
            ? 'No galleries yet — create your first one on the left.'
            : 'No galleries yet.'}
        </p>
      ) : (
        <ul className="roll-status-list">
          {galleries.map(gallery => {
            const client = clientById.get(gallery.client_id ?? '') ?? null

            const balance = gallery.total_amount !== undefined
              ? Math.max(0, Number(gallery.total_amount || 0) - Number(gallery.amount_paid || 0))
              : client
                ? Math.max(0, Number(client.total_amount) - Number(client.amount_paid))
                : 0

            const accessState = GALLERY_ACCESS_LABELS[getGalleryAccessState(gallery, client)]
            const selected = gallery.id === selectedGalleryId

            return (
              <li
                key={gallery.id}
                className={
                  selected
                    ? 'gallery-directory-item gallery-directory-item--selected'
                    : 'gallery-directory-item'
                }
              >
                {/* Main row — min-height enforced by CSS for 44px tap target */}
                <div className="gallery-directory-item__main">
                  <button
                    type="button"
                    className="gallery-directory-item__title"
                    onClick={() => onSelect(gallery.id)}
                    aria-current={selected ? 'true' : undefined}
                  >
                    <span
                      className={`status-dot ${
                        gallery.status === 'PUBLISHED' ? 'status-dot--published' : ''
                      }`}
                    />
                    {gallery.title}
                  </button>

                  <div className="gallery-directory-item__actions">
                    {/* icon-button size raised to 44×44 in CSS */}
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onCopyLink(gallery.access_token)}
                      title="Copy private client link"
                      aria-label="Copy private client link"
                    >
                      {copiedToken === gallery.access_token ? (
                        <CheckIcon size={14} />
                      ) : (
                        <LinkIcon />
                      )}
                    </button>

                    {canManageGalleries && (
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        onClick={() => onDelete(gallery.id)}
                        disabled={deletingId === gallery.id}
                        title={`Delete ${gallery.title}`}
                        aria-label={`Delete ${gallery.title}`}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </div>

                <div className="gallery-meta">
                  <span>
                    Status: <strong>{gallery.status}</strong>
                  </span>
                  <span>{accessState}</span>
                  <span>
                    Balance: <strong>NLe {balance.toLocaleString()}</strong>
                  </span>
                  <span>
                    Photos: <strong>{gallery.photo_count ?? 0}</strong>
                  </span>
                </div>

                <div className="gallery-meta gallery-meta--secondary">
                  <span>{client?.name ?? 'No client attached'}</span>
                  <span>Shoot Date: {new Date(gallery.event_date).toLocaleDateString()}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}