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
  gallery: Pick<Gallery, 'status' | 'downloads_enabled'> & { total_amount?: number; amount_paid?: number },
  client?: Pick<Client, 'total_amount' | 'amount_paid'> | null,
): GalleryAccessState {
  if (gallery.status === 'DRAFT') return 'draft-only'
  if (gallery.status === 'DISABLED') return 'link-revoked'

  const balance = gallery.total_amount !== undefined
    ? Math.max(0, Number(gallery.total_amount || 0) - Number(gallery.amount_paid || 0))
    : client
      ? Math.max(0, Number(client.total_amount || 0) - Number(client.amount_paid || 0))
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
  gallery: Pick<Gallery, 'status' | 'downloads_enabled'> & { total_amount?: number; amount_paid?: number },
  client?: Pick<Client, 'total_amount' | 'amount_paid'> | null,
): boolean {
  if (!gallery.downloads_enabled) return false
  if (gallery.status === 'DRAFT') return false
  if (gallery.status !== 'READY' && gallery.status !== 'PUBLISHED') return false
  const balance = gallery.total_amount !== undefined
    ? Math.max(0, Number(gallery.total_amount || 0) - Number(gallery.amount_paid || 0))
    : client
      ? Math.max(0, Number(client.total_amount || 0) - Number(client.amount_paid || 0))
      : 0
  return balance === 0
}

/** Whether a client may select/favourite photos from this gallery. */
export function canSelectFromGallery(
  gallery: Pick<Gallery, 'status' | 'selection_enabled'> & { total_amount?: number; amount_paid?: number },
  client?: Pick<Client, 'total_amount' | 'amount_paid'> | null,
): boolean {
  if (!gallery.selection_enabled) return false
  if (gallery.status === 'DRAFT') return false
  const balance = gallery.total_amount !== undefined
    ? Math.max(0, Number(gallery.total_amount || 0) - Number(gallery.amount_paid || 0))
    : client
      ? Math.max(0, Number(client.total_amount || 0) - Number(client.amount_paid || 0))
      : 0
  return balance === 0
}

// ── Delivery status (client-facing) ──────────────────────────────

export type DeliveryStatusTone = 'warning' | 'danger' | 'muted' | 'success'

/**
 * Maps the access state to a visual tone for the status card
 * in the client gallery view.
 */
export function getDeliveryStatusTone(
  gallery: Pick<Gallery, 'status' | 'downloads_enabled'> & { total_amount?: number; amount_paid?: number },
  client?: Pick<Client, 'total_amount' | 'amount_paid'> | null,
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
  gallery: Pick<Gallery, 'status' | 'downloads_enabled'> & { total_amount?: number; amount_paid?: number },
  client?: Pick<Client, 'total_amount' | 'amount_paid'> | null,
): string {
  const state = getGalleryAccessState(gallery, client)
  const outstandingBalance = gallery.total_amount !== undefined
    ? Math.max(0, Number(gallery.total_amount || 0) - Number(gallery.amount_paid || 0))
    : client
      ? Math.max(0, Number(client.total_amount || 0) - Number(client.amount_paid || 0))
      : 0

  switch (state) {
    case 'draft-only':
      return "You're looking at a draft preview — downloads and selecting favorites unlock once the final edit is ready."
    case 'payment-locked':
      return `Downloads unlock once the remaining balance is settled — NLe ${outstandingBalance.toLocaleString()} outstanding.`
    case 'link-revoked':
    case 'in-progress':
      return "This gallery is still being prepared. You're welcome to browse the preview here — we'll let you know once it's ready."
    case 'ready-for-delivery':
      return 'This gallery is ready — browse, select favorites, and download below.'
  }
}
