-- Which company each story (or prototype) belongs to, kept beside its
-- versions so a company can change without a new story version. A company
-- that something still belongs to can't be deleted.
CREATE TABLE site_company_memberships (
  story_slug TEXT PRIMARY KEY CHECK (story_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  company_slug TEXT NOT NULL REFERENCES site_companies (slug) ON DELETE RESTRICT ON UPDATE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX site_company_memberships_company ON site_company_memberships (company_slug);
