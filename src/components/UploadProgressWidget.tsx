import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { UploadQueueItem } from '../types'

interface UploadProgressWidgetProps {
  uploadQueue: Map<string, UploadQueueItem>
  uploading: boolean
  onClear: () => void
}

/**
 * Floating, non-modal upload progress widget.
 *
 * Mounted via a portal so it floats above all content at
 * bottom-right, respecting iOS safe-area-inset-bottom.
 *
 * Behaviour:
 *  - Visible as soon as the queue is non-empty
 *  - Shows overall progress bar + per-file status pills
 *  - Collapses to a compact dot-with-count when user taps collapse
 *  - Auto-dismisses 4 s after all uploads finish
 */
export function UploadProgressWidget({ uploadQueue, uploading, onClear }: UploadProgressWidgetProps) {
  const [collapsed, setCollapsed] = useState(false)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const items = Array.from(uploadQueue.values())
  const total = items.length
  const doneCount = items.filter(i => i.status === 'success' || i.status === 'failed').length
  const successCount = items.filter(i => i.status === 'success').length
  const failedCount = items.filter(i => i.status === 'failed').length
  const allDone = total > 0 && doneCount === total

  // Aggregate progress: weight by individual item progress for uploading items,
  // count completed items as 100%.
  const overallPct =
    total === 0
      ? 0
      : Math.round(
          items.reduce((sum, item) => {
            if (item.status === 'success') return sum + 100
            if (item.status === 'failed') return sum + 100
            if (item.status === 'uploading') return sum + (item.progress ?? 0)
            return sum
          }, 0) / total,
        )

  // Auto-dismiss 4 s after everything finishes
  useEffect(() => {
    if (allDone) {
      dismissTimer.current = setTimeout(() => {
        onClear()
      }, 4000)
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [allDone, onClear])

  if (total === 0 || typeof document === 'undefined') return null

  const widget = (
    <div
      className={`upload-progress-widget${collapsed ? ' upload-progress-widget--collapsed' : ''}`}
      role="status"
      aria-label="Upload progress"
      aria-live="polite"
    >
      {/* ── Header row ── */}
      <div className="upload-progress-widget__header">
        <span className="upload-progress-widget__label">
          {allDone
            ? failedCount > 0
              ? `${successCount}/${total} uploaded — ${failedCount} failed`
              : `${successCount} photo${successCount !== 1 ? 's' : ''} uploaded`
            : uploading
              ? `Uploading ${doneCount + 1} of ${total}…`
              : 'Preparing uploads…'}
        </span>

        <button
          type="button"
          className="upload-progress-widget__collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand upload status' : 'Collapse upload status'}
        >
          {collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </button>

        {allDone && (
          <button
            type="button"
            className="upload-progress-widget__dismiss-btn"
            onClick={onClear}
            aria-label="Dismiss upload status"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* ── Overall progress bar ── */}
      {!collapsed && (
        <>
          <div
            className="upload-progress-widget__bar-track"
            role="progressbar"
            aria-valuenow={overallPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="upload-progress-widget__bar-fill"
              style={{ width: `${overallPct}%` }}
            />
          </div>

          {/* ── Per-file pills ── */}
          <ul className="upload-progress-widget__list">
            {items.map(item => (
              <li
                key={item.id}
                className={`upload-progress-widget__item upload-progress-widget__item--${item.status}`}
              >
                <StatusDot status={item.status} />
                <span className="upload-progress-widget__item-name" title={item.filename}>
                  {item.filename}
                </span>
                {item.status === 'uploading' && (
                  <span className="upload-progress-widget__item-pct">
                    {item.progress ?? 0}%
                  </span>
                )}
                {item.status === 'failed' && item.error && (
                  <span className="upload-progress-widget__item-error" title={item.error}>
                    {item.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )

  return createPortal(widget, document.body)
}

function StatusDot({ status }: { status: UploadQueueItem['status'] }) {
  const cls = `upload-progress-widget__dot upload-progress-widget__dot--${status}`
  if (status === 'uploading' || status === 'compressing' || status === 'pending') {
    return (
      <span className={cls} aria-hidden="true">
        <SpinnerIcon />
      </span>
    )
  }
  return <span className={cls} aria-hidden="true" />
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="upload-spinner">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeDasharray="28 56" strokeLinecap="round" />
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 15l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
