import { Hono } from 'hono'
import type { Context } from 'hono'
import { getSupabaseClient, getAuthedUser, getCurrentStaffProfile, type StaffProfile } from './lib/supabase'
import { getRedisClient } from './lib/redis'

type AppContext = Context<{ Bindings: Env }>

const app = new Hono<{ Bindings: Env }>()

app.onError((err, c) => {
  console.error('[worker] Unhandled error:', err instanceof Error ? err.stack ?? err.message : err)
  return c.json({ error: 'Something went wrong on our end. Please try again in a moment.' }, 500)
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
  if (!user) return { ok: false, response: c.json({ error: 'Your session has expired or is invalid. Please sign in again.' }, 401) }

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

// Some writes (editing the studio_staff roster) are owner-only at the
// RLS layer, not just permission-flag-gated — see "owners can manage
// all staff" in schema.sql. Checking that explicitly here means a
// non-owner gets a clear, deliberate 403 instead of a generic DB error
// surfacing from a write that RLS was always going to reject anyway.
async function requireOwner(c: AppContext): Promise<StaffAuth> {
  const auth = await requireStaff(c)
  if (!auth.ok) return auth
  if (auth.staff.role !== 'owner') {
    return { ok: false, response: c.json({ error: 'Only the studio owner can do this.' }, 403) }
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

// Atomic: runs as a single `experience_points = experience_points + amount`
// UPDATE inside award_staff_xp() (see schema.sql section 10), so concurrent
// uploads for the same staffId can no longer race and lose an increment.
// The RPC is SECURITY DEFINER specifically so this succeeds for non-owner
// staff too — the only RLS write policy on studio_staff is owner-only.
async function awardXP(supabase: ReturnType<typeof getSupabaseClient>, staffId: string, amount: number) {
  const { error } = await supabase.rpc('award_staff_xp', { p_staff_id: staffId, p_amount: amount })
  if (error) console.error('[gamification] Failed to award XP:', error.message)
}

async function incrementGalleriesPublished(supabase: ReturnType<typeof getSupabaseClient>, staffId: string) {
  const { error } = await supabase.rpc('increment_galleries_published', { p_staff_id: staffId })
  if (error) console.error('[gamification] Failed to increment galleries_published:', error.message)
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

// Supabase/Postgres error.message can contain column names, constraint
// names, or RPC internals — fine in a log, not fine in a response body
// (see Section 20/21 of the hardening brief: never expose raw DB errors
// to clients). Logs the real error server-side, returns a safe generic
// one to the client. `context` is a short label for the log line only.
function dbError(c: AppContext, context: string, error: { message: string }, status: 400 | 401 | 500 = 400) {
  console.error(`[${context}]`, error.message)
  const message =
    status === 401
      ? 'Your session has expired or is invalid. Please sign in again.'
      : 'Something went wrong on our end. Please try again in a moment.'
  return c.json({ error: message }, status)
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
  total_amount?: number
  amount_paid?: number
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
    return dbError(c, 'galleries:public_galleries', error, 500)
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
    .select('*, client:clients(id, name, email), photos(id)')
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: error.message }, 400)
  const galleries = (data ?? []).map((g: Record<string, unknown>) => ({
    ...g,
    photo_count: Array.isArray(g.photos) ? g.photos.length : 0,
  }))
  return c.json({ galleries })
})

app.post('/api/galleries', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  const body = await c.req.json<GalleryWriteBody>()
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400)

  const { data: authedUser } = await auth.supabase.auth.getUser()
  const ownerId = authedUser.user?.id

  const totalAmount = Number(body.total_amount ?? 0)
  const amountPaid = Number(body.amount_paid ?? 0)
  if (!Number.isFinite(totalAmount) || totalAmount < 0) return c.json({ error: 'Total amount must be a non-negative number.' }, 400)
  if (!Number.isFinite(amountPaid) || amountPaid < 0) return c.json({ error: 'Amount paid must be a non-negative number.' }, 400)
  if (amountPaid > totalAmount) return c.json({ error: 'Amount paid cannot exceed total amount.' }, 400)

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
      total_amount: totalAmount,
      amount_paid: amountPaid,
      owner_id: ownerId,
    })
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)

  await logActivity(auth.supabase, 'CREATE_GALLERY', `Created gallery "${body.title}" (${data.id})`)
  await awardXP(auth.supabase, auth.staff.id, 25) // 25 XP for creating a gallery
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

  if (body.total_amount !== undefined && (!Number.isFinite(Number(body.total_amount)) || Number(body.total_amount) < 0)) {
    return c.json({ error: 'Total amount must be a non-negative number.' }, 400)
  }
  if (body.amount_paid !== undefined && (!Number.isFinite(Number(body.amount_paid)) || Number(body.amount_paid) < 0)) {
    return c.json({ error: 'Amount paid must be a non-negative number.' }, 400)
  }

  const fields: (keyof GalleryWriteBody)[] = [
    'title', 'description', 'cover_path', 'is_public', 'status',
    'downloads_enabled', 'selection_enabled', 'watermark_enabled',
    'expiration_date', 'event_date', 'client_id', 'total_amount', 'amount_paid',
  ]
  const updateData: Partial<GalleryWriteBody> = {}
  for (const field of fields) {
    if (body[field] !== undefined) (updateData as Record<string, unknown>)[field] = body[field]
  }
  if (Object.keys(updateData).length === 0) return c.json({ error: 'Nothing to update' }, 400)

  const { data, error } = await auth.supabase.from('galleries').update(updateData).eq('id', galleryId).select().single()
  if (error) return c.json({ error: error.message }, 400)

  if (body.status === 'PUBLISHED') {
    await awardXP(auth.supabase, auth.staff.id, 50) // 50 XP for publishing
    await incrementGalleriesPublished(auth.supabase, auth.staff.id)
  }

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

  const { data: photos } = await auth.supabase.from('photos').select('r2_key, preview_r2_key').eq('gallery_id', galleryId)

  const { error } = await auth.supabase.from('galleries').delete().eq('id', galleryId)
  if (error) return c.json({ error: error.message }, 400)

  if (photos && photos.length > 0) {
    const results = await Promise.allSettled(photos.flatMap((p) => [c.env.PHOTOS.delete(p.r2_key), ...(p.preview_r2_key ? [c.env.PHOTOS.delete(p.preview_r2_key)] : [])]))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      console.error(`[r2] ${failed}/${results.length} object(s) failed to delete for gallery ${galleryId}`)
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

app.post('/api/galleries/:id/unlock-downloads', async (c) => {
  const auth = await requirePermission(c, 'manageGalleries')
  if (!auth.ok) return auth.response

  const galleryId = c.req.param('id')
  const { data: gallery, error: galleryError } = await auth.supabase
    .from('galleries')
    .select('id, title, status, client_id, downloads_enabled, total_amount, amount_paid')
    .eq('id', galleryId)
    .maybeSingle()

  if (galleryError || !gallery) return c.json({ error: 'Gallery not found' }, 404)

  const totalAmount = Number((gallery as Record<string, unknown>).total_amount ?? 0)
  const amountPaid = Number((gallery as Record<string, unknown>).amount_paid ?? 0)
  const outstandingBalance = Math.max(0, totalAmount - amountPaid)

  if (!gallery.client_id) {
    return c.json({ error: 'A client must be linked before download access can be unlocked.' }, 400)
  }

  if (gallery.status !== 'READY' && gallery.status !== 'PUBLISHED') {
    return c.json({ error: 'The gallery must be marked ready before downloads can be unlocked.' }, 400)
  }

  if (outstandingBalance > 0) {
    return c.json({ error: 'Download access is blocked until the remaining balance is paid.' }, 400)
  }

  const { data, error } = await auth.supabase
    .from('galleries')
    .update({ downloads_enabled: true, status: 'READY' })
    .eq('id', galleryId)
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)

  await logActivity(auth.supabase, 'DOWNLOAD_UNLOCKED', `Unlocked downloads for "${data.title}" (${galleryId})`)
  await invalidateGalleryCache(c.env)
  return c.json({ gallery: data })
})

app.post('/api/galleries/:id/payments', async (c) => {
  const auth = await requireAnyPermission(c, ['manageGalleries', 'viewFinances'])
  if (!auth.ok) return auth.response

  const galleryId = c.req.param('id')
  const body = await c.req.json<{ amount?: number }>()
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ error: 'Payment amount must be a positive number.' }, 400)
  }

  const { data, error } = await auth.supabase.rpc('record_gallery_payment', {
    p_gallery_id: galleryId,
    p_amount: amount,
  })
  if (error) return c.json({ error: error.message }, 400)

  await logActivity(auth.supabase, 'RECORD_GALLERY_PAYMENT', `Recorded payment of NLe ${amount.toLocaleString()} for gallery "${data.title}" (${galleryId})`)
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

  if (error) return dbError(c, 'galleries/:id/photos', error, 500)
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
  previewR2Key: string | null,
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
      preview_r2_key: previewR2Key,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      size,
      mime_type: mimeType,
    })
    .select()
    .single()

  if (error) {
    await Promise.allSettled([
      c.env.PHOTOS.delete(r2Key),
      ...(previewR2Key ? [c.env.PHOTOS.delete(previewR2Key)] : []),
    ])
    throw new Error(error.message)
  }

  // Only set the cover when one doesn't already exist.
  await supabase.from('galleries').update({ cover_path: r2Key }).eq('id', galleryId).is('cover_path', null)
  return data
}

const MAX_PHOTO_BYTES = 100 * 1024 * 1024 // Cloudflare's own request-body ceiling on Free/Pro

// ── 4a. Presigned upload — browser bypasses Worker memory entirely ─
//
// Phase 1: browser asks for a short-lived R2 PUT URL.
// Phase 2: browser PUTs bytes directly to R2 (no Worker involvement).
// Phase 3: browser calls /finalize to write the DB record.
//
// This eliminates the Worker memory spike that caused OOM on large
// mobile batches. The legacy multipart endpoint stays so existing
// integrations don't break.

app.post('/api/galleries/:id/photos/presign', async (c) => {
  const auth = await requireAnyPermission(c, ['manageGalleries', 'uploadPhotos'])
  if (!auth.ok) return auth.response

  const galleryId = c.req.param('id')
  const body = await c.req.json<{
    filename: string
    mimeType: string
    size: number
    albumId?: string | null
    sortOrder?: number
    includePreview?: boolean
  }>()

  if (!body.filename?.trim()) return c.json({ error: 'filename is required' }, 400)
  if (!isAllowedImageType(body.mimeType ?? '')) {
    return c.json({ error: 'Only JPEG, PNG, WebP, and AVIF images are accepted.' }, 400)
  }
  if (!body.size || body.size <= 0) return c.json({ error: 'size must be a positive number.' }, 400)
  if (body.size > MAX_PHOTO_BYTES) return c.json({ error: 'Photo exceeds the 100MB upload limit.' }, 400)

  const albumId = body.albumId ?? null
  try {
    await assertGalleryAndAlbum(auth.supabase, galleryId, albumId)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Invalid gallery or album.' }, 400)
  }

  const filename = safeFilename(body.filename)
  const r2Key = `${galleryId}/${crypto.randomUUID()}-${filename}`

  // 15-minute presigned PUT URL — long enough for a slow mobile upload
  // but short enough to limit misuse if intercepted.
  const TTL = 900
  const uploadUrl = await (c.env.PHOTOS as R2Bucket & {
    createPresignedUrl: (key: string, opts: { expiresIn: number; httpMethod: string }) => Promise<string>
  }).createPresignedUrl(r2Key, { expiresIn: TTL, httpMethod: 'PUT' })

  let previewUploadUrl: string | undefined
  let previewR2Key: string | undefined
  if (body.includePreview) {
    previewR2Key = `${galleryId}/preview-${crypto.randomUUID()}.webp`
    previewUploadUrl = await (c.env.PHOTOS as R2Bucket & {
      createPresignedUrl: (key: string, opts: { expiresIn: number; httpMethod: string }) => Promise<string>
    }).createPresignedUrl(previewR2Key, { expiresIn: TTL, httpMethod: 'PUT' })
  }

  return c.json({ uploadUrl, r2Key, previewUploadUrl, previewR2Key })
})

// Phase 3: browser reports that the direct R2 PUT succeeded.
// We verify the object exists, write the DB row, and award XP.
app.post('/api/galleries/:id/photos/finalize', async (c) => {
  const auth = await requireAnyPermission(c, ['manageGalleries', 'uploadPhotos'])
  if (!auth.ok) return auth.response

  const galleryId = c.req.param('id')
  const body = await c.req.json<{
    r2Key: string
    previewR2Key?: string | null
    albumId?: string | null
    sortOrder: number
    size: number
    mimeType: string
  }>()

  // Guard against cross-gallery r2Key injection
  if (!body.r2Key?.startsWith(`${galleryId}/`)) {
    return c.json({ error: 'r2Key does not belong to this gallery.' }, 400)
  }
  if (!isAllowedImageType(body.mimeType ?? '')) {
    return c.json({ error: 'Unrecognised MIME type.' }, 400)
  }

  // Confirm the object actually landed in R2 before creating the DB row.
  // headObject is cheaper than get + stream.
  const head = await c.env.PHOTOS.head(body.r2Key)
  if (!head) return c.json({ error: 'Upload not found in storage — the presigned URL may have expired.' }, 400)

  const albumId = body.albumId ?? null
  try {
    await assertGalleryAndAlbum(auth.supabase, galleryId, albumId)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Invalid gallery or album.' }, 400)
  }

  try {
    const photo = await finalizePhotoInsert(
      c,
      auth.supabase,
      galleryId,
      body.r2Key,
      body.previewR2Key ?? null,
      albumId,
      Number.isFinite(body.sortOrder) ? body.sortOrder : 0,
      body.size,
      body.mimeType,
    )
    await awardXP(auth.supabase, auth.staff.id, 10) // 10 XP per photo
    return c.json({ photo }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Finalize failed'
    console.error(`[upload] finalize failed for gallery ${galleryId}:`, message)
    return c.json({ error: message }, 400)
  }
})

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
  const rawPreview = formData.preview
  const preview = Array.isArray(rawPreview) ? rawPreview[0] : rawPreview
  if (!file || typeof file === 'string') return c.json({ error: 'file is required' }, 400)
  if (preview !== undefined && (typeof preview === 'string' || !isAllowedImageType(preview.type))) return c.json({ error: 'preview must be a valid image file' }, 400)
  if (preview && preview.size > 10 * 1024 * 1024) return c.json({ error: 'Preview exceeds the 10MB limit.' }, 400)

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

    let previewR2Key: string | null = null
    try {
      if (preview && preview.size > 0 && isAllowedImageType(preview.type)) {
        previewR2Key = `${galleryId}/preview-${crypto.randomUUID()}.jpg`
        await c.env.PHOTOS.put(previewR2Key, preview.stream(), { httpMetadata: { contentType: preview.type } })
      }
    } catch (previewError) {
      await c.env.PHOTOS.delete(r2Key)
      throw previewError
    }

    const photo = await finalizePhotoInsert(c, auth.supabase, galleryId, r2Key, previewR2Key, albumId, sortOrder, file.size, file.type)
    await awardXP(auth.supabase, auth.staff.id, 10) // 10 XP per photo
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
    const photo = await finalizePhotoInsert(c, auth.supabase, galleryId, r2Key, null, albumId, sortOrder, size, contentType)
    await awardXP(auth.supabase, auth.staff.id, 10) // 10 XP per photo
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
    .select('r2_key, preview_r2_key')
    .eq('id', photoId)
    .eq('gallery_id', galleryId)
    .single()
  if (fetchError || !photo) return c.json({ error: 'Photo not found' }, 404)

  const { error: deleteError } = await auth.supabase.from('photos').delete().eq('id', photoId).eq('gallery_id', galleryId)
  if (deleteError) return c.json({ error: deleteError.message }, 400)

  await Promise.allSettled([c.env.PHOTOS.delete(photo.r2_key), ...(photo.preview_r2_key ? [c.env.PHOTOS.delete(photo.preview_r2_key)] : [])])

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

// Reassigns a photo to a different album (or clears it with album_id: null).
// Previously the Darkroom did this as a direct client-side Supabase write,
// which skipped this permission check and the audit log entirely — any
// staff member could open the browser console and reassign any photo to
// any album ID with no server-side validation at all. This route restores
// the same requireAnyPermission gate every other photo mutation goes
// through, and reuses assertGalleryAndAlbum so the target album is verified
// to actually belong to this gallery before the write happens.
app.patch('/api/galleries/:id/photos/:photoId', async (c) => {
  const auth = await requireAnyPermission(c, ['manageGalleries', 'uploadPhotos'])
  if (!auth.ok) return auth.response

  const galleryId = c.req.param('id')
  const photoId = c.req.param('photoId')
  const body = await c.req.json<{ album_id?: string | null }>()
  const albumId = body.album_id ?? null

  try {
    await assertGalleryAndAlbum(auth.supabase, galleryId, albumId)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Invalid gallery or album.' }, 400)
  }

  const { data, error } = await auth.supabase
    .from('photos')
    .update({ album_id: albumId })
    .eq('id', photoId)
    .eq('gallery_id', galleryId)
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)
  if (!data) return c.json({ error: 'Photo not found' }, 404)

  await logActivity(auth.supabase, 'ASSIGN_PHOTO_ALBUM', `Reassigned photo ${photoId} to ${albumId ? `album ${albumId}` : 'no album'} in gallery ${galleryId}`)
  return c.json({ photo: data })
})

app.get('/api/photos/:photoId', async (c) => {
  const authHeader = c.req.header('Authorization')
  const supabase = getSupabaseClient(c.env, authHeader)
  const auth = await requireAnyPermission(c, ['manageGalleries', 'uploadPhotos'])
  if (!auth.ok) return auth.response

  const wantsPreview = c.req.query('preview') === 'true'
  const { data: photo, error } = await supabase
    .from('photos')
    .select('r2_key, preview_r2_key')
    .eq('id', c.req.param('photoId'))
    .single()
  if (error || !photo) return c.json({ error: 'Not found' }, 404)

  const storageKey = wantsPreview && photo.preview_r2_key ? photo.preview_r2_key : photo.r2_key
  const object = await c.env.PHOTOS.get(storageKey)
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

  const { data, error } = await auth.supabase
    .from('clients')
    .select('*, galleries:galleries(id, total_amount, amount_paid)')
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: error.message }, 400)

  const clients = (data ?? []).map((client: Record<string, unknown>) => {
    const clientGalleries = (client.galleries as Array<Record<string, unknown>>) ?? []
    if (clientGalleries.length > 0) {
      const projectTotal = clientGalleries.reduce((sum: number, g) => sum + Number(g.total_amount ?? 0), 0)
      const projectPaid = clientGalleries.reduce((sum: number, g) => sum + Number(g.amount_paid ?? 0), 0)
      return {
        ...client,
        total_amount: projectTotal,
        amount_paid: projectPaid,
      }
    }
    return client
  })

  return c.json({ clients })
})

app.post('/api/clients', async (c) => {
  const auth = await requirePermission(c, 'viewFinances')
  if (!auth.ok) return auth.response

  const body = await c.req.json<ClientWriteBody>()
  if (!body.name?.trim()) return c.json({ error: 'Client name is required' }, 400)
  const totalAmount = Number(body.total_amount ?? 0)
  const amountPaid = Number(body.amount_paid ?? 0)
  if (!Number.isFinite(totalAmount) || totalAmount < 0) return c.json({ error: 'Total amount must be a non-negative number.' }, 400)
  if (!Number.isFinite(amountPaid) || amountPaid < 0) return c.json({ error: 'Amount paid must be a non-negative number.' }, 400)
  if (amountPaid > totalAmount) return c.json({ error: 'Amount paid cannot exceed total amount.' }, 400)

  const { data, error } = await auth.supabase
    .from('clients')
    .insert({
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      notes: body.notes || null,
      total_amount: totalAmount,
      amount_paid: amountPaid,
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
  if (body.total_amount !== undefined && (!Number.isFinite(Number(body.total_amount)) || Number(body.total_amount) < 0)) {
    return c.json({ error: 'Total amount must be a non-negative number.' }, 400)
  }
  if (body.amount_paid !== undefined && (!Number.isFinite(Number(body.amount_paid)) || Number(body.amount_paid) < 0)) {
    return c.json({ error: 'Amount paid must be a non-negative number.' }, 400)
  }
  if (body.total_amount !== undefined || body.amount_paid !== undefined) {
    const current = await auth.supabase.from('clients').select('total_amount, amount_paid').eq('id', c.req.param('id')).maybeSingle()
    if (current.error || !current.data) return c.json({ error: 'Client not found.' }, 404)
    const total = Number(body.total_amount ?? current.data.total_amount)
    const paid = Number(body.amount_paid ?? current.data.amount_paid)
    if (paid > total) return c.json({ error: 'Amount paid cannot exceed total amount.' }, 400)
  }
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

// Records a payment as a delta, not an absolute value — the previous
// approach had the browser read amount_paid, add the payment locally,
// and PATCH the sum back. Two payments recorded close together (two
// staff, or two tabs) could race on that locally-cached value and one
// payment would silently overwrite the other. record_client_payment()
// does `amount_paid = amount_paid + p_amount` as a single atomic UPDATE,
// so this can no longer lose a payment no matter how it's timed.
app.post('/api/clients/:id/payments', async (c) => {
  const auth = await requirePermission(c, 'viewFinances')
  if (!auth.ok) return auth.response

  const body = await c.req.json<{ amount?: number }>()
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ error: 'Payment amount must be a positive number.' }, 400)
  }

  const { data, error } = await auth.supabase.rpc('record_client_payment', {
    p_client_id: c.req.param('id'),
    p_amount: amount,
  })

  if (error) {
    // record_client_payment raises its own friendly messages ("Client not
    // found.", "Payment would exceed the total amount owed.") — safe to
    // surface directly rather than the generic dbError() fallback.
    return c.json({ error: error.message }, 400)
  }

  await logActivity(auth.supabase, 'RECORD_PAYMENT', `Recorded a payment of ${amount} for client "${data.name}"`)
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
  const { data: existingAlbum } = await auth.supabase
    .from('albums')
    .select('id')
    .eq('id', c.req.param('albumId'))
    .eq('gallery_id', c.req.param('id'))
    .maybeSingle()
  if (!existingAlbum) return c.json({ error: 'Album not found.' }, 404)
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

  const { error } = await auth.supabase
    .from('albums')
    .delete()
    .eq('id', c.req.param('albumId'))
    .eq('gallery_id', c.req.param('id'))
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ success: true })
})

// ── 7. Staff profile & management ──────────────────────────────────

app.get('/api/studio/me', async (c) => {
  const auth = await requireStaff(c)
  if (!auth.ok) return auth.response
  return c.json({ staff: auth.staff })
})

app.get('/api/studio/staff', async (c) => {
  // RLS on studio_staff only lets a non-owner read their own row — a staff
  // member with permissions.manageStaff = true but role !== 'owner' would
  // previously pass this check and then silently get back just themselves
  // instead of the full roster. Owner-only here matches what the query can
  // actually return.
  const auth = await requireOwner(c)
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('studio_staff')
    .select('id, user_id, email, full_name, role, permissions, is_active, created_at')
    .order('created_at', { ascending: true })

  if (error) return c.json({ error: error.message }, 400)
  return c.json({ staff: data })
})

app.patch('/api/studio/staff/:id', async (c) => {
  const auth = await requireOwner(c)
  if (!auth.ok) return auth.response

  // The UI disables editing your own row (StaffView.tsx) so nobody
  // fumbles their own access away mid-session — but that's only a
  // client-side courtesy. Enforcing it here too means a direct API call
  // can't do what the interface deliberately won't let you click.
  if (c.req.param('id') === auth.staff.id) {
    return c.json({ error: "You can't change your own access — ask another owner or admin to do it." }, 403)
  }

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
  if (error) return dbError(c, 'g/:token/albums', error, 500)
  return c.json({ albums: data ?? [] })
})

app.get('/api/g/:token/photos', async (c) => {
  const token = c.req.param('token')
  if (!TOKEN_FORMAT.test(token)) return c.json({ error: 'Gallery not found or inactive' }, 404)

  const supabase = getSupabaseClient(c.env)
  const { data, error } = await supabase.rpc('photos_by_gallery_token', { token })
  if (error) return dbError(c, 'g/:token/photos', error, 500)
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

  let r2Key: string | null = null
  if (wantsDownload) {
    const result = await supabase.rpc('photo_r2_key_by_token', { token, photo_id: c.req.param('photoId') })
    if (result.error) return c.json({ error: 'Photo not found' }, 404)
    r2Key = result.data
    if (!r2Key) return c.json({ error: 'Photo not found' }, 404)
  } else {
    const preview = await supabase.rpc('photo_preview_r2_key_by_token', { token, photo_id: c.req.param('photoId') })
    r2Key = preview.data
    if (preview.error || !r2Key) return c.json({ error: 'Preview not available for this photo' }, 404)
  }

  const object = await c.env.PHOTOS.get(r2Key)
  if (!object) return c.json({ error: 'Photo file not found in storage' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', wantsDownload ? 'private, no-store' : 'private, max-age=3600')
  if (wantsDownload) {
    headers.set('content-disposition', `attachment; filename="frame-${c.req.param('photoId')}.jpg"`)
  }
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