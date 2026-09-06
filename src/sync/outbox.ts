import type { SelectionMutation } from './selection'

export interface OutboxMutation {
  id: string
  type: 'SELECT_PHOTO' | 'UNSELECT_PHOTO' | 'MOVE_PHOTO' | 'UPDATE_ALBUM'
  payload: unknown
  createdAt: number
  retryCount: number
  status: 'pending' | 'syncing' | 'failed' | 'synced'
}

export function enqueueOutboxMutation(
  queue: OutboxMutation[],
  mutation: OutboxMutation,
): OutboxMutation[] {
  return [mutation, ...queue]
}

export function markOutboxSynced(queue: OutboxMutation[], id: string): OutboxMutation[] {
  return queue.map(item => item.id === id ? { ...item, status: 'synced' } : item)
}

export function getPendingOutboxMutations(queue: OutboxMutation[]): OutboxMutation[] {
  return queue.filter(item => item.status === 'pending' || item.status === 'failed' || item.status === 'syncing')
}

export function hydrateOutboxMutationFromSelection(mutation: SelectionMutation): OutboxMutation {
  return {
    id: mutation.id,
    type: mutation.type === 'SELECT' ? 'SELECT_PHOTO' : 'UNSELECT_PHOTO',
    payload: {
      photoId: mutation.photoId,
      intent: mutation.intent,
      baseVersion: mutation.baseVersion,
    },
    createdAt: mutation.createdAt,
    retryCount: 0,
    status: 'pending',
  }
}
