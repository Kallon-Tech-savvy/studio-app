export {}

declare global {
  interface Env {
    ENVIRONMENT: string

    // Secrets — set with `wrangler secret put <NAME>`, see README.md
    SUPABASE_URL: string
    SUPABASE_ANON_KEY: string
    UPSTASH_REDIS_REST_URL: string
    UPSTASH_REDIS_REST_TOKEN: string
    RESEND_API_KEY?: string
    RESEND_FROM_EMAIL?: string

    // Bindings — declared in wrangler.jsonc
    PHOTOS: R2Bucket
    ASSETS: Fetcher
  }
}
