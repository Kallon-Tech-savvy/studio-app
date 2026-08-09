import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getSupabaseClient, getAuthedUser } from './lib/supabase'
import { getRedisClient } from './lib/redis'

const app = new Hono<{ Bindings: Env }>()

app.onError((err, c) => {
  console.error('Worker error:', err)
  return c.json({ error: err.message ?? 'Internal server error' }, 500)
})

app.use('/api/*', cors())

// Public galleries, cached in Redis for 5 minutes — at <100 visitors/day
// this alone keeps Supabase reads well inside the free tier.
app.get('/api/galleries', async (c) => {
  const redis = getRedisClient(c.env)
  const cacheKey = 'galleries:published'

  if (redis) {
    const cached = await redis.get(cacheKey)
    if (cached) {
      return c.json({ galleries: cached, cached: true })
    }
  }

  const supabase = getSupabaseClient(c.env)
  const { data, error } = await supabase
    .from('galleries')
    .select('id, title, cover_path, created_at')
    .eq('is_public', true)
    .order('created_at', { ascending: false })

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  if (redis) {
    await redis.set(cacheKey, data, { ex: 300 })
  }

  return c.json({ galleries: data, cached: false })
})

// A client's private gallery. The Authorization header (the client's
// Supabase session JWT) is forwarded so RLS decides what they can see —
// see the "photos follow their gallery's visibility" policy in schema.sql.
app.get('/api/galleries/:id/photos', async (c) => {
  const authHeader = c.req.header('Authorization')
  const supabase = getSupabaseClient(c.env, authHeader)

  const { data, error } = await supabase
    .from('photos')
    .select('id, r2_key, taken_at')
    .eq('gallery_id', c.req.param('id'))
    .order('taken_at', { ascending: true })

  if (error) {
    return c.json({ error: error.message }, 401)
  }

  return c.json({ photos: data })
})

// Create a gallery. owner_id comes from the verified JWT, never from the
// request body, so a client can't create a gallery on someone else's behalf.
app.post('/api/galleries', async (c) => {
  const authHeader = c.req.header('Authorization')
  const supabase = getSupabaseClient(c.env, authHeader)
  const user = await getAuthedUser(supabase, authHeader)
  if (!user) return c.json({ error: 'Sign in required' }, 401)

  const body = await c.req.json<{ title: string; is_public?: boolean }>()
  if (!body.title?.trim()) return c.json({ error: 'title is required' }, 400)

  const { data, error } = await supabase
    .from('galleries')
    .insert({ title: body.title, is_public: body.is_public ?? false, owner_id: user.id })
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)
  return c.json({ gallery: data }, 201)
})

// Upload one photo into a gallery: PUT .../photos?filename=IMG_001.jpg
// with the raw file bytes as the body. Streams straight to R2 rather
// than buffering in Worker memory.
//
// Note: Cloudflare caps request bodies at 100MB (free/Pro plans). Fine
// for JPEGs; if you shoot RAW and hit that ceiling, switch this route
// to R2's multipart upload API instead of a single PUT.
app.put('/api/galleries/:id/photos', async (c) => {
  const authHeader = c.req.header('Authorization')
  const supabase = getSupabaseClient(c.env, authHeader)
  const user = await getAuthedUser(supabase, authHeader)
  if (!user) return c.json({ error: 'Sign in required' }, 401)

  const filename = c.req.query('filename')
  if (!filename) return c.json({ error: 'filename query param is required' }, 400)
  if (!c.req.raw.body) return c.json({ error: 'request body is empty' }, 400)

  const galleryId = c.req.param('id')
  const r2Key = `${galleryId}/${crypto.randomUUID()}-${filename}`

  await c.env.PHOTOS.put(r2Key, c.req.raw.body, {
    httpMetadata: { contentType: c.req.header('Content-Type') ?? 'application/octet-stream' },
  })

  const { data, error } = await supabase
    .from('photos')
    .insert({ gallery_id: galleryId, r2_key: r2Key })
    .select()
    .single()

  if (error) {
    // The insert failed (e.g. not this gallery's owner) — don't leave
    // an orphaned object behind in R2.
    await c.env.PHOTOS.delete(r2Key)
    return c.json({ error: error.message }, 400)
  }

  // If this gallery doesn't yet have a cover, use the first uploaded
  // photo as its cover image path. This keeps the public listing from
  // staring at empty covers once a gallery is published.
  await supabase
    .from('galleries')
    .update({ cover_path: r2Key })
    .eq('id', galleryId)
    .eq('cover_path', null)

  return c.json({ photo: data }, 201)
})

// Serve one photo's bytes from R2. Access is decided by RLS, not by
// this route — we look the row up through the same policy that gates
// the list endpoint above, so a photo the caller can't see 404s exactly
// like one that doesn't exist.
app.get('/api/photos/:photoId', async (c) => {
  const authHeader = c.req.header('Authorization')
  const supabase = getSupabaseClient(c.env, authHeader)

  const { data: photo, error } = await supabase
    .from('photos')
    .select('r2_key')
    .eq('id', c.req.param('photoId'))
    .single()

  if (error || !photo) {
    return c.json({ error: 'Not found' }, 404)
  }

  const object = await c.env.PHOTOS.get(photo.r2_key)
  if (!object) {
    return c.json({ error: 'Not found' }, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  // "private" so shared/CDN caches never store it under one URL that's
  // sometimes public and sometimes gated by who's asking.
  headers.set('cache-control', 'private, max-age=3600')

  return new Response(object.body, { headers })
})

// Anything that isn't an /api/* route falls through to the built SPA.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default {
  fetch: app.fetch,

  // Fires on the schedule set in wrangler.jsonc ("triggers.crons").
  // A trivial read against a public, empty-of-real-data table is enough
  // to count as activity and reset Supabase's 7-day inactivity clock.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const supabase = getSupabaseClient(env)
        const { error } = await supabase.from('heartbeat').select('id').limit(1)
        if (error) {
          console.error('Keep-alive ping failed:', error.message)
        }
      })(),
    )
  },
}
