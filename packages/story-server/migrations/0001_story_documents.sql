-- Story documents: every saved version, append-only and hash-addressed.
-- Saving never rewrites a row; it adds the next version. A version's parent
-- is the version it was edited from, always under the same address.
CREATE TABLE story_documents (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  workflow_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (workflow_status IN ('draft', 'ready', 'archived')),
  content JSONB NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  source_kind TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_commit TEXT NOT NULL DEFAULT '',
  parent_document_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug, version),
  UNIQUE (slug, id),
  FOREIGN KEY (slug, parent_document_id) REFERENCES story_documents (slug, id)
);

-- Restoring an old version saves a new one with the same content, so the
-- checksum is indexed for audits but not unique within a story.
CREATE INDEX story_documents_slug_content_idx ON story_documents (slug, content_sha256);
CREATE INDEX story_documents_slug_created_idx ON story_documents (slug, created_at DESC);

-- What readers see: one pointer per story to one saved version. Saving a
-- draft never touches it; only an explicit publish does.
CREATE TABLE story_publications (
  slug TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by TEXT,
  FOREIGN KEY (slug, document_id) REFERENCES story_documents (slug, id)
);
