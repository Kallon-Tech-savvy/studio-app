import type {
  ChangeEvent,
} from 'react'

import type {
  Album,
  UploadQueueItem,
} from '../types'

interface PhotoUploaderProps {
  albums: Album[]
  selectedAlbumId: string

  uploadQueue: Map<
    string,
    UploadQueueItem
  >

  uploading: boolean

  onAlbumChange: (
    albumId: string,
  ) => void

  onFilesSelected: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void
}

export function PhotoUploader({
  albums,
  selectedAlbumId,
  uploadQueue,
  uploading,
  onAlbumChange,
  onFilesSelected,
}: PhotoUploaderProps) {
  return (
    <section className="photo-uploader">
      <h4>
        Develop Master JPEGs
      </h4>

      <div className="photo-uploader__controls">
        <div className="field">
          <label htmlFor="target-album">
            Target Album
          </label>

          <select
            id="target-album"
            value={selectedAlbumId}
            onChange={event =>
              onAlbumChange(
                event.target.value,
              )
            }
          >
            <option value="">
              Default (No Album Grouping)
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
        </div>

        <label className="admin-button admin-button--secondary file-button">
          {uploading
            ? 'Uploading…'
            : 'Select & Load Photos'}

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            hidden
            disabled={uploading}
            onChange={
              onFilesSelected
            }
          />
        </label>
      </div>

      <p className="field-hint">
        JPEG, PNG, WebP, or AVIF, up to 100MB each (max 50 photos at a time). iPhone photos saved as HEIC need exporting to
        JPEG first — most photo apps have an "Export as JPEG" or "Convert" option.
      </p>

      {uploadQueue.size > 0 && (
        <div className="upload-queue">
          <strong>
            Upload Status
          </strong>

          {Array.from(
            uploadQueue.values(),
          ).map(item => (
            <div
              key={item.id}
              className={`upload-queue__item upload-queue__item--${item.status}`}
            >
              <span>
                {item.filename}
              </span>

              <strong>
                {item.status}
              </strong>

              {item.status === 'failed' && item.error && (
                <small className="upload-queue__item-reason">
                  {item.error}
                </small>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}