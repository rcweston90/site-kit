-- The showreel the site plays: one row holding a video address or a Figma link.
-- No row means the reel the site shipped with plays.
CREATE TABLE site_showreel (
  reel TEXT PRIMARY KEY CHECK (reel = 'showreel'),
  url TEXT NOT NULL CHECK (length(url) BETWEEN 1 AND 2048),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
