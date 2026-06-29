CREATE TABLE sim_result_series (
  run_id UUID NOT NULL REFERENCES simulation_run(run_id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  object_id UUID NOT NULL,
  field_code VARCHAR(128) NOT NULL,
  t DOUBLE PRECISION NOT NULL,
  value DOUBLE PRECISION,
  value_json JSONB,
  PRIMARY KEY (run_id, object_id, field_code, t)
);

CREATE INDEX sim_result_series_run_idx ON sim_result_series (run_id);
