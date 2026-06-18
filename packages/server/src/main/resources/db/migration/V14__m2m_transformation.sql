CREATE TABLE m2m_transformation (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  template_version_id UUID NULL REFERENCES scene_template_version(id),
  code VARCHAR(128) NOT NULL,
  name VARCHAR(256) NOT NULL,
  correspondence_relation_code VARCHAR(128) NOT NULL,
  object_mappings JSONB NOT NULL,
  relation_mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by VARCHAR(64) NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (workspace_id, code)
);

CREATE TABLE m2m_provenance (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  transformation_code VARCHAR(128) NOT NULL,
  source_object_id UUID NOT NULL,
  target_object_id UUID NOT NULL,
  run_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX m2m_provenance_source_unique_idx
  ON m2m_provenance (workspace_id, transformation_code, source_object_id);

CREATE INDEX m2m_provenance_run_idx
  ON m2m_provenance (workspace_id, transformation_code, run_id);
