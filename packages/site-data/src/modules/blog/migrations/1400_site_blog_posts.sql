-- Posts: one row per post, every saved version beside it, and a pointer to
-- the version readers see. Versions are only ever added; publishing moves
-- the pointer and unpublishing clears it, as stories do.
CREATE TABLE site_blog_posts (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 120),
  latest_document_id TEXT,
  published_document_id TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE site_blog_post_versions (
  id TEXT PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES site_blog_posts(id) ON DELETE CASCADE,
  parent_document_id TEXT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('editor', 'seed', 'restore')),
  source_ref TEXT NOT NULL DEFAULT '',
  content_sha256 TEXT NOT NULL,
  content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX site_blog_post_versions_by_post ON site_blog_post_versions (post_id, created_at DESC);
