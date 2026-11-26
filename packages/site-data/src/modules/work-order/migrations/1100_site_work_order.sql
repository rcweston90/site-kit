-- The hand-set order of each list: one row per list, the whole order in one
-- JSON array of story addresses. A list nobody has arranged has no row.
CREATE TABLE site_work_order (
  list TEXT PRIMARY KEY CHECK (list ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  slugs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(slugs) = 'array'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
