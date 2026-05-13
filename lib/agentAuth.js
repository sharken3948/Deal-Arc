import { kv } from '@vercel/kv';

// Returns true if the request carries a valid API key — either the master key
// from env or a user-issued key stored in KV under key:{apiKey}.
export async function isAuthenticated(request) {
  const provided = request.headers.get('X-API-Key');
  if (!provided) return false;

  // Master key fast path
  if (process.env.AGENT_API_KEY && provided === process.env.AGENT_API_KEY) return true;

  // User-issued key: must start with da_ and exist in KV
  if (provided.startsWith('da_')) {
    const keyData = await kv.get(`key:${provided}`);
    if (keyData) {
      // Atomic request counter — fire and forget
      kv.incr(`requests:${provided}`).catch(() => {});
      return true;
    }
  }

  return false;
}
