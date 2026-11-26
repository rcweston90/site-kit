-- Work's details beside each story (card label, organization, role, dates,
-- tags, images, links), and prototypes: Work cards with no story behind them.
CREATE TABLE site_projects (
  slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]',
  image TEXT,
  images JSONB NOT NULL DEFAULT '[]',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  date TEXT NOT NULL DEFAULT '',
  role TEXT,
  org TEXT,
  type TEXT,
  duration TEXT,
  url TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
