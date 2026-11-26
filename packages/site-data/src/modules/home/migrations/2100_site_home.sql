-- The home page's letter and header images: one JSON document per section.
-- No row means the section shows the copy the site shipped with.
CREATE TABLE site_home (
  section TEXT PRIMARY KEY CHECK (section IN ('about', 'header-images')),
  body JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
