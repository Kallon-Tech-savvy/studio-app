import type { Client, Gallery } from '../../types'

export type GalleryLifecycle =
  | 'draft'
  | 'processing'
  | 'ready'
  | 'published'
  | 'disabled'
  | 'archived'

export type GalleryWorkflow =
  | 'needs_upload'
  | 'needs_curation'
  | 'ready_to_send'
  | 'client_reviewing'
  | 'unpaid_balance'
  | 'ready_for_delivery'
  | 'completed'

export type NextActionCode =
  | 'UPLOAD_PHOTOS'
  | 'CURATE_PHOTOS'
  | 'PUBLISH_GALLERY'
  | 'SEND_GALLERY'
  | 'REVIEW_SELECTION'
  | 'COLLECT_PAYMENT'
  | 'UNLOCK_DOWNLOADS'
  | 'DELIVER_GALLERY'
  | 'COMPLETE_GALLERY'

export interface GalleryWorkflowContext {
  gallery: Pick<Gallery, 'status' | 'downloads_enabled' | 'selection_enabled' | 'client_id' | 'access_token'>
  client: Pick<Client, 'total_amount' | 'amount_paid'> | null
  photoCount: number
  selectedCount: number
}

export interface NextAction {
  code: NextActionCode
  priority: number
  label: string
  reason: string
  blocking: boolean
  workflow: GalleryWorkflow
}

export function getGalleryWorkflow(context: GalleryWorkflowContext): GalleryWorkflow {
  const { gallery, client, photoCount, selectedCount } = context
  const outstandingBalance = client
    ? Math.max(0, Number(client.total_amount || 0) - Number(client.amount_paid || 0))
    : 0

  if (photoCount === 0) return 'needs_upload'
  if (gallery.status === 'DRAFT' || gallery.status === 'PROCESSING') return 'needs_curation'
  if (!gallery.client_id) return 'ready_to_send'
  if (outstandingBalance > 0) return 'unpaid_balance'
  if (selectedCount > 0) return 'client_reviewing'
  if (!gallery.downloads_enabled) return 'ready_for_delivery'
  if (gallery.status === 'PUBLISHED' || gallery.status === 'READY') return 'completed'

  return 'ready_to_send'
}

export function getNextAction(context: GalleryWorkflowContext): NextAction | null {
  const { gallery, client, photoCount, selectedCount } = context
  const outstandingBalance = client
    ? Math.max(0, Number(client.total_amount || 0) - Number(client.amount_paid || 0))
    : 0

  if (photoCount === 0) {
    return {
      code: 'UPLOAD_PHOTOS',
      priority: 100,
      label: 'Upload photos',
      reason: 'No photos are in this gallery yet.',
      blocking: true,
      workflow: 'needs_upload',
    }
  }

  if (gallery.status === 'DRAFT' || gallery.status === 'PROCESSING') {
    return {
      code: 'CURATE_PHOTOS',
      priority: 90,
      label: 'Curate gallery',
      reason: 'Photos are in place, but the gallery still needs curation before it is ready to send.',
      blocking: true,
      workflow: 'needs_curation',
    }
  }

  if (!gallery.client_id) {
    return {
      code: 'SEND_GALLERY',
      priority: 80,
      label: 'Assign client and send gallery',
      reason: 'This gallery does not yet have a linked client.',
      blocking: true,
      workflow: 'ready_to_send',
    }
  }

  if (outstandingBalance > 0) {
    return {
      code: 'COLLECT_PAYMENT',
      priority: 70,
      label: 'Collect payment',
      reason: `Outstanding balance remains: ${outstandingBalance.toLocaleString()}.`,
      blocking: true,
      workflow: 'unpaid_balance',
    }
  }

  if (selectedCount > 0) {
    return {
      code: 'REVIEW_SELECTION',
      priority: 60,
      label: 'Review selection',
      reason: `${selectedCount} photo${selectedCount === 1 ? '' : 's'} have been selected for review.`,
      blocking: false,
      workflow: 'client_reviewing',
    }
  }

  if (!gallery.downloads_enabled) {
    return {
      code: 'UNLOCK_DOWNLOADS',
      priority: 50,
      label: 'Unlock downloads',
      reason: 'The gallery is ready, but download access is still locked.',
      blocking: true,
      workflow: 'ready_for_delivery',
    }
  }

  if (gallery.status === 'PUBLISHED' || gallery.status === 'READY') {
    return {
      code: 'COMPLETE_GALLERY',
      priority: 20,
      label: 'Complete gallery',
      reason: 'Everything is ready and the gallery can be delivered to the client.',
      blocking: false,
      workflow: 'completed',
    }
  }

  return null
}
