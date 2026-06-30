CREATE TABLE xmi_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  project_ref TEXT NOT NULL,
  xmi_id TEXT NOT NULL,
  platform_kind TEXT NOT NULL,
  platform_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (project_ref <> ''),
  CHECK (xmi_id <> ''),
  CHECK (platform_kind IN ('object', 'relation')),
  UNIQUE (workspace_id, project_ref, xmi_id)
);

CREATE INDEX xmi_identity_workspace_project_idx
  ON xmi_identity (workspace_id, project_ref);

CREATE TABLE xmi_baseline_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  project_ref TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (project_ref <> ''),
  CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CHECK (version > 0),
  UNIQUE (workspace_id, project_ref)
);
