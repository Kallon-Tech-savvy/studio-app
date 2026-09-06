import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SheetDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * A native-<dialog>-backed sheet drawer.
 *
 * Mobile (≤639px): slides up from the bottom as a bottom sheet.
 * Desktop (≥640px): slides in from the right as a 420px side panel.
 *
 * Focus is trapped inside while open. Escape key closes the drawer.
 * The ::backdrop click also closes it.
 */
export function SheetDrawer({ open, onClose, title, children }: SheetDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // Close on Escape (the browser fires 'cancel' for native dialogs)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onClose])

  // Close on ::backdrop click
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect()
    if (!rect) return
    const clickedOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    if (clickedOutside) onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <dialog
      ref={dialogRef}
      className="sheet-drawer"
      onClick={handleDialogClick}
      aria-label={title}
    >
      <div className="sheet-drawer__panel">
        <header className="sheet-drawer__header">
          <h3 className="sheet-drawer__title">{title}</h3>
          <button
            type="button"
            className="sheet-drawer__close"
            onClick={onClose}
            aria-label="Close drawer"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="sheet-drawer__body">{children}</div>
      </div>
    </dialog>,
    document.body,
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
