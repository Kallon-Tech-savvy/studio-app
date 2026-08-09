import { Redis } from '@upstash/redis/cloudflare'

function isPlaceholder(value: string | undefined) {
  return !value || value.includes('your-db.upstash.io') || value.includes('your-upstash-token')
}

export function getRedisClient(env: Env): Redis | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim()
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim()

  if (!url || !token || isPlaceholder(url) || isPlaceholder(token)) {
    console.debug('Upstash Redis is disabled because the local environment does not provide a valid Redis URL/token.')
    return null
  }

  return new Redis({
    url,
    token,
  })
}
