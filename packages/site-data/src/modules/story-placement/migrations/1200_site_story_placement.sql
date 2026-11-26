-- Where a published story shows: one row per story address. A story with no
-- row is listed, so publishing is all it takes to appear.
CREATE TABLE site_story_placement (
  story_slug TEXT PRIMARY KEY CHECK (story_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  listed BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
