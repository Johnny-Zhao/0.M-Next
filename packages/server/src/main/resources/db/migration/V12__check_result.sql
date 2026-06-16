CREATE TABLE check_result (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  run_id UUID NOT NULL,
  rule_code VARCHAR(128) NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('BLOCK', 'WARN', 'INFO')),
  message TEXT NOT NULL,
  object_id UUID NOT NULL,
  field_code VARCHAR(128) NULL,
  config_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX check_result_run_idx
  ON check_result (workspace_id, run_id);

CREATE INDEX check_result_object_idx
  ON check_result (workspace_id, object_id);
