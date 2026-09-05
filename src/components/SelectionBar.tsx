interface SelectionBarProps {
  count: number
  onDownload: () => void
  onClear: () => void
  downloading?: boolean
}

// Persists at the bottom of the viewport for as long as the client has
// proofs selected — a batch action bar rather than a per-item "download"
// button on every tile, so picking favorites across the whole roll stays
// a single, cheap gesture instead of N separate downloads.
export function SelectionBar({ count, onDownload, onClear, downloading }: SelectionBarProps) {
  const isVisible = count > 0

  return (
    <div
      className={`pg-selection-bar${isVisible ? ' pg-selection-bar--visible' : ''}`}
      role="toolbar"
      aria-label="Selected proofs"
      aria-hidden={!isVisible}
    >
      <span className="pg-selection-bar-count">
        <span className="pg-selection-bar-count-number">{count}</span>{' '}
        {count === 1 ? 'proof selected' : 'proofs selected'}
      </span>
      <div className="pg-selection-bar-actions">
        <button type="button" className="pg-btn pg-btn--ghost" onClick={onClear} disabled={!isVisible}>
          Clear
        </button>
        <button
          type="button"
          className="pg-btn pg-btn--primary"
          onClick={onDownload}
          disabled={!isVisible || downloading}
        >
          {downloading ? 'Preparing download…' : `Download ${count || ''}`.trim()}
        </button>
      </div>
    </div>
  )
}
