CREATE TABLE attachment (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  object_id UUID NOT NULL REFERENCES data_object(id),
  scope_ref TEXT,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key VARCHAR(128) NOT NULL,
  UNIQUE (workspace_id, idempotency_key),
  CHECK (status IN ('ACTIVE', 'DELETED')),
  CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX attachment_workspace_object_status_idx
  ON attachment (workspace_id, object_id, status);

CREATE TABLE rm_attachment (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  object_id UUID NOT NULL,
  scope_ref TEXT,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX rm_attachment_workspace_object_status_idx
  ON rm_attachment (workspace_id, object_id, status);
