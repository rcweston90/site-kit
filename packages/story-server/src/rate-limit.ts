/**
 * Rate limiting for sign-in attempts.
 *
 * The default limiter counts in memory, per server instance. That's right for
 * one long-running server; on serverless hosts each instance counts on its
 * own, so pass a shared limiter (`createPostgresRateLimiter` from
 * `@rcweston/story-server/postgres`, or your own) to hold the limit across
 * them.
 */

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Count one hit against `bucket` and say whether it's still within `max` for the window. */
  hit(bucket: string, max: number, windowMs: number): Promise<RateLimitResult>;
  /** Read `bucket` without counting: is it still under `max` in its current window? */
  peek(bucket: string, max: number): Promise<RateLimitResult>;
}

export interface MemoryRateLimiterOptions {
  now?: () => number;
  /** Buckets kept before expired ones are swept. Default 10,000. */
  maxBuckets?: number;
}

export function createMemoryRateLimiter(options: MemoryRateLimiterOptions = {}): RateLimiter {
  const now = options.now ?? (() => Date.now());
  const maxBuckets = options.maxBuckets ?? 10_000;
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const retry = (resetAt: number) => Math.max(0, Math.ceil((resetAt - now()) / 1000));

  return {
    async hit(bucket, max, windowMs) {
      const at = now();
      if (buckets.size > maxBuckets) {
        for (const [key, entry] of buckets) if (at > entry.resetAt) buckets.delete(key);
      }
      const entry = buckets.get(bucket);
      if (!entry || at > entry.resetAt) {
        buckets.set(bucket, { count: 1, resetAt: at + windowMs });
        return { allowed: 1 <= max, count: 1, retryAfterSeconds: 1 <= max ? 0 : retry(at + windowMs) };
      }
      entry.count += 1;
      const allowed = entry.count <= max;
      return { allowed, count: entry.count, retryAfterSeconds: allowed ? 0 : retry(entry.resetAt) };
    },

    async peek(bucket, max) {
      const entry = buckets.get(bucket);
      if (!entry || now() > entry.resetAt) return { allowed: true, count: 0, retryAfterSeconds: 0 };
      const allowed = entry.count < max;
      return { allowed, count: entry.count, retryAfterSeconds: allowed ? 0 : retry(entry.resetAt) };
    },
  };
}
