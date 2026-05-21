// Simple in-memory rate limiter for API routes.
// Buckets are keyed by `${userId}:${endpoint}` and reset after `windowMs`.
// Works per-process — for multi-replica deploys, swap the Map for Redis.

const buckets = new Map();

// Prune expired entries every 5 minutes to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 5 * 60_000);

/**
 * @param {string} key        - Unique identifier (e.g. userId + endpoint)
 * @param {number} limit      - Max requests allowed in the window
 * @param {number} windowMs   - Window duration in milliseconds
 * @returns {{ ok: boolean, remaining: number, retryAfterMs: number }}
 */
export function checkRateLimit(key, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count++;

  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }

  return { ok: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}
