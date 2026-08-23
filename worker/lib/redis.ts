import { Redis } from '@upstash/redis/cloudflare'

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true
  const normalized = value.trim().toLowerCase()
  return (
    normalized.includes('your-db.upstash.io') ||
    normalized.includes('your-upstash-token') ||
    normalized.includes('your_redis_url') ||
    normalized.includes('your_redis_token') ||
    normalized.includes('replace_me') ||
    normalized.includes('changeme')
  )
}

export function getRedisClient(env: Env): Redis | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim()
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim()

  if (!url || !token || isPlaceholder(url) || isPlaceholder(token) || !url.startsWith('https://')) {
    console.warn(
      'Redis disabled: UPSTASH_REDIS_REST_URL/TOKEN missing or still placeholder values. ' +
        'Public gallery listing will skip caching, not fail — this is expected in local dev unless you set real values.',
    )
    return null
  }

  try {
    return new Redis({ url, token })
  } catch (err) {
    console.error('Failed to construct Redis client despite valid-looking credentials:', err)
    return null
  }
}