import { createClient } from '@supabase/supabase-js'

// Safe to expose to the browser: this is the anon key, scoped by
// Row Level Security policies (see supabase/schema.sql).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
