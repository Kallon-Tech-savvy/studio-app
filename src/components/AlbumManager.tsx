import { useState } from 'react'
import { TrashIcon } from './icon'
import type { Album } from '../types'
import { InlineRetryAlert } from './InlineRetryAlert'

interface AlbumManagerProps {
  albums: Album[]
  canManage: boolean
  /** Called when the user submits a new album name. Returns a result object. */
  onCreate: (name: string) => Promise<{ ok: true; album: Album } | { ok: false; error: string }>
  /** Called when the user deletes an album. Returns a result object. */
  onDelete: (albumId: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

export function AlbumManager({ albums, canManage, onCreate, onDelete }: AlbumManagerProps) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  // Map of albumId → error string for per-album delete failures
  const [deleteErrors, setDeleteErrors] = useState<Map<string, string>>(new Map())

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setCreating(true)
    setCreateError(null)

    const result = await onCreate(trimmed)

    if (result.ok) {
      setName('')
    } else {
      setCreateError(result.error)
    }

    setCreating(false)
  }

  async function handleDelete(albumId: string) {
    setDeleteErrors(prev => {
      const next = new Map(prev)
      next.delete(albumId)
      return next
    })

    const result = await onDelete(albumId)

    if (!result.ok) {
      setDeleteErrors(prev => new Map(prev).set(albumId, result.error))
    }
  }

  return (
    <section className="album-manager">
      <h4>Studio Albums</h4>

      {canManage ? (
        <div className="album-manager__grid">
          <form onSubmit={handleSubmit} className="field-stack">
            <div className="field">
              <label htmlFor="album-name">New Album Name</label>
              <input
                id="album-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Ceremony Portraits"
                required
                disabled={creating}
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              className="admin-button admin-button--secondary"
              disabled={creating || !name.trim()}
            >
              {creating ? 'Creating…' : 'Create Album'}
            </button>

            {createError && (
              <InlineRetryAlert
                message={createError}
                onRetry={() => void handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
                onDismiss={() => setCreateError(null)}
              />
            )}
          </form>

          <div>
            <label className="admin-eyebrow">Existing Albums</label>

            {albums.length === 0 ? (
              <p className="empty-note">
                No albums yet — group photos into albums like "Ceremony" or "Reception" to help clients browse.
              </p>
            ) : (
              <ul className="album-list">
                {albums.map(album => {
                  const isOptimistic = '_optimistic' in album && Boolean((album as { _optimistic?: boolean })._optimistic)
                  const deleteError = deleteErrors.get(album.id)

                  return (
                    <li key={album.id} className="album-list__item">
                      <strong className="album-list__name">
                        {album.name}
                        {isOptimistic && <SpinnerGlyph />}
                      </strong>

                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        onClick={() => void handleDelete(album.id)}
                        disabled={Boolean(isOptimistic)}
                        title={`Delete ${album.name}`}
                        aria-label={`Delete ${album.name}`}
                      >
                        <TrashIcon />
                      </button>

                      {deleteError && (
                        <InlineRetryAlert
                          message={deleteError}
                          onRetry={() => void handleDelete(album.id)}
                          onDismiss={() =>
                            setDeleteErrors(prev => {
                              const next = new Map(prev)
                              next.delete(album.id)
                              return next
                            })
                          }
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="empty-note">
          Your account doesn't have permission to manage albums for this gallery.
        </p>
      )}
    </section>
  )
}

function SpinnerGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="album-spinner"
      style={{ marginLeft: 6, verticalAlign: 'middle' }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="28 56"
        strokeLinecap="round"
      />
    </svg>
  )
}