-- The Shots gallery: one row per processed photo. The heavy work (resize,
-- dimensions, the blur placeholder) happens once at upload, so the public
-- page only reads this table. `media_key` is the MediaStore key of the file.
CREATE TABLE site_shots (
  id SERIAL PRIMARY KEY,
  media_key TEXT NOT NULL UNIQUE,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  blur_data_url TEXT,
  alt TEXT NOT NULL DEFAULT '',
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX site_shots_order_idx ON site_shots (sort_order, created_at DESC);
