import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export type StaffProfile = {
  id: string
  user_id: string
  email: string
  full_name: string
  role: 'owner' | 'admin' | 'photographer' | 'assistant'
  permissions: Record<string, boolean>
  is_active: boolean
}

const SUPABASE_REQUEST_TIMEOUT_MS = 8000

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true
  const normalized = value.trim().toLowerCase()
  return (
    normalized.includes('your_project') ||
    normalized.includes('your-project') ||
    normalized.includes('your-anon-key') ||
    normalized.includes('your_anon_key') ||
    normalized.includes('replace_me') ||
    normalized.includes('changeme')
  )
}

function looksLikeServiceRoleKey(key: string): boolean {
  const normalized = key.trim().toLowerCase()
  return (
    normalized.includes('service_role') ||
    normalized.includes('service-role') ||
    normalized.includes('supabase_service_role')
  )
}

/**
 * Wraps fetch with a hard timeout. Without this, a stalled request to
 * Supabase just sits there until Cloudflare's own platform-level limit
 * kicks in and returns a bare "504 upstream" to the browser — with
 * nothing in our own logs explaining why, since our code never got a
 * chance to run again. This aborts well before that point and logs
 * exactly which request stalled, so a real failure is diagnosable
 * instead of a mystery.
 */
function timeoutFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } catch (err) {
      if (controller.signal.aborted) {
        console.error(`[supabase] Timed out after ${timeoutMs}ms waiting on: ${url}`)
        throw new Error(`Upstream Supabase request timed out after ${timeoutMs}ms`)
      }
      console.error(`[supabase] Request failed: ${url}`, err instanceof Error ? err.message : err)
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Creates a Supabase client scoped to the incoming request. The
 * caller's Authorization header is forwarded so Postgres RLS evaluates
 * the request as the authenticated user — this must never be given a
 * service-role key, which is why looksLikeServiceRoleKey below throws
 * loudly if SUPABASE_ANON_KEY somehow contains one.
 */
export function getSupabaseClient(env: Env, authHeader?: string | null): SupabaseClient {
  const supabaseUrl = env.SUPABASE_URL?.trim()
  const supabaseAnonKey = env.SUPABASE_ANON_KEY?.trim()

  if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey)) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_ANON_KEY are missing or still placeholder values. ' +
        'Set real project credentials — see README.md step 8 (local) or step 9 (`wrangler secret put`).',
    )
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase Worker configuration (SUPABASE_URL / SUPABASE_ANON_KEY).')
  }

  if (!supabaseUrl.startsWith('https://')) {
    throw new Error(`SUPABASE_URL must start with "https://" — got: "${supabaseUrl}"`)
  }

  if (looksLikeServiceRoleKey(supabaseAnonKey)) {
    throw new Error('SUPABASE_ANON_KEY must not be a service-role key — use the anon/public key.')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
      fetch: timeoutFetch(SUPABASE_REQUEST_TIMEOUT_MS),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function extractBearerToken(authHeader?: string | null): string | null {
  if (!authHeader) return null
  const match = authHeader.trim().match(/^Bearer\s+(\S+)$/i)
  return match?.[1]?.trim() || null
}

export async function getAuthedUser(
  supabase: ReturnType<typeof getSupabaseClient>,
  authHeader?: string | null,
): Promise<User | null> {
  const jwt = extractBearerToken(authHeader)
  if (!jwt) return null

  try {
    const { data, error } = await supabase.auth.getUser(jwt)
    if (error) {
      console.warn('[auth] getUser rejected the provided token:', error.message)
      return null
    }
    return data.user
  } catch (err) {
    console.error('[auth] getUser threw unexpectedly:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Resolves the current signed-in user's staff profile in exactly one
 * round trip, via the get_or_create_staff_profile() RPC in schema.sql.
 * That function both creates the row (if this is the caller's first
 * time) and promotes the bootstrap owner email if needed — so this
 * one call replaces what used to be a 2–3 step chain (a separate
 * owner-sync RPC, then a fallback table select, with a fallback email
 * read from `env.VITE_OWNER_EMAIL` — a Vite/frontend build-time
 * variable that never exists in the Worker's env at all). Fewer round
 * trips, fewer places to silently hang, no dead fallback.
 */
export async function getCurrentStaffProfile(
  supabase: ReturnType<typeof getSupabaseClient>,
  authHeader?: string | null,
  env?: any,
): Promise<StaffProfile | null> {
  const user = await getAuthedUser(supabase, authHeader)
  if (!user || !user.email) {
    return null
  }

  const ownerEmail = env?.VITE_OWNER_EMAIL || env?.OWNER_EMAIL || 'alhajicmkallon01@gmail.com'
  const isOwner = user.email.toLowerCase() === ownerEmail.toLowerCase()

  try {
    const { data, error } = await supabase.rpc('get_or_create_staff_profile')
    if (!error && Array.isArray(data) && data.length > 0 && data[0]?.is_active) {
      return data[0] as StaffProfile
    }
    if (!error && data && !Array.isArray(data) && (data as any).is_active) {
      return data as unknown as StaffProfile
    }
  } catch (e) {
    console.warn('[staff] get_or_create_staff_profile RPC failed:', e)
  }

  if (isOwner) {
    return {
      id: user.id,
      user_id: user.id,
      email: user.email,
      full_name: 'Studio Owner',
      role: 'owner',
      permissions: {
        manageGalleries: true,
        uploadPhotos: true,
        manageStaff: true,
        viewFinances: true,
      },
      is_active: true,
    }
  }

  return null
}