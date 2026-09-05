import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AuthedImage } from '../AuthedImage'
import type { ProofPhoto } from './proofTypes'

interface LightboxProps {
  photos: ProofPhoto[]
  index: number
  accessToken: string
  isSelected: (id: string) => boolean
  onToggleSelect: (id: string) => void
  onLockedSelect: (photo: ProofPhoto) => void
  onClose: () => void
  onNavigate: (nextIndex: number) => void
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Lightbox({
  photos,
  index,
  accessToken,
  isSelected,
  onToggleSelect,
  onLockedSelect,
  onClose,
  onNavigate,
}: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const photo = photos[index]
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  // Focus trap: remember what had focus before opening, move focus into the
  // dialog, and hand it back on close so keyboard and screen-reader users
  // never lose their place in the grid behind the overlay.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      previouslyFocused.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft' && hasPrev) {
        event.preventDefault()
        onNavigate(index - 1)
        return
      }
      if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault()
        onNavigate(index + 1)
        return
      }
      if (event.key === 'Tab') {
        const container = dialogRef.current
        if (!container) return
        const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [hasPrev, hasNext, index, onClose, onNavigate])

  // Lock page scroll while the dialog is open.
  useEffect(() => {
    const { body } = document
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = previousOverflow
    }
  }, [])

  if (!photo || typeof document === 'undefined') return null

  const selected = isSelected(photo.id)

  return createPortal(
    <div
      className="pg-lightbox-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="pg-lightbox-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Proof ${index + 1} of ${photos.length}: ${photo.filename}`}
        ref={dialogRef}
      >
        <header className="pg-lightbox-header">
          <span className="pg-lightbox-frame-number">
            Frame {String(index + 1).padStart(3, '0')} / {String(photos.length).padStart(3, '0')}
          </span>
          <button
            type="button"
            className="pg-lightbox-close"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
          >
            <CloseGlyph />
          </button>
        </header>

        <div className="pg-lightbox-body">
          <button
            type="button"
            className="pg-lightbox-nav pg-lightbox-nav--prev"
            onClick={() => hasPrev && onNavigate(index - 1)}
            disabled={!hasPrev}
            aria-label="Previous proof"
          >
            <ChevronGlyph direction="left" />
          </button>

          <div className="pg-lightbox-image-frame">
            <AuthedImage
              key={photo.id}
              src={`/api/g/${accessToken}/photos/${photo.id}`}
              alt={photo.filename}
            />
            {photo.locked && (
              <div className="pg-lightbox-locked-note" role="note">
                <LockGlyph />
                <p>{photo.lockedReason || 'Full resolution unlocks once this gallery is marked delivered.'}</p>
              </div>
            )}
          </div>

          <button
            type="button"
            className="pg-lightbox-nav pg-lightbox-nav--next"
            onClick={() => hasNext && onNavigate(index + 1)}
            disabled={!hasNext}
            aria-label="Next proof"
          >
            <ChevronGlyph direction="right" />
          </button>
        </div>

        <footer className="pg-lightbox-footer">
          <label className={`pg-lightbox-select${selected ? ' pg-lightbox-select--checked' : ''}`}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => (photo.locked ? onLockedSelect(photo) : onToggleSelect(photo.id))}
            />
            <span className="pg-lightbox-select-mark" aria-hidden="true">
              <CheckGlyph />
            </span>
            Select this proof
          </label>
          <p className="pg-lightbox-hint">Use ← and → to browse, Esc to close</p>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function LockGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ChevronGlyph({ direction }: { direction: 'left' | 'right' }) {
  const d = direction === 'left' ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5 10 17 19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
