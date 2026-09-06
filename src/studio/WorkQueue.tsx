import type { Client, Gallery } from '../types'
import { getNextAction, type GalleryWorkflowContext } from '../domain/gallery/nextAction'
import { getGalleryHealth } from '../domain/gallery/health'

export interface StudioQueueItem {
  galleryId: string
  galleryTitle: string
  nextAction: ReturnType<typeof getNextAction>
  health: ReturnType<typeof getGalleryHealth>
  clientName: string
  blocking: boolean
}

export function getStudioWorkQueue(
  galleries: Gallery[],
  clients: Client[],
  photoCounts: Record<string, number> = {},
  selectedCounts: Record<string, number> = {},
): StudioQueueItem[] {
  const clientIndex = new Map(clients.map(client => [client.id, client]))

  return galleries
    .map(gallery => {
      const client = gallery.client_id ? clientIndex.get(gallery.client_id) ?? null : null
      const context: GalleryWorkflowContext = {
        gallery,
        client,
        photoCount: photoCounts[gallery.id] ?? 0,
        selectedCount: selectedCounts[gallery.id] ?? 0,
      }

      const nextAction = getNextAction(context)
      const health = getGalleryHealth(
        gallery,
        client,
        context.photoCount,
        context.selectedCount,
      )

      return {
        galleryId: gallery.id,
        galleryTitle: gallery.title,
        nextAction,
        health,
        clientName: client?.name ?? 'Unassigned',
        blocking: nextAction?.blocking ?? false,
      }
    })
    .filter(item => item.nextAction)
    .sort((a, b) => {
      const blockingScore = Number(b.blocking) - Number(a.blocking)
      if (blockingScore !== 0) return blockingScore
      return (b.nextAction?.priority ?? 0) - (a.nextAction?.priority ?? 0)
    })
}
