export type SelectionIntent = 'favorites' | 'final_delivery' | 'album_selection' | 'print_selection'

export interface SelectionMutation {
  id: string
  type: 'SELECT' | 'UNSELECT'
  photoId: string
  intent: SelectionIntent
  baseVersion: number
  createdAt: number
  status: 'pending' | 'syncing' | 'synced' | 'failed'
}

export function calculateSelectionProgress(selectedCount: number, totalCount: number): {
  progress: number
  remaining: number
  label: string
} {
  const safeTotal = Math.max(0, totalCount)
  const safeSelected = Math.max(0, selectedCount)
  const progress = safeTotal === 0 ? 0 : Math.min(100, Math.round((safeSelected / safeTotal) * 100))
  const remaining = Math.max(0, safeTotal - safeSelected)

  return {
    progress,
    remaining,
    label: remaining === 0 ? 'All photos selected' : `${remaining} more selections`,
  }
}

export function applySelectionMutation(
  current: Set<string>,
  mutation: Pick<SelectionMutation, 'type' | 'photoId'>,
): Set<string> {
  const next = new Set(current)

  if (mutation.type === 'SELECT') {
    next.add(mutation.photoId)
  } else {
    next.delete(mutation.photoId)
  }

  return next
}

export function reconcileSelectionState(
  current: Set<string>,
  serverSelection: Iterable<string>,
  pendingMutations: SelectionMutation[],
): Set<string> {
  const reconciled = new Set(serverSelection)

  for (const mutation of pendingMutations) {
    const applied = applySelectionMutation(reconciled, { type: mutation.type, photoId: mutation.photoId })
    if (mutation.type === 'SELECT') {
      applied.add(mutation.photoId)
    } else {
      applied.delete(mutation.photoId)
    }

    for (const id of Array.from(reconciled)) {
      if (!applied.has(id)) {
        reconciled.delete(id)
      }
    }

    for (const id of Array.from(applied)) {
      reconciled.add(id)
    }
  }

  return new Set(current.size > 0 ? current : reconciled)
}

export function createSelectionMutation(
  photoId: string,
  selected: boolean,
  intent: SelectionIntent = 'favorites',
  baseVersion = 0,
): SelectionMutation {
  return {
    id: `${photoId}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    type: selected ? 'SELECT' : 'UNSELECT',
    photoId,
    intent,
    baseVersion,
    createdAt: Date.now(),
    status: 'pending',
  }
}
