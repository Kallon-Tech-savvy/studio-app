import type { Album, Client, Gallery, Log, Photo, StaffPermissionSet, StaffRecord, StaffRole } from '../types'

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = Omit<RequestInit, 'headers'> & { accessToken: string; headers?: HeadersInit }
const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function request<T>(path: string, { accessToken, headers, ...init }: RequestOptions): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body instanceof FormData ? {} : JSON_HEADERS),
      ...headers,
    },
  })

  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null)

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed with status ${response.status}`
    throw new ApiError(message, response.status, body)
  }

  return body as T
}

export const adminApi = {
  staff: {
    list: (token: string) => request<{ staff: StaffRecord[] }>('/api/studio/staff', { accessToken: token }),
    update: (token: string, id: string, payload: { role?: StaffRole; permissions?: StaffPermissionSet; is_active?: boolean }) =>
      request<{ staff: StaffRecord }>(`/api/studio/staff/${id}`, { accessToken: token, method: 'PATCH', body: JSON.stringify(payload) }),
  },
  clients: {
    list: (token: string) => request<{ clients: Client[] }>('/api/clients', { accessToken: token }),
    create: (token: string, payload: unknown) => request<{ client: Client }>('/api/clients', { accessToken: token, method: 'POST', body: JSON.stringify(payload) }),
    delete: (token: string, id: string) => request<{ success: true }>(`/api/clients/${id}`, { accessToken: token, method: 'DELETE', headers: {} }),
  },
  galleries: {
    list: (token: string) => request<{ galleries: Gallery[] }>('/api/studio/galleries', { accessToken: token }),
    create: (token: string, payload: unknown) => request<{ gallery: Gallery }>('/api/galleries', { accessToken: token, method: 'POST', body: JSON.stringify(payload) }),
    update: (token: string, id: string, payload: Partial<Gallery>) => request<{ gallery: Gallery }>(`/api/galleries/${id}`, { accessToken: token, method: 'PATCH', body: JSON.stringify(payload) }),
    delete: (token: string, id: string) => request<{ success: true }>(`/api/galleries/${id}`, { accessToken: token, method: 'DELETE', headers: {} }),
    revoke: (token: string, id: string) => request<{ gallery: Gallery }>(`/api/galleries/${id}/revoke`, { accessToken: token, method: 'POST', headers: {} }),
    regenerate: (token: string, id: string) => request<{ gallery: Gallery }>(`/api/galleries/${id}/regenerate`, { accessToken: token, method: 'POST', headers: {} }),
    sendEmail: (token: string, id: string) => request<{ message?: string }>(`/api/galleries/${id}/send-email`, { accessToken: token, method: 'POST', headers: {} }),
    albums: {
      list: (token: string, galleryId: string) => request<{ albums: Album[] }>(`/api/galleries/${galleryId}/albums`, { accessToken: token }),
      create: (token: string, galleryId: string, payload: { name: string; description?: string; sort_order?: number }) =>
        request<{ album: Album }>(`/api/galleries/${galleryId}/albums`, { accessToken: token, method: 'POST', body: JSON.stringify(payload) }),
      delete: (token: string, galleryId: string, albumId: string) =>
        request<{ success: true }>(`/api/galleries/${galleryId}/albums/${albumId}`, { accessToken: token, method: 'DELETE', headers: {} }),
    },
    photos: {
      list: (token: string, galleryId: string) => request<{ photos: Photo[] }>(`/api/galleries/${galleryId}/photos`, { accessToken: token }),
      upload: (token: string, galleryId: string, file: File, options: { albumId?: string; sortOrder: number; preview?: Blob }) => {
        const form = new FormData()
        form.append('file', file)
        if (options.preview) form.append('preview', options.preview, 'preview.jpg')
        if (options.albumId) form.append('album_id', options.albumId)
        form.append('sort_order', String(options.sortOrder))
        return request<{ photo: Photo }>(`/api/galleries/${galleryId}/photos`, { accessToken: token, method: 'POST', body: form })
      },
      update: (token: string, galleryId: string, photoId: string, payload: { album_id: string | null }) =>
        request<{ photo: Photo }>(`/api/galleries/${galleryId}/photos/${photoId}`, { accessToken: token, method: 'PATCH', body: JSON.stringify(payload) }),
      delete: (token: string, galleryId: string, photoId: string) =>
        request<{ success: true }>(`/api/galleries/${galleryId}/photos/${photoId}`, { accessToken: token, method: 'DELETE', headers: {} }),
    },
  },
  logs: {
    list: (token: string) => request<{ logs: Log[] }>('/api/studio/logs', { accessToken: token }),
  },
}
