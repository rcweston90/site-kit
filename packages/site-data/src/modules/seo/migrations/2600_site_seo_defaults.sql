-- Site-wide search and sharing defaults: one row (key 'site') whose body holds
-- the title template, default title, description, share image, keywords,
-- site name and social handle. No row means the host's fallbacks apply.
CREATE TABLE site_seo_defaults (
  key TEXT PRIMARY KEY CHECK (key = 'site'),
  body JSONB NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
