import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client scoped to the incoming request.
 *
 * Passing the caller's Authorization header means Postgres RLS
 * policies see the real auth.uid() of whoever is asking — a client
 * only ever sees their own galleries, without the Worker needing a
 * service-role key (and the security surface that comes with one).
 */
export function getSupabaseClient(env: Env, authHeader?: string | null) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
