CREATE TABLE import_task (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  storage_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  mapping JSONB,
  result JSONB,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('REGISTERED', 'PARSED', 'IMPORTED', 'FAILED')),
  CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX import_task_workspace_created_idx
  ON import_task (workspace_id, created_at DESC);
