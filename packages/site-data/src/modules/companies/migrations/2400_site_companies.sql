-- The companies case studies belong to: one profile each, with its logo
-- library. Names are unique whatever their case, and so are addresses.
CREATE TABLE site_companies (
  slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 2400),
  website TEXT,
  logo_url TEXT,
  logo_library JSONB NOT NULL DEFAULT '{"logos":[],"defaultId":null}',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX site_companies_name_key ON site_companies (lower(btrim(name)));
