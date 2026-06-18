CREATE TABLE derived_field (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  object_type_id UUID NOT NULL REFERENCES object_type(id),
  template_version_id UUID NULL REFERENCES scene_template_version(id),
  code VARCHAR(128) NOT NULL,
  name VARCHAR(256) NOT NULL,
  result_type VARCHAR(24) NOT NULL,
  derivation TEXT NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (object_type_id, code)
);

CREATE INDEX derived_field_object_type_idx
  ON derived_field (workspace_id, object_type_id);
