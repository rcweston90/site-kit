-- Every write to site_projects first keeps all of it here, so a bad bulk
-- edit can be put back by hand. The newest 200 are kept.
CREATE TABLE site_projects_snapshots (
  id BIGSERIAL PRIMARY KEY,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  rows JSONB NOT NULL
);
