CREATE TABLE reusable_assembly (
  assembly_id UUID PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  template_version_id UUID NOT NULL REFERENCES scene_template_version(id),
  version BIGINT NOT NULL DEFAULT 1,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  content JSONB NOT NULL,
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (template_version_id, name)
);

CREATE INDEX reusable_assembly_template_idx
  ON reusable_assembly (template_version_id, name);
