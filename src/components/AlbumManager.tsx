import {
  useState,
} from 'react'

import {
  TrashIcon,
} from './icon'

import type {
  Album,
} from '../types'

import { Button } from './Button'

interface AlbumManagerProps {
  albums: Album[]
  canManage: boolean
  creating: boolean

  onCreate: (
    name: string,
  ) => Promise<void>

  onDelete: (
    albumId: string,
  ) => Promise<void>
}

export function AlbumManager({
  albums,
  canManage,
  creating,
  onCreate,
  onDelete,
}: AlbumManagerProps) {
  const [name, setName] =
    useState('')

  async function handleSubmit(
    event: React.FormEvent,
  ) {
    event.preventDefault()

    const trimmed =
      name.trim()

    if (!trimmed) return

    await onCreate(trimmed)

    setName('')
  }

  return (
    <section className="album-manager">
      <h4>Manage Studio Albums</h4>

      {canManage ? (
        <div className="album-manager__grid">
          <form
            onSubmit={handleSubmit}
            className="field-stack"
          >
            <div className="field">
              <label htmlFor="album-name">
                Album Name
              </label>

              <input
                id="album-name"
                value={name}
                onChange={event =>
                  setName(
                    event.target.value,
                  )
                }
                placeholder="e.g. Ceremony Portraits"
                required
                disabled={creating}
              />
            </div>

            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create Album'}
            </Button>
          </form>

          <div>
            <label className="admin-eyebrow">
              Existing Albums
            </label>

            {albums.length === 0 ? (
              <p className="empty-note">
                No albums yet — group photos into albums like "Ceremony" or "Reception" to help clients browse.
              </p>
            ) : (
              <ul className="album-list">
                {albums.map(album => (
                  <li
                    key={album.id}
                    className="album-list__item"
                  >
                    <strong>
                      {album.name}
                    </strong>

                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      onClick={() =>
                        onDelete(
                          album.id,
                        )
                      }
                      title={`Delete ${album.name}`}
                      aria-label={`Delete ${album.name}`}
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
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