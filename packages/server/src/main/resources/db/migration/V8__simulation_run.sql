CREATE TABLE simulation_run (
  run_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  snapshot_id UUID NOT NULL REFERENCES snapshot(snapshot_id),
  engine_id TEXT NOT NULL,
  status TEXT NOT NULL,
  config JSONB NOT NULL,
  result JSONB,
  result_hash CHAR(64),
  config_hash CHAR(64) NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  failure_reason TEXT
);

CREATE INDEX simulation_run_ws_idx ON simulation_run (workspace_id, queued_at DESC, run_id);
CREATE INDEX simulation_run_status_idx ON simulation_run (workspace_id, status, queued_at);
