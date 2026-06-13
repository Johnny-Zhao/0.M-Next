CREATE TABLE relation_type (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  code VARCHAR(128) NOT NULL,
  source_type UUID NOT NULL REFERENCES object_type(id),
  target_type UUID NOT NULL REFERENCES object_type(id),
  direction VARCHAR(16) NOT NULL,
  cardinality VARCHAR(16) NOT NULL,
  semantics VARCHAR(16) NOT NULL CHECK (semantics IN ('weak', 'strong')),
  hierarchical BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (workspace_id, code)
);

CREATE TABLE data_relation (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  relation_type_id UUID NOT NULL REFERENCES relation_type(id),
  source_id UUID NOT NULL REFERENCES data_object(id),
  target_id UUID NOT NULL REFERENCES data_object(id),
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL,
  version BIGINT NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX data_relation_source_idx
  ON data_relation (workspace_id, source_id, relation_type_id);

CREATE INDEX data_relation_target_idx
  ON data_relation (workspace_id, target_id, relation_type_id);

CREATE UNIQUE INDEX data_relation_active_unique_idx
  ON data_relation (relation_type_id, source_id, target_id)
  WHERE status = 'ACTIVE';

CREATE TABLE relation_history (
  id BIGSERIAL PRIMARY KEY,
  relation_id UUID NOT NULL,
  relation_type_id UUID NOT NULL,
  source_id UUID NOT NULL,
  target_id UUID NOT NULL,
  fields JSONB NOT NULL,
  status VARCHAR(32) NOT NULL,
  version BIGINT NOT NULL,
  changed_by VARCHAR(64) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL
);

-- hierarchical 类型当前仅支持树形(one_to_many);DAG 需改计数法闭包
CREATE TABLE relation_closure (
  relation_type_id UUID NOT NULL REFERENCES relation_type(id),
  ancestor_id UUID NOT NULL REFERENCES data_object(id),
  descendant_id UUID NOT NULL REFERENCES data_object(id),
  depth INTEGER NOT NULL CHECK (depth > 0),
  PRIMARY KEY (relation_type_id, ancestor_id, descendant_id)
);

CREATE INDEX relation_closure_descendant_idx
  ON relation_closure (relation_type_id, descendant_id, ancestor_id);

INSERT INTO relation_type (
  id, workspace_id, code, source_type, target_type,
  direction, cardinality, semantics, hierarchical
) VALUES
  (
    '44444444-4444-4444-8444-444444444441',
    '11111111-1111-4111-8111-111111111111',
    'depends_on',
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    'directed', 'many_to_many', 'weak', FALSE
  ),
  (
    '44444444-4444-4444-8444-444444444442',
    '11111111-1111-4111-8111-111111111111',
    'decomposes_to',
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    'directed', 'one_to_many', 'strong', TRUE
  );
