/** A sign-in rate limiter shared by every server instance, on the `story_rate_limits` table (migration 0003). */

import type { RateLimiter, RateLimitResult } from '../rate-limit.js';
import type { SqlPool } from './client.js';

export function createPostgresRateLimiter({ pool }: { pool: SqlPool }): RateLimiter {
  const result = (row: { count: number | string; reset_at: Date | string } | undefined, max: number, counting: boolean): RateLimitResult => {
    if (!row) return { allowed: true, count: 0, retryAfterSeconds: 0 };
    const count = Number(row.count);
    const allowed = counting ? count <= max : count < max;
    const retryAfterSeconds = allowed ? 0 : Math.max(0, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
    return { allowed, count, retryAfterSeconds };
  };

  return {
    async hit(bucket, max, windowMs) {
      const seconds = Math.ceil(windowMs / 1000);
      const { rows } = await pool.query(
        `INSERT INTO story_rate_limits (bucket, count, reset_at)
         VALUES ($1, 1, NOW() + make_interval(secs => $2))
         ON CONFLICT (bucket) DO UPDATE SET
           count = CASE WHEN story_rate_limits.reset_at < NOW() THEN 1 ELSE story_rate_limits.count + 1 END,
           reset_at = CASE WHEN story_rate_limits.reset_at < NOW() THEN NOW() + make_interval(secs => $2) ELSE story_rate_limits.reset_at END
         RETURNING count, reset_at`,
        [bucket, seconds],
      );
      return result(rows[0], max, true);
    },
    async peek(bucket, max) {
      const { rows } = await pool.query('SELECT count, reset_at FROM story_rate_limits WHERE bucket = $1 AND reset_at >= NOW()', [bucket]);
      return result(rows[0], max, false);
    },
  };
}
