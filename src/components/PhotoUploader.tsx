import { useRef, useState } from 'react'
import type { Album } from '../types'

interface PhotoUploaderProps {
  albums: Album[]
  selectedAlbumId: string
  uploading: boolean
  onAlbumChange: (albumId: string) => void
  /** Called with the selected File array — no ChangeEvent to pass up. */
  onFilesSelected: (files: File[]) => void
}

/**
 * Drag-and-drop photo dropzone.
 *
 * The upload queue status has moved to the floating UploadProgressWidget
 * (portalled), so this component is only responsible for accepting files
 * and the target-album selector.
 *
 * The entire drop zone is a single large interactive region that meets
 * the 44px minimum tap target on mobile.
 */
export function PhotoUploader({
  albums,
  selectedAlbumId,
  uploading,
  onAlbumChange,
  onFilesSelected,
}: PhotoUploaderProps) {
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (files.length) onFilesSelected(files)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear dragging when leaving the zone entirely (not a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragging(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (!uploading) handleFiles(e.dataTransfer.files)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files)
    // Reset so the same files can be re-selected after a failure
    e.target.value = ''
  }

  return (
    <section className="photo-uploader">
      {albums.length > 0 && (
        <div className="field photo-uploader__album-field">
          <label htmlFor="target-album">Target Album</label>
          <select
            id="target-album"
            value={selectedAlbumId}
            onChange={e => onAlbumChange(e.target.value)}
            disabled={uploading}
          >
            <option value="">Default (No Album Grouping)</option>
            {albums.map(album => (
              <option key={album.id} value={album.id}>{album.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Drag-and-drop zone */}
      <div
        className={`photo-dropzone${dragging ? ' photo-dropzone--dragging' : ''}${uploading ? ' photo-dropzone--uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Drop photos here or tap to select"
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          hidden
          disabled={uploading}
          onChange={handleInputChange}
        />

        {uploading ? (
          <span className="photo-dropzone__label">Uploading — see progress below ↓</span>
        ) : (
          <>
            <UploadIcon />
            <span className="photo-dropzone__label">
              {dragging ? 'Drop to upload' : 'Drop photos here or tap to select'}
            </span>
            <span className="photo-dropzone__hint">
              JPEG · PNG · WebP · AVIF · up to 100 MB · max 50 at once
            </span>
          </>
        )}
      </div>
    </section>
  )
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="photo-dropzone__icon">
      <path d="M12 16V8M12 8l-3 3M12 8l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
    </svg>
  )
}