import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // The Supabase SDK's own error for this ("supabaseKey is required.")
  // gives no hint about *why* — and this project has a real gotcha
  // behind it: the browser needs its own copy of these values in `.env`
  // (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), separate from the
  // `.dev.vars` copy (SUPABASE_URL / SUPABASE_ANON_KEY) the Worker uses.
  // It's easy to fill in one file and assume it covers both. main.tsx
  // checks for this before rendering and shows the person a setup
  // screen instead of a blank page — this throw is a fallback for any
  // other entry point that imports this module directly.
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Add both to a .env file in the project root ' +
      '(copy .env.example) with your Supabase project URL and anon key, then restart `npm run dev`. ' +
      'This is separate from .dev.vars, which the Worker uses.',
  )
}

// Safe to expose to the browser: this is the anon key, scoped by
// Row Level Security policies (see supabase/schema.sql).
export const supabase = createClient(url, anonKey)
