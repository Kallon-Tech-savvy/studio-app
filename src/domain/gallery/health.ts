import type { Client, Gallery } from '../../types'

export type GalleryHealthTone = 'ok' | 'warn' | 'muted'

export interface GalleryHealthItem {
  label: string
  tone: GalleryHealthTone
  detail?: string
}

export function getGalleryHealth(
  gallery: Pick<Gallery, 'status' | 'downloads_enabled' | 'client_id'> & { total_amount?: number; amount_paid?: number },
  client?: Pick<Client, 'total_amount' | 'amount_paid'> | null,
  photoCount: number = 0,
  selectedCount: number = 0,
): GalleryHealthItem[] {
  const outstandingBalance = gallery.total_amount !== undefined
    ? Math.max(0, Number(gallery.total_amount || 0) - Number(gallery.amount_paid || 0))
    : client
      ? Math.max(0, Number(client.total_amount || 0) - Number(client.amount_paid || 0))
      : 0

  return [
    {
      label: 'Photos uploaded',
      tone: photoCount > 0 ? 'ok' : 'warn',
      detail: photoCount > 0 ? `${photoCount} photos in the gallery` : 'No photos yet',
    },
    {
      label: 'Gallery ready',
      tone: gallery.status === 'READY' || gallery.status === 'PUBLISHED' ? 'ok' : 'warn',
      detail: gallery.status === 'READY' || gallery.status === 'PUBLISHED' ? 'Ready for client review' : 'Needs more curation',
    },
    {
      label: 'Client connected',
      tone: gallery.client_id ? 'ok' : 'warn',
      detail: gallery.client_id ? 'Client is assigned' : 'Client still needs to be linked',
    },
    {
      label: 'Downloads locked',
      tone: !gallery.downloads_enabled ? 'warn' : 'ok',
      detail: gallery.downloads_enabled ? 'Downloads active' : 'Waiting for unlock',
    },
    {
      label: 'Balance',
      tone: outstandingBalance > 0 ? 'warn' : 'ok',
      detail: outstandingBalance > 0 ? `${outstandingBalance.toLocaleString()} outstanding` : 'Fully settled',
    },
    {
      label: 'Selections',
      tone: selectedCount > 0 ? 'ok' : 'muted',
      detail: selectedCount > 0 ? `${selectedCount} selected` : 'No favorites yet',
    },
  ]
}
