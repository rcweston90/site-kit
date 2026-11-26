-- The gallery's order as a whole carries its own version, so a reorder built
-- on an older order (another tab moved things) is refused instead of
-- shuffling the other tab's work. One row; a reorder bumps it.
CREATE TABLE site_shots_order (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ
);

INSERT INTO site_shots_order (id, version) VALUES (1, 0);
