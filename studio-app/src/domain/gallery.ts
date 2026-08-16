/**
 * Pure gallery domain functions.
 *
 * No React dependency. No DOM dependency. No network dependency.
 * All functions are deterministic and independently testable.
 */

import type { Client, Gallery, GalleryAccessState } from '../types'

// ── Access state ──────────────────────────────────────────────────

/**
 * Determines the access state of a gallery given its current status
 * and the linked client's payment record.
 *
 * This replaces the repeated ternary cascade that was scattered
 * across both AdminPanel.tsx and ClientGallery.tsx.
 */
export function getGalleryAccessState(
  gallery: Pick<Gallery, 'status' | 'downloads_enabled'>,
  client: Pick<Client, 'total_amount' | 'amount_paid'> | null,
): GalleryAccessState {
  if (gallery.status === 'DRAFT') return 'draft-only'
  if (gallery.status === 'DISABLED') return 'link-revoked'

  const balance = client
    ? Math.max(0, Number(client.total_amount) - Number(client.amount_paid))
    : 0

  if (balance > 0) return 'payment-locked'

  if (gallery.status === 'PUBLISHED' || gallery.status === 'READY') {
    return 'ready-for-delivery'
  }

  return 'in-progress'
}

/** Human-readable label for each access state. */
export const GALLERY_ACCESS_LABELS: Record<GalleryAccessState, string> = {
  'draft-only': 'Draft view only',
  'link-revoked': 'Link revoked',
  'payment-locked': 'Payment locked',
  'ready-for-delivery': 'Ready for delivery',
  'in-progress': 'In progress',
}

// ── Download / selection permissions ─────────────────────────────

/** Whether a client may download originals from this gallery. */
export function canDownloadGallery(
  gallery: Pick<Gallery, 'status' | 'downloads_enabled'>,
  client: Pick<Client, 'total_amount' | 'amount_paid'> | null,
): boolean {
  if (!gallery.downloads_enabled) return false
  if (gallery.status === 'DRAFT') return false
  if (gallery.status !== 'READY' && gallery.status !== 'PUBLISHED') return false
  if (!client) return true
  return Math.max(0, Number(client.total_amount) - Number(client.amount_paid)) === 0
}

/** Whether a client may select/favourite photos from this gallery. */
export function canSelectFromGallery(
  gallery: Pick<Gallery, 'status' | 'selection_enabled'>,
  client: Pick<Client, 'total_amount' | 'amount_paid'> | null,
): boolean {
  if (!gallery.selection_enabled) return false
  if (gallery.status === 'DRAFT') return false
  if (!client) return true
  return Math.max(0, Number(client.total_amount) - Number(client.amount_paid)) === 0
}

// ── Delivery status (client-facing) ──────────────────────────────

export type DeliveryStatusTone = 'warning' | 'danger' | 'muted' | 'success'

/**
 * Maps the access state to a visual tone for the status card
 * in the client gallery view.
 */
export function getDeliveryStatusTone(
  gallery: Pick<Gallery, 'status' | 'downloads_enabled'>,
  client: Pick<Client, 'total_amount' | 'amount_paid'> | null,
): DeliveryStatusTone {
  const state = getGalleryAccessState(gallery, client)
  switch (state) {
    case 'draft-only': return 'warning'
    case 'payment-locked': return 'danger'
    case 'link-revoked':
    case 'in-progress': return 'muted'
    case 'ready-for-delivery': return 'success'
  }
}

/**
 * Returns the appropriate delivery status message for the client
 * gallery status card. Uses outstanding balance for the message body.
 */
export function getDeliveryStatusMessage(
  gallery: Pick<Gallery, 'status' | 'downloads_enabled'>,
  client: Pick<Client, 'total_amount' | 'amount_paid'> | null,
): string {
  const state = getGalleryAccessState(gallery, client)
  const outstandingBalance = client
    ? Math.max(0, Number(client.total_amount) - Number(client.amount_paid))
    : 0

  switch (state) {
    case 'draft-only':
      return 'Draft preview is live for review. Final delivery, downloads, and approval tools unlock once processing is complete.'
    case 'payment-locked':
      return `Download access is locked until the remaining balance of NLe ${outstandingBalance.toLocaleString()} is settled.`
    case 'link-revoked':
    case 'in-progress':
      return 'This gallery is not yet ready for delivery. You can still review the preview while the final selection is being prepared.'
    case 'ready-for-delivery':
      return 'This gallery is ready for delivery and download access is active.'
  }
}
