ALTER TABLE object_type
  ADD COLUMN parent_type_id UUID NULL REFERENCES object_type(id);

CREATE TABLE value_type (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  template_version_id UUID NULL REFERENCES scene_template_version(id),
  code VARCHAR(128) NOT NULL,
  name VARCHAR(256) NOT NULL,
  base_primitive VARCHAR(24) NOT NULL,
  parent_value_type_id UUID NULL REFERENCES value_type(id),
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  version BIGINT NOT NULL DEFAULT 1,
  UNIQUE (workspace_id, code)
);

CREATE INDEX value_type_parent_idx ON value_type (parent_value_type_id);

INSERT INTO value_type (
  id,
  workspace_id,
  template_version_id,
  code,
  name,
  base_primitive,
  parent_value_type_id,
  constraints,
  published,
  version
)
SELECT
  md5(workspace.id::text || ':value_type:' || root.code)::uuid,
  workspace.id,
  NULL,
  root.code,
  root.name,
  root.code,
  NULL,
  '{}'::jsonb,
  TRUE,
  1
FROM workspace
CROSS JOIN (
  VALUES
    ('string', 'String'),
    ('text', 'Text'),
    ('integer', 'Integer'),
    ('number', 'Number'),
    ('boolean', 'Boolean'),
    ('date', 'Date'),
    ('datetime', 'Datetime'),
    ('enum', 'Enum'),
    ('ref', 'Reference'),
    ('json', 'Json')
) AS root(code, name);

ALTER TABLE field_def
  ADD COLUMN value_type_id UUID NULL REFERENCES value_type(id);

UPDATE field_def field
SET value_type_id = value_type.id
FROM object_type type, value_type
WHERE field.object_type_id = type.id
  AND value_type.workspace_id = type.workspace_id
  AND value_type.code = field.data_type;
