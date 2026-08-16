import { Hono } from 'hono'
import type { Context } from 'hono'
import { getSupabaseClient, getAuthedUser, getCurrentStaffProfile, type StaffProfile } from './lib/supabase'
import { getRedisClient } from './lib/redis'

type AppContext = Context<{ Bindings: Env }>

const app = new Hono<{ Bindings: Env }>()

app.onError((err, c) => {
  console.error('[worker] Unhandled error:', err instanceof Error ? err.stack ?? err.message : err)
  return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
})

// No CORS middleware: the frontend and this API are always served from
// the same Worker/origin (see the ASSETS catch-all at the bottom), so
// there's no cross-origin request to permit in the first place.

// ── Staff auth helper ─────────────────────────────────────────────
// One staff-profile fetch per request (see getCurrentStaffProfile),
// then permission checks are plain in-memory boolean reads — not a
// separate round trip per permission.
type StaffAuth =
  | { ok: true; supabase: ReturnType<typeof getSupabaseClient>; staff: StaffProfile }
  | { ok: false; response: Response }

async function requireStaff(c: AppContext): Promise<StaffAuth> {
  const authHeader = c.req.header('Authorization')
  const supabase = getSupabaseClient(c.env, authHeader)
  const user = await getAuthedUser(supabase, authHeader)
  if (!user) return { ok: false, response: c.json({ error: 'Sign in required' }, 401) }

  const staff = await getCurrentStaffProfile(supabase, authHeader)
  if (!staff) {
    return {
      ok: false,
      response: c.json({ error: 'Your account has no active studio access. Ask the owner to grant you a role.' }, 403),
    }
  }

  return { ok: true, supabase, staff }
}

function hasPermission(staff: StaffProfile, permission: string): boolean {
  return staff.role === 'owner' || staff.permissions?.[permission] === true
}

async function requirePermission(c: AppContext, permission: string): Promise<StaffAuth> {
  const auth = await requireStaff(c)
  if (!auth.ok) return auth
  if (!hasPermission(auth.staff, permission)) {
    console.warn(`[auth] ${auth.staff.email} (${auth.staff.role}) lacks permission: ${permission}`)
    return { ok: false, response: c.json({ error: `Missing permission: ${permission}` }, 403) }
  }
  return auth
}

async function requireAnyPermission(c: AppContext, permissions: string[]): Promise<StaffAuth> {
  const auth = await requireStaff(c)
  if (!auth.ok) return auth
  if (!permissions.some((p) => hasPermission(auth.staff, p))) {
    console.warn(`[auth] ${auth.staff.email} (${auth.staff.role}) lacks any of: ${permissions.join(', ')}`)
    return { ok: false, response: c.json({ error: `Missing permission: one of ${permissions.join(', ')}` }, 403) }
  }
  return auth
}

async function logActivity(supabase: ReturnType<typeof getSupabaseClient>, action: string, details: string) {
  const { error } = await supabase.from('activity_log').insert({ action, details })
  if (error) console.error('[activity_log] Failed to write entry:', error.message)
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function safeFilename(value: string): string {
  const base = value.split(/[\\/]/).pop() || 'upload'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'upload'
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
function isAllowedImageType(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mimeType.toLowerCase())
}

const TOKEN_FORMAT = /^[a-f0-9]{32,64}$/i
const GALLERY_STATUSES = ['DRAFT', 'PROCESSING', 'READY', 'PUBLISHED', 'DISABLED', 'ARCHIVED'] as const

type GalleryWriteBody = {
  title?: string
  description?: string | null
  is_public?: boolean
  status?: (typeof GALLERY_STATUSES)[number]
  downloads_enabled?: boolean
  selection_enabled?: boolean
  watermark_enabled?: boolean
  expiration_date?: string | null
  event_date?: string
  client_id?: string | null
  cover_path?: string | null
}

type ClientWriteBody = {
  name?: string
  email?: string | null
  phone?: string | null
  notes?: string | null
  total_amount?: number
  amount_paid?: number
}

type AlbumWriteBody = { name?: string; description?: string | null; sort_order?: number; cover_photo_id?: string | null }
type StaffWriteBody = { role?: string; permissions?: Record<string, boolean>; is_active?: boolean }

async function invalidateGalleryCache(env: Env) {
  const redis = getRedisClient(env)
  if (redis) await redis.del('galleries:published')
}

// ── 1. Public Lightbox listing ────────────────────────────────────
// Goes through public_galleries() rather than a direct table select —
// there's no anon SELECT policy on galleries at all (see schema.sql),
// so a direct select here would silently return nothing.
app.get('/api/galleries', async (c) => {
  const redis = getRedisClient(c.env)
  const cacheKey = 'galleries:published'

  if (redis) {
    const cached = await redis.get(cacheKey)
    if (cached) return c.json({ galleries: cached, cached: true })
  }

  const supabase = getSupabaseClient(c.env)
  const { data, error } = await supabase.rpc('public_galleries')

  if (error) {
    console.error('[galleries] public_galleries RPC failed:', error.message)
    return c.json({ error: error.message }, 500)
  }

  if (redis) await redis.set(cacheKey, data, { ex: 300 })
  return c.json({ galleries: data, cached: false })
})

// ── 2. Studio gallery management ──────────────────────────────────

app.get('/api/studio/galleries', async (c) => {
  const auth = await requireStaff(c)
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('galleries')
    .select('*, client:clients(id, name, email)')
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: error.message }, 400)
  return c.json({ galleries: data })
})

app.post('/api/galleries', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  const body = await c.req.json<GalleryWriteBody>()
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400)

  const { data: authedUser } = await auth.supabase.auth.getUser()
  const ownerId = authedUser.user?.id

  const { data, error } = await auth.supabase
    .from('galleries')
    .insert({
      title: body.title,
      description: body.description ?? null,
      is_public: body.is_public ?? false,
      status: 'DRAFT',
      downloads_enabled: body.downloads_enabled ?? true,
      selection_enabled: body.selection_enabled ?? true,
      watermark_enabled: body.watermark_enabled ?? false,
      event_date: body.event_date ? new Date(body.event_date).toISOString() : new Date().toISOString(),
      expiration_date: body.expiration_date ? new Date(body.expiration_date).toISOString() : null,
      client_id: body.client_id || null,
      owner_id: ownerId,
    })
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)

  await logActivity(auth.supabase, 'CREATE_GALLERY', `Created gallery "${body.title}" (${data.id})`)
  await invalidateGalleryCache(c.env)
  return c.json({ gallery: data }, 201)
})

app.patch('/api/galleries/:id', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  const galleryId = c.req.param('id')
  const body = await c.req.json<GalleryWriteBody>()

  if (body.status && !GALLERY_STATUSES.includes(body.status)) {
    return c.json({ error: `status must be one of: ${GALLERY_STATUSES.join(', ')}` }, 400)
  }

  const fields: (keyof GalleryWriteBody)[] = [
    'title', 'description', 'cover_path', 'is_public', 'status',
    'downloads_enabled', 'selection_enabled', 'watermark_enabled',
    'expiration_date', 'event_date', 'client_id',
  ]
  const updateData: Partial<GalleryWriteBody> = {}
  for (const field of fields) {
    if (body[field] !== undefined) (updateData as Record<string, unknown>)[field] = body[field]
  }
  if (Object.keys(updateData).length === 0) return c.json({ error: 'Nothing to update' }, 400)

  const { data, error } = await auth.supabase.from('galleries').update(updateData).eq('id', galleryId).select().single()
  if (error) return c.json({ error: error.message }, 400)

  await logActivity(auth.supabase, 'UPDATE_GALLERY', `Updated gallery settings for "${data.title}" (${galleryId})`)
  await invalidateGalleryCache(c.env)
  return c.json({ gallery: data })
})

app.delete('/api/galleries/:id', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  const galleryId = c.req.param('id')
  const { data: gallery } = await auth.supabase.from('galleries').select('title').eq('id', galleryId).single()
  if (!gallery) return c.json({ error: 'Gallery not found' }, 404)

  const { data: photos } = await auth.supabase.from('photos').select('r2_key').eq('gallery_id', galleryId)

  const { error } = await auth.supabase.from('galleries').delete().eq('id', galleryId)
  if (error) return c.json({ error: error.message }, 400)

  if (photos && photos.length > 0) {
    const results = await Promise.allSettled(photos.map((p) => c.env.PHOTOS.delete(p.r2_key)))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      console.error(`[r2] ${failed}/${photos.length} object(s) failed to delete for gallery ${galleryId}`)
    }
  }

  await logActivity(auth.supabase, 'DELETE_GALLERY', `Permanently deleted gallery "${gallery.title}" (${galleryId})`)
  await invalidateGalleryCache(c.env)
  return c.json({ success: true })
})

// ── 3. Access-link management ─────────────────────────────────────

app.post('/api/galleries/:id/revoke', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('galleries')
    .update({ status: 'DISABLED' })
    .eq('id', c.req.param('id'))
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)
  await logActivity(auth.supabase, 'REVOKE_LINK', `Revoked private access link for gallery "${data.title}"`)
  await invalidateGalleryCache(c.env)
  return c.json({ gallery: data })
})

app.post('/api/galleries/:id/regenerate', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  const newToken = crypto.randomUUID().replace(/-/g, '')
  const { data, error } = await auth.supabase
    .from('galleries')
    .update({ access_token: newToken, status: 'PUBLISHED' })
    .eq('id', c.req.param('id'))
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)
  await logActivity(auth.supabase, 'REGENERATE_LINK', `Regenerated private link token for gallery "${data.title}"`)
  await invalidateGalleryCache(c.env)
  return c.json({ gallery: data })
})

// ── 4. Photos ──────────────────────────────────────────────────────

app.get('/api/galleries/:id/photos', async (c) => {
  const authHeader = c.req.header('Authorization')
  const supabase = getSupabaseClient(c.env, authHeader)
  const user = await getAuthedUser(supabase, authHeader)
  if (!user) return c.json({ error: 'Sign in required' }, 401)

  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('gallery_id', c.req.param('id'))
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return c.json({ error: error.message }, 401)
  return c.json({ photos: data })
})

async function assertGalleryAndAlbum(
  supabase: ReturnType<typeof getSupabaseClient>,
  galleryId: string,
  albumId: string | null,
) {
  const { data: gallery, error: galleryError } = await supabase
    .from('galleries')
    .select('id')
    .eq('id', galleryId)
    .maybeSingle()
  if (galleryError || !gallery) throw new Error('Gallery not found or access denied.')

  if (albumId) {
    const { data: album, error: albumError } = await supabase
      .from('albums')
      .select('id')
      .eq('id', albumId)
      .eq('gallery_id', galleryId)
      .maybeSingle()
    if (albumError || !album) throw new Error('Album does not belong to this gallery.')
  }
}

async function finalizePhotoInsert(
  c: AppContext,
  supabase: ReturnType<typeof getSupabaseClient>,
  galleryId: string,
  r2Key: string,
  albumId: string | null,
  sortOrder: number,
  size: number,
  mimeType: string,
) {
  const { data, error } = await supabase
    .from('photos')
    .insert({
      gallery_id: galleryId,
      album_id: albumId,
      r2_key: r2Key,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      size,
      mime_type: mimeType,
    })
    .select()
    .single()

  if (error) {
    await c.env.PHOTOS.delete(r2Key)
    throw new Error(error.message)
  }

  // Only set the cover when one doesn't already exist.
  await supabase.from('galleries').update({ cover_path: r2Key }).eq('id', galleryId).is('cover_path', null)
  return data
}

const MAX_PHOTO_BYTES = 100 * 1024 * 1024 // Cloudflare's own request-body ceiling on Free/Pro

// Multipart form upload — used by the Darkroom's multi-file picker.
app.post('/api/galleries/:id/photos', async (c) => {
  const auth = await requireAnyPermission(c, ['manageGalleries', 'uploadPhotos'])
  if (!auth.ok) return auth.response

  const galleryId = c.req.param('id')
  const contentType = c.req.header('Content-Type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'multipart/form-data is required for this endpoint' }, 400)
  }

  const formData = await c.req.parseBody()
  const rawFile = formData.file
  const file = Array.isArray(rawFile) ? rawFile[0] : rawFile
  if (!file || typeof file === 'string') return c.json({ error: 'file is required' }, 400)

  if (file.size <= 0) return c.json({ error: 'Uploaded file is empty.' }, 400)
  if (file.size > MAX_PHOTO_BYTES) return c.json({ error: 'Photo exceeds the 100MB upload limit.' }, 400)
  if (!isAllowedImageType(file.type)) {
    return c.json({ error: 'Only JPEG, PNG, WebP, and AVIF images are accepted.' }, 400)
  }

  const albumId = (formData.album_id as string | undefined) || null
  const sortOrder = Number(formData.sort_order || '0')

  try {
    await assertGalleryAndAlbum(auth.supabase, galleryId, albumId)
    const filename = safeFilename(file.name || 'upload')
    const r2Key = `${galleryId}/${crypto.randomUUID()}-${filename}`
    await c.env.PHOTOS.put(r2Key, file.stream(), { httpMetadata: { contentType: file.type } })
    const photo = await finalizePhotoInsert(c, auth.supabase, galleryId, r2Key, albumId, sortOrder, file.size, file.type)
    return c.json({ photo }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    console.error(`[upload] multipart upload to gallery ${galleryId} failed:`, message)
    return c.json({ error: message }, 400)
  }
})

// Raw-body PUT upload — streams straight to R2 rather than buffering
// the whole file into memory first, which matters as files approach
// the 100MB ceiling.
app.put('/api/galleries/:id/photos', async (c) => {
  const auth = await requireAnyPermission(c, ['manageGalleries', 'uploadPhotos'])
  if (!auth.ok) return auth.response

  const filename = c.req.query('filename')
  if (!filename) return c.json({ error: 'filename query param is required' }, 400)
  if (!c.req.raw.body) return c.json({ error: 'request body is empty' }, 400)

  const contentLength = Number(c.req.header('Content-Length') ?? '0')
  if (contentLength > MAX_PHOTO_BYTES) return c.json({ error: 'Photo exceeds the 100MB upload limit.' }, 400)

  const contentType = c.req.header('Content-Type') ?? 'application/octet-stream'
  if (!isAllowedImageType(contentType)) {
    return c.json({ error: 'Only JPEG, PNG, WebP, and AVIF images are accepted.' }, 400)
  }

  const galleryId = c.req.param('id')
  const albumId = c.req.query('album_id') || null
  const sortOrder = Number.parseInt(c.req.query('sort_order') ?? '0', 10) || 0

  try {
    await assertGalleryAndAlbum(auth.supabase, galleryId, albumId)
    const filenameSafe = safeFilename(filename)
    const r2Key = `${galleryId}/${crypto.randomUUID()}-${filenameSafe}`
    const uploaded = await c.env.PHOTOS.put(r2Key, c.req.raw.body, { httpMetadata: { contentType } })
    const size = uploaded?.size ?? contentLength
    const photo = await finalizePhotoInsert(c, auth.supabase, galleryId, r2Key, albumId, sortOrder, size, contentType)
    return c.json({ photo }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    console.error(`[upload] streamed upload to gallery ${galleryId} failed:`, message)
    return c.json({ error: message }, 400)
  }
})

app.delete('/api/galleries/:id/photos/:photoId', async (c) => {
  const auth = await requireAnyPermission(c, ['manageGalleries', 'uploadPhotos'])
  if (!auth.ok) return auth.response

  const galleryId = c.req.param('id')
  const photoId = c.req.param('photoId')

  const { data: photo, error: fetchError } = await auth.supabase
    .from('photos')
    .select('r2_key')
    .eq('id', photoId)
    .eq('gallery_id', galleryId)
    .single()
  if (fetchError || !photo) return c.json({ error: 'Photo not found' }, 404)

  const { error: deleteError } = await auth.supabase.from('photos').delete().eq('id', photoId).eq('gallery_id', galleryId)
  if (deleteError) return c.json({ error: deleteError.message }, 400)

  await c.env.PHOTOS.delete(photo.r2_key)

  const { data: gallery } = await auth.supabase.from('galleries').select('cover_path').eq('id', galleryId).single()
  if (gallery?.cover_path === photo.r2_key) {
    const { data: remaining } = await auth.supabase
      .from('photos')
      .select('r2_key')
      .eq('gallery_id', galleryId)
      .order('sort_order', { ascending: true })
      .limit(1)
    await auth.supabase.from('galleries').update({ cover_path: remaining?.[0]?.r2_key ?? null }).eq('id', galleryId)
  }

  return c.json({ success: true })
})

app.get('/api/photos/:photoId', async (c) => {
  const authHeader = c.req.header('Authorization')
  const supabase = getSupabaseClient(c.env, authHeader)
  const auth = await requireAnyPermission(c, ['manageGalleries', 'uploadPhotos'])
  if (!auth.ok) return auth.response

  const { data: photo, error } = await supabase.from('photos').select('r2_key').eq('id', c.req.param('photoId')).single()
  if (error || !photo) return c.json({ error: 'Not found' }, 404)

  const object = await c.env.PHOTOS.get(photo.r2_key)
  if (!object) return c.json({ error: 'Not found' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'private, max-age=3600')
  return new Response(object.body, { headers })
})

// ── 5. Clients ───────────────────────────────────────────────────

app.get('/api/clients', async (c) => {
  const auth = await requirePermission(c, 'viewFinances')
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase.from('clients').select('*').order('created_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ clients: data })
})

app.post('/api/clients', async (c) => {
  const auth = await requirePermission(c, 'viewFinances')
  if (!auth.ok) return auth.response

  const body = await c.req.json<ClientWriteBody>()
  if (!body.name?.trim()) return c.json({ error: 'Client name is required' }, 400)

  const { data, error } = await auth.supabase
    .from('clients')
    .insert({
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      notes: body.notes || null,
      total_amount: body.total_amount ?? 0,
      amount_paid: body.amount_paid ?? 0,
    })
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)
  await logActivity(auth.supabase, 'CREATE_CLIENT', `Added client "${body.name}"`)
  return c.json({ client: data }, 201)
})

app.patch('/api/clients/:id', async (c) => {
  const auth = await requirePermission(c, 'viewFinances')
  if (!auth.ok) return auth.response

  const body = await c.req.json<ClientWriteBody>()
  const fields: (keyof ClientWriteBody)[] = ['name', 'email', 'phone', 'notes', 'total_amount', 'amount_paid']
  const updateData: Partial<ClientWriteBody> = {}
  for (const field of fields) {
    if (body[field] !== undefined) (updateData as Record<string, unknown>)[field] = body[field]
  }

  const { data, error } = await auth.supabase.from('clients').update(updateData).eq('id', c.req.param('id')).select().single()
  if (error) return c.json({ error: error.message }, 400)
  await logActivity(auth.supabase, 'UPDATE_CLIENT', `Updated client details for "${data.name}"`)
  return c.json({ client: data })
})

app.delete('/api/clients/:id', async (c) => {
  const auth = await requirePermission(c, 'viewFinances')
  if (!auth.ok) return auth.response

  const clientId = c.req.param('id')
  const { data: client } = await auth.supabase.from('clients').select('name').eq('id', clientId).single()

  const { error } = await auth.supabase.from('clients').delete().eq('id', clientId)
  if (error) return c.json({ error: error.message }, 400)

  if (client) await logActivity(auth.supabase, 'DELETE_CLIENT', `Deleted client record for "${client.name}"`)
  return c.json({ success: true })
})

// ── 6. Albums ──────────────────────────────────────────────────────

app.get('/api/galleries/:id/albums', async (c) => {
  const auth = await requireAnyPermission(c, ['manageGalleries', 'uploadPhotos'])
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('albums')
    .select('*')
    .eq('gallery_id', c.req.param('id'))
    .order('sort_order', { ascending: true })

  if (error) return c.json({ error: error.message }, 400)
  return c.json({ albums: data })
})

app.post('/api/galleries/:id/albums', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  const galleryId = c.req.param('id')
  const body = await c.req.json<AlbumWriteBody>()
  if (!body.name?.trim()) return c.json({ error: 'Album name is required' }, 400)

  const { data, error } = await auth.supabase
    .from('albums')
    .insert({ gallery_id: galleryId, name: body.name, description: body.description ?? null, sort_order: body.sort_order ?? 0 })
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)
  await logActivity(auth.supabase, 'CREATE_ALBUM', `Created album "${body.name}" inside gallery ${galleryId}`)
  return c.json({ album: data }, 201)
})

app.patch('/api/galleries/:id/albums/:albumId', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  const body = await c.req.json<AlbumWriteBody>()
  const fields: (keyof AlbumWriteBody)[] = ['name', 'description', 'sort_order', 'cover_photo_id']
  const updateData: Partial<AlbumWriteBody> = {}
  for (const field of fields) {
    if (body[field] !== undefined) (updateData as Record<string, unknown>)[field] = body[field]
  }

  const { data, error } = await auth.supabase.from('albums').update(updateData).eq('id', c.req.param('albumId')).select().single()
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ album: data })
})

app.delete('/api/galleries/:id/albums/:albumId', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  const { error } = await auth.supabase.from('albums').delete().eq('id', c.req.param('albumId'))
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ success: true })
})

// ── 7. Staff profile & management ──────────────────────────────────

app.get('/api/studio/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  const supabase = getSupabaseClient(c.env, authHeader)
  const staff = await getCurrentStaffProfile(supabase, authHeader)
  if (!staff) return c.json({ error: 'Staff account inactive or not found' }, 403)
  return c.json({ staff })
})

app.get('/api/studio/staff', async (c) => {
  const auth = await requirePermission(c, 'manageStaff')
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('studio_staff')
    .select('id, user_id, email, full_name, role, permissions, is_active, created_at')
    .order('created_at', { ascending: true })

  if (error) return c.json({ error: error.message }, 400)
  return c.json({ staff: data })
})

app.patch('/api/studio/staff/:id', async (c) => {
  const auth = await requirePermission(c, 'manageStaff')
  if (!auth.ok) return auth.response

  const body = await c.req.json<StaffWriteBody>()
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.role) updateData.role = body.role
  if (body.permissions) updateData.permissions = body.permissions
  if (typeof body.is_active === 'boolean') updateData.is_active = body.is_active

  const { data, error } = await auth.supabase
    .from('studio_staff')
    .update(updateData)
    .eq('id', c.req.param('id'))
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)
  await logActivity(auth.supabase, 'UPDATE_STAFF', `Updated staff permissions for ${data.email} (${data.role})`)
  return c.json({ staff: data })
})

// ── 8. Activity log ──────────────────────────────────────────────

app.get('/api/studio/logs', async (c) => {
  const auth = await requirePermission(c, 'manageStaff')
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return c.json({ error: error.message }, 400)
  return c.json({ logs: data })
})

// ── 9. Optional: email a client their link directly ────────────────

app.post('/api/galleries/:id/send-email', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  if (!c.env.RESEND_API_KEY || !c.env.RESEND_FROM_EMAIL) {
    return c.json({ error: 'Email sending is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL). See README.md.' }, 500)
  }

  const galleryId = c.req.param('id')
  const { data: gallery, error: galleryError } = await auth.supabase
    .from('galleries')
    .select('*, clients(*)')
    .eq('id', galleryId)
    .single()

  if (galleryError || !gallery) return c.json({ error: 'Gallery not found.' }, 404)

  const clientEmail = gallery.clients?.email
  const clientName = gallery.clients?.name || 'Valued Client'
  if (!clientEmail) return c.json({ error: 'No client with an email is attached to this gallery.' }, 400)

  const galleryUrl = `${new URL(c.req.url).origin}/g/${gallery.access_token}`
  const safeClientName = escapeHtml(clientName)
  const safeTitle = escapeHtml(gallery.title)

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: c.env.RESEND_FROM_EMAIL,
      to: [clientEmail],
      subject: `Your photo gallery is ready: ${gallery.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; border: 1px solid #222; border-radius: 8px;">
          <p style="text-transform: uppercase; letter-spacing: 1px; font-size: 11px; color: #555;">Your studio</p>
          <h1 style="font-size: 22px; margin-top: 0;">Your gallery is ready</h1>
          <p>Hello ${safeClientName},</p>
          <p>Your photos for <strong>&quot;${safeTitle}&quot;</strong> are ready to view.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${galleryUrl}" style="background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 4px;">View gallery</a>
          </p>
          <p style="font-size: 12px; color: #777;">Or paste this link into your browser: <a href="${galleryUrl}">${galleryUrl}</a></p>
        </div>
      `,
    }),
  })

  if (!resendResponse.ok) {
    const body = await resendResponse.text()
    console.error('[email] Resend API rejected the request:', resendResponse.status, body)
    return c.json({ error: 'Failed to send email through Resend.' }, 500)
  }

  await logActivity(auth.supabase, 'EMAIL_DISPATCH', `Sent gallery link for "${gallery.title}" to ${clientEmail}`)
  return c.json({ success: true, message: `Access link sent to ${clientEmail}` })
})

// ── 10. Token-gated client access (no login) ────────────────────────

app.get('/api/g/:token', async (c) => {
  const token = c.req.param('token')
  if (!TOKEN_FORMAT.test(token)) return c.json({ error: 'Gallery not found or inactive' }, 404)

  const supabase = getSupabaseClient(c.env)
  const { data, error } = await supabase.rpc('gallery_by_token', { token }).maybeSingle()
  if (error || !data) return c.json({ error: 'Gallery not found or inactive' }, 404)
  return c.json({ gallery: data })
})

app.get('/api/g/:token/albums', async (c) => {
  const token = c.req.param('token')
  if (!TOKEN_FORMAT.test(token)) return c.json({ error: 'Gallery not found or inactive' }, 404)

  const supabase = getSupabaseClient(c.env)
  const { data, error } = await supabase.rpc('albums_by_gallery_token', { token })
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ albums: data ?? [] })
})

app.get('/api/g/:token/photos', async (c) => {
  const token = c.req.param('token')
  if (!TOKEN_FORMAT.test(token)) return c.json({ error: 'Gallery not found or inactive' }, 404)

  const supabase = getSupabaseClient(c.env)
  const { data, error } = await supabase.rpc('photos_by_gallery_token', { token })
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ photos: data ?? [] })
})

app.get('/api/g/:token/photos/:photoId', async (c) => {
  const token = c.req.param('token')
  if (!TOKEN_FORMAT.test(token)) return c.json({ error: 'Photo not found' }, 404)

  const supabase = getSupabaseClient(c.env)
  const { data: gallery, error: galleryError } = await supabase.rpc('gallery_by_token', { token }).maybeSingle()
  if (galleryError || !gallery) return c.json({ error: 'Gallery not found or inactive' }, 404)

  const galleryAccess = gallery as {
    total_amount?: number | string | null
    amount_paid?: number | string | null
    status?: string
    downloads_enabled?: boolean
  }

  const hasOutstandingBalance = Number(galleryAccess.total_amount ?? 0) - Number(galleryAccess.amount_paid ?? 0) > 0
  const isDraft = galleryAccess.status === 'DRAFT'
  const isReadyForDelivery = galleryAccess.status === 'READY' || galleryAccess.status === 'PUBLISHED'
  const wantsDownload = c.req.query('download') === 'true'

  if (wantsDownload) {
    if (!galleryAccess.downloads_enabled || isDraft || hasOutstandingBalance || !isReadyForDelivery) {
      return c.json(
        {
          error: isDraft
            ? 'This draft is view-only. Downloads unlock when the gallery is finalized.'
            : hasOutstandingBalance
              ? 'Download access is locked until the remaining balance is paid.'
              : 'This gallery is not ready for delivery yet.',
        },
        403,
      )
    }
  }

  const { data: r2Key, error } = await supabase.rpc('photo_r2_key_by_token', { token, photo_id: c.req.param('photoId') })
  if (error || !r2Key) return c.json({ error: 'Photo not found' }, 404)

  const object = await c.env.PHOTOS.get(r2Key)
  if (!object) return c.json({ error: 'Photo file not found in storage' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'private, max-age=3600')
  return new Response(object.body, { headers })
})

// Anything that isn't an /api/* route falls through to the built SPA.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default {
  fetch: app.fetch,

  // Fires on the schedule in wrangler.jsonc. A trivial read keeps the
  // free-tier Supabase project from crossing the 7-day inactivity pause.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const supabase = getSupabaseClient(env)
        const { error } = await supabase.from('heartbeat').select('id').limit(1)
        if (error) console.error('[cron] Keep-alive ping failed:', error.message)
      })(),
    )
  },
}