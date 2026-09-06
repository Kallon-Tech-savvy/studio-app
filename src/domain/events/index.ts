export type AggregateType = 'gallery' | 'client' | 'photo' | 'invoice'
export type ActorType = 'staff' | 'client' | 'system'

export interface DomainEvent<T = unknown> {
  id: string
  type: string
  aggregateType: AggregateType
  aggregateId: string
  actorType: ActorType
  actorId?: string
  version: number
  occurredAt: string
  payload: T
}

export const DOMAIN_EVENT_TYPES = {
  PHOTO_UPLOADED: 'PHOTO_UPLOADED',
  GALLERY_PUBLISHED: 'GALLERY_PUBLISHED',
  GALLERY_OPENED: 'GALLERY_OPENED',
  SELECTION_CHANGED: 'SELECTION_CHANGED',
  INVOICE_ISSUED: 'INVOICE_ISSUED',
  INVOICE_SETTLED: 'INVOICE_SETTLED',
  DOWNLOAD_UNLOCKED: 'DOWNLOAD_UNLOCKED',
  DOWNLOAD_STARTED: 'DOWNLOAD_STARTED',
  DOWNLOAD_COMPLETED: 'DOWNLOAD_COMPLETED',
  ACCESS_REVOKED: 'ACCESS_REVOKED',
  GALLERY_SHARED: 'GALLERY_SHARED',
} as const

export function createDomainEvent<T>(
  type: string,
  aggregateType: AggregateType,
  aggregateId: string,
  payload: T,
  options?: {
    actorType?: ActorType
    actorId?: string
    version?: number
    occurredAt?: string
  },
): DomainEvent<T> {
  return {
    id: crypto.randomUUID(),
    type,
    aggregateType,
    aggregateId,
    actorType: options?.actorType ?? 'system',
    actorId: options?.actorId,
    version: options?.version ?? 1,
    occurredAt: options?.occurredAt ?? new Date().toISOString(),
    payload,
  }
}
