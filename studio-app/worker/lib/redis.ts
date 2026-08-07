import { Redis } from '@upstash/redis/cloudflare'

export function getRedisClient(env: Env) {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  })
}
