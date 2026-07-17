CREATE TABLE check_run (
  run_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  scope_object_type_code VARCHAR(128) NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX check_run_ws_idx ON check_run (workspace_id, completed_at DESC);
