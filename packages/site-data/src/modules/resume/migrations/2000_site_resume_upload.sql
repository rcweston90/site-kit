-- The uploaded resume served at /resume: one row (key 'current'), pointing at
-- a PDF in the MediaStore. A body of null, or no row, means the host's shipped
-- base PDF is served instead.
CREATE TABLE site_resume_upload (
  key TEXT PRIMARY KEY CHECK (key = 'current'),
  body JSONB,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
