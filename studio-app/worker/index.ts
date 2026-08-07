import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getSupabaseClient } from './lib/supabase'
import { getRedisClient } from './lib/redis'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', cors())

// Public galleries, cached in Redis for 5 minutes — at <100 visitors/day
// this alone keeps Supabase reads well inside the free tier.
app.get('/api/galleries', async (c) => {
  const redis = getRedisClient(c.env)
  const cacheKey = 'galleries:published'

  const cached = await redis.get(cacheKey)
  if (cached) {
    return c.json({ galleries: cached, cached: true })
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

  await redis.set(cacheKey, data, { ex: 300 })
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
