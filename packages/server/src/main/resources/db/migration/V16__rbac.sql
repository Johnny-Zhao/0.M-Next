CREATE TABLE app_user (
  id UUID PRIMARY KEY,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE TABLE workspace_member (
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  user_id UUID NOT NULL REFERENCES app_user(id),
  role TEXT NOT NULL,
  granted_by TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id),
  CHECK (role IN ('VIEWER', 'AUTHOR', 'REVIEWER', 'ADMIN'))
);

CREATE INDEX workspace_member_workspace_idx
  ON workspace_member (workspace_id);
