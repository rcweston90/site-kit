-- A story's address can change. The old address keeps working: each row sends
-- one retired address to the story's current one. Rows stay flat (renaming
-- again re-points every older address at the newest), so resolving an
-- address is one lookup, never a chain. Saved versions keep the address they
-- were written under.
CREATE TABLE story_slug_redirects (
  from_slug TEXT PRIMARY KEY CHECK (from_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  to_slug TEXT NOT NULL CHECK (to_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_slug <> to_slug)
);

CREATE INDEX story_slug_redirects_to_slug_idx ON story_slug_redirects (to_slug);
