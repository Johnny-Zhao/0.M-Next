CREATE TABLE snapshot (
  snapshot_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  scope_object_type VARCHAR(128),
  data_version BIGINT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX snapshot_ws_idx
  ON snapshot (workspace_id, created_at DESC);
