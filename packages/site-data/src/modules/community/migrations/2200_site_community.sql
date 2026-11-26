-- The community page as one JSON document: its words, talks and groups.
-- No row means the page shows the copy the site shipped with.
CREATE TABLE site_community (
  page TEXT PRIMARY KEY CHECK (page = 'community'),
  content JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
