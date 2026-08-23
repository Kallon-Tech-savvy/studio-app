import type {
  Album,
  Photo,
} from '../types'

import {
  TrashIcon,
} from './icon'

import { AuthedImage } from '../AuthedImage'

interface PhotoGridProps {
  photos: Photo[]
  albums: Album[]

  accessToken: string

  canManagePhotos: boolean

  onDelete: (
    photoId: string,
  ) => void

  onAlbumChange: (
    photoId: string,
    albumId: string,
  ) => void
}

export function PhotoGrid({
  photos,
  albums,
  accessToken,
  canManagePhotos,
  onDelete,
  onAlbumChange,
}: PhotoGridProps) {
  return (
    <section className="photo-grid-section">
      <h4>
        Uploaded frames ({photos.length})
      </h4>

      <div className="frame-grid">
        {photos.length === 0 && (
          <p className="empty-note">
            No photos uploaded to this gallery yet.
          </p>
        )}

        {photos.map((photo, index) => (
          <article
            className="frame"
            key={photo.id}
          >
            {canManagePhotos && (
              <div className="frame-actions-overlay">
                <button
                  type="button"
                  className="frame-btn-icon frame-btn-icon--delete"
                  onClick={() =>
                    onDelete(photo.id)
                  }
                  title="Delete photo"
                  aria-label="Delete photo"
                >
                  <TrashIcon />
                </button>
              </div>
            )}

            <div className="thumb-wrap">
              <AuthedImage
                src={`/api/photos/${photo.id}?preview=true`}
                accessToken={accessToken}
                alt={`Shoot frame ${
                  index + 1
                }`}
              />
            </div>

            <div className="frame-number">
              No.{' '}
              {String(
                index + 1,
              ).padStart(2, '0')}
            </div>

            <select
              value={
                photo.album_id ?? ''
              }
              disabled={!canManagePhotos}
              onChange={event =>
                onAlbumChange(
                  photo.id,
                  event.target.value,
                )
              }
            >
              <option value="">
                No Album
              </option>

              {albums.map(album => (
                <option
                  key={album.id}
                  value={album.id}
                >
                  {album.name}
                </option>
              ))}
            </select>
          </article>
        ))}
      </div>
    </section>
  )
}