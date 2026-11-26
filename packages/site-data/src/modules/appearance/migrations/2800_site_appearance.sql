-- How the public site looks for every visitor: one row (key 'site') whose
-- body holds the sunny switch, the theme a first visit starts on, the accent
-- and the typefaces. No row means the site's defaults.
CREATE TABLE site_appearance (
  key TEXT PRIMARY KEY CHECK (key = 'site'),
  body JSONB NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
