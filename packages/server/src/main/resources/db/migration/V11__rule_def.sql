CREATE TABLE rule_def (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  template_version_id UUID NULL REFERENCES scene_template_version(id),
  rule_code VARCHAR(128) NOT NULL,
  scope_object_type_id UUID NOT NULL REFERENCES object_type(id),
  scope_field_def_id UUID NULL REFERENCES field_def(id),
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('BLOCK', 'WARN', 'INFO')),
  when_src TEXT NOT NULL,
  message TEXT NOT NULL,
  impact JSONB NULL,
  suggest TEXT NULL,
  fix JSONB NULL,
  lightweight BOOLEAN NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  version BIGINT NOT NULL DEFAULT 1,
  created_by VARCHAR(64) NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (workspace_id, rule_code)
);

CREATE INDEX rule_def_scope_idx
  ON rule_def (workspace_id, scope_object_type_id, scope_field_def_id);
