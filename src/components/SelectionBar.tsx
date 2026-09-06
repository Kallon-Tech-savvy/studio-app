export type SyncStatus = 'saved' | 'syncing' | 'offline'

interface SelectionBarProps {
  count: number
  total?: number
  onDownload: () => void
  onClear: () => void
  downloading?: boolean
  downloadProgress?: number
  syncStatus?: SyncStatus
  showOnlySelected?: boolean
  onToggleShowOnlySelected?: () => void
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  saved: 'Saved locally',
  syncing: 'Syncing',
  offline: 'Offline',
}

// Persists at the bottom of the viewport for as long as the client has
// proofs selected — a batch action bar rather than a per-item "download"
// button on every tile, so picking favorites across the whole roll stays
// a single, cheap gesture instead of N separate downloads.
export function SelectionBar({
  count,
  total,
  onDownload,
  onClear,
  downloading,
  downloadProgress = 0,
  syncStatus = 'saved',
  showOnlySelected = false,
  onToggleShowOnlySelected,
}: SelectionBarProps) {
  const isVisible = count > 0

  return (
    <div
      className={`pg-selection-bar${isVisible ? ' pg-selection-bar--visible' : ''}`}
      role="toolbar"
      aria-label="Selected proofs"
      aria-hidden={!isVisible}
    >
      <div className="pg-selection-bar-main">
        <span className="pg-selection-bar-count">
          <span className="pg-selection-bar-count-number">{count}</span>{' '}
          {count === 1 ? 'proof selected' : 'proofs selected'}
          {typeof total === 'number' && total > 0 ? ` / ${total}` : ''}
        </span>
        <span className="pg-selection-bar-status" aria-live="polite">
          {SYNC_LABELS[syncStatus]}
        </span>
      </div>

      {onToggleShowOnlySelected && (
        <button
          type="button"
          className={`pg-btn pg-btn--ghost pg-selection-bar-toggle${showOnlySelected ? ' pg-selection-bar-toggle--active' : ''}`}
          onClick={onToggleShowOnlySelected}
        >
          {showOnlySelected ? 'Selected only' : 'All photos'}
        </button>
      )}

      {downloading && (
        <div className="pg-selection-bar-download" aria-live="polite">
          <div className="pg-selection-bar-download-track" aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.max(0, downloadProgress))}%` }} />
          </div>
          <span className="pg-selection-bar-download-label">{downloadProgress}%</span>
        </div>
      )}

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
          {downloading ? 'Preparing…' : `Download ${count || ''}`.trim()}
        </button>
      </div>
    </div>
  )
}
