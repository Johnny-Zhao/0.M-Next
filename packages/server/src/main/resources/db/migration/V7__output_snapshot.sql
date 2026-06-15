CREATE TABLE output_snapshot (
  output_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  data_snapshot_id UUID NOT NULL,
  format VARCHAR(64) NOT NULL,
  template_id UUID,
  template_version INTEGER,
  review_status VARCHAR(32) NOT NULL,
  check_status VARCHAR(32) NOT NULL,
  data_version BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  artifact BYTEA NOT NULL
);

CREATE INDEX output_snapshot_ws_idx
  ON output_snapshot (workspace_id, created_at DESC);
