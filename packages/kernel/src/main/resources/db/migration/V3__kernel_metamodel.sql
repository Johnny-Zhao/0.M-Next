CREATE TABLE scene_template (
  id UUID PRIMARY KEY,
  code VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(256) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE scene_template_version (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES scene_template(id),
  version INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  published_by VARCHAR(64),
  UNIQUE (template_id, version)
);

ALTER TABLE object_type
  ADD COLUMN template_version_id UUID NULL REFERENCES scene_template_version(id),
  ADD COLUMN created_by VARCHAR(64) NOT NULL DEFAULT 'migration',
  ADD COLUMN updated_by VARCHAR(64) NOT NULL DEFAULT 'migration',
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE field_def
  ADD COLUMN template_version_id UUID NULL REFERENCES scene_template_version(id),
  ADD COLUMN data_type VARCHAR(24) NOT NULL DEFAULT 'string',
  ADD COLUMN constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN created_by VARCHAR(64) NOT NULL DEFAULT 'migration',
  ADD COLUMN updated_by VARCHAR(64) NOT NULL DEFAULT 'migration',
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE relation_type
  ADD COLUMN template_version_id UUID NULL REFERENCES scene_template_version(id),
  ADD COLUMN created_by VARCHAR(64) NOT NULL DEFAULT 'migration',
  ADD COLUMN updated_by VARCHAR(64) NOT NULL DEFAULT 'migration',
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE workspace
  ADD COLUMN template_id UUID NULL REFERENCES scene_template(id),
  ADD COLUMN template_version INTEGER NULL;

ALTER TABLE object_type
  ALTER COLUMN created_by DROP DEFAULT,
  ALTER COLUMN updated_by DROP DEFAULT,
  ALTER COLUMN created_at DROP DEFAULT,
  ALTER COLUMN updated_at DROP DEFAULT;

ALTER TABLE field_def
  ALTER COLUMN created_by DROP DEFAULT,
  ALTER COLUMN updated_by DROP DEFAULT,
  ALTER COLUMN created_at DROP DEFAULT,
  ALTER COLUMN updated_at DROP DEFAULT;

ALTER TABLE relation_type
  ALTER COLUMN created_by DROP DEFAULT,
  ALTER COLUMN updated_by DROP DEFAULT,
  ALTER COLUMN created_at DROP DEFAULT,
  ALTER COLUMN updated_at DROP DEFAULT;

UPDATE field_def
SET data_type = 'number'
WHERE code = 'cost'
  AND object_type_id = '22222222-2222-4222-8222-222222222222';
