-- One page's search and sharing override, keyed by its site path. Any field
-- left null inherits the page's own content and then the site defaults.
CREATE TABLE site_seo_page_overrides (
  page_path TEXT PRIMARY KEY CHECK (page_path ~ '^/[A-Za-z0-9._~%/-]*$'),
  body JSONB NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
