import { useMemo, useState } from 'react'
import type { ProofPhoto } from '../components/proofTypes'
import { calculateSelectionProgress } from '../sync/selection'

interface ReviewModeProps {
  title: string
  photos: ProofPhoto[]
  selected: Set<string>
  onToggleSelect: (photoId: string) => void
  onClose: () => void
}

export function ReviewMode({ title, photos, selected, onToggleSelect, onClose }: ReviewModeProps) {
  const [index, setIndex] = useState(0)
  const active = photos[index]
  const stats = useMemo(
    () => calculateSelectionProgress(selected.size, photos.length),
    [selected.size, photos.length],
  )

  if (!active) {
    return null
  }

  return (
    <div className="pg-review-mode" role="dialog" aria-modal="true" aria-label="Review mode">
      <div className="pg-review-mode__header">
        <div>
          <p className="pg-eyebrow">Review mode</p>
          <h2 className="pg-title">{title}</h2>
        </div>
        <button type="button" className="pg-btn pg-btn--ghost" onClick={onClose}>Close</button>
      </div>

      <div className="pg-review-mode__meta">
        <span>{index + 1} / {photos.length}</span>
        <span>{selected.size} / {photos.length} favorites</span>
      </div>

      <div className="pg-review-mode__image-wrap">
        <img src={`/api/g/${window.location.pathname.split('/').pop()}/photos/${active.id}`} alt={active.filename} />
      </div>

      <div className="pg-review-mode__controls">
        <button type="button" className="pg-btn pg-btn--ghost" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>Previous</button>
        <button type="button" className="pg-btn pg-btn--primary" onClick={() => onToggleSelect(active.id)}>
          {selected.has(active.id) ? 'Unfavorite' : 'Favorite'}
        </button>
        <button type="button" className="pg-btn pg-btn--ghost" onClick={() => setIndex(Math.min(photos.length - 1, index + 1))} disabled={index === photos.length - 1}>Next</button>
      </div>

      <div className="pg-selection-bar pg-selection-bar--visible" aria-live="polite">
        <span className="pg-selection-bar-count">
          <span className="pg-selection-bar-count-number">{selected.size}</span> / {photos.length} favorites
        </span>
        <span>{stats.label}</span>
      </div>
    </div>
  )
}
