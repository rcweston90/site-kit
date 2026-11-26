-- Which pages and resources visitors can find: one switch per site path.
-- A path with no row is visible, so a fresh database shows the whole site.
CREATE TABLE site_page_visibility (
  page_path TEXT PRIMARY KEY CHECK (page_path ~ '^/[a-z0-9/-]*$'),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
