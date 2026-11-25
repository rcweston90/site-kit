-- Sign-in attempt counters shared by every server instance
-- (createPostgresRateLimiter). Each bucket counts hits until reset_at.
CREATE TABLE story_rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
