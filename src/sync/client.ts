export type SyncStatus = 'saved' | 'syncing' | 'offline'

export function getSyncStatus(isOnline: boolean, pendingCount: number): SyncStatus {
  if (!isOnline) return 'offline'
  if (pendingCount > 0) return 'syncing'
  return 'saved'
}
