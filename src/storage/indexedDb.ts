const DB_NAME = 'studioos'
const STORE_NAME = 'selections'

export async function loadSelectionSnapshot(accessToken: string): Promise<string[]> {
  try {
    const fallback = localStorage.getItem(`proof-gallery-selection:${accessToken}`)
    if (fallback) return JSON.parse(fallback)
  } catch {
    // best effort fallback
  }

  if (typeof window === 'undefined' || !('indexedDB' in window)) return []

  return new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const valueRequest = store.get(accessToken)

      valueRequest.onsuccess = () => {
        const data = valueRequest.result as string[] | undefined
        resolve(Array.isArray(data) ? data : [])
      }

      valueRequest.onerror = () => resolve([])
    }

    request.onerror = () => resolve([])
  })
}

export async function saveSelectionSnapshot(accessToken: string, selectedIds: string[]): Promise<void> {
  try {
    localStorage.setItem(`proof-gallery-selection:${accessToken}`, JSON.stringify(selectedIds))
  } catch {
    // best effort
  }

  if (typeof window === 'undefined' || !('indexedDB' in window)) return

  await new Promise<void>((resolve) => {
    const request = window.indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(selectedIds, accessToken)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    }

    request.onerror = () => resolve()
  })
}
