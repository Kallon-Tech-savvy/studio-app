import type {
  Client,
  Gallery,
} from '../types'

export function createClientIndex(
  clients: Client[],
) {
  return new Map(
    clients.map(client => [
      client.id,
      client,
    ]),
  )
}

export function createGalleryClientIndex(
  galleries: Gallery[],
) {
  const index = new Map<string, Gallery[]>()

  for (const gallery of galleries) {
    if (!gallery.client_id) continue

    const existing = index.get(
      gallery.client_id,
    )

    if (existing) {
      existing.push(gallery)
    } else {
      index.set(gallery.client_id, [gallery])
    }
  }

  return index
}

export function countPublishedGalleries(
  galleries: Gallery[],
) {
  let count = 0

  for (const gallery of galleries) {
    if (gallery.status === 'PUBLISHED') {
      count++
    }
  }

  return count
}

export function getRecentItems<T>(
  items: T[],
  limit: number,
) {
  return items.slice(0, limit)
}