import { kv } from '@vercel/kv';

async function windowCheck(key, limit, ttl) {
  const count = await kv.incr(key);
  if (count === 1) await kv.expire(key, ttl);
  if (count > limit) {
    const remaining = await kv.ttl(key);
    return { allowed: false, retryAfter: remaining > 0 ? remaining : ttl };
  }
  return { allowed: true };
}

// Sliding-window rate limit: 30 req/min, 200 req/hour.
// Master keys (non-da_ prefixed) are not rate limited.
export async function checkRateLimit(apiKey) {
  if (!apiKey || !apiKey.startsWith('da_')) return { allowed: true };

  const [minute, hour] = await Promise.all([
    windowCheck(`ratelimit:${apiKey}:minute`, 30,  60),
    windowCheck(`ratelimit:${apiKey}:hour`,   200, 3600),
  ]);

  if (!minute.allowed) return minute;
  if (!hour.allowed)   return hour;
  return { allowed: true };
}
