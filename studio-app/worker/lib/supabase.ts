import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client scoped to the incoming request.
 *
 * Passing the caller's Authorization header means Postgres RLS
 * policies see the real auth.uid() of whoever is asking — a client
 * only ever sees their own galleries, without the Worker needing a
 * service-role key (and the security surface that comes with one).
 */
function isPlaceholder(value: string | undefined) {
  return !value || value.includes('YOUR_PROJECT') || value.includes('your-anon-key')
}

export function getSupabaseClient(env: Env, authHeader?: string | null) {
  const supabaseUrl = env.SUPABASE_URL?.trim()
  const supabaseAnonKey = env.SUPABASE_ANON_KEY?.trim()

  if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey)) {
    throw new Error(
      'Invalid Supabase worker secrets: update studio-app/.dev.vars or Cloudflare Worker secrets with your real SUPABASE_URL and SUPABASE_ANON_KEY.',
    )
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Validates the caller's JWT against Supabase Auth and returns the user,
 * or null if there's no valid session. Use this to gate write routes —
 * the RLS policies in schema.sql are the real enforcement, this is just
 * what lets a route return a clean 401 instead of a confusing DB error.
 */
export async function getAuthedUser(
  supabase: ReturnType<typeof getSupabaseClient>,
  authHeader?: string | null,
) {
  const jwt = authHeader?.replace(/^Bearer\s+/i, '')
  if (!jwt) return null

  const { data, error } = await supabase.auth.getUser(jwt)
  if (error) return null
  return data.user
}
