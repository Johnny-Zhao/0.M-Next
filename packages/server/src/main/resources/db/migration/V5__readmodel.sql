CREATE TABLE rm_object (
  workspace_id UUID NOT NULL,
  object_id UUID NOT NULL,
  object_type_code VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  version BIGINT NOT NULL,
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, object_id)
);

CREATE INDEX rm_object_type_idx
  ON rm_object (workspace_id, object_type_code, object_id);

CREATE TABLE rm_relation (
  workspace_id UUID NOT NULL,
  relation_id UUID NOT NULL,
  relation_type_code VARCHAR(128) NOT NULL,
  source_id UUID NOT NULL,
  target_id UUID NOT NULL,
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  hierarchical BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL,
  version BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, relation_id)
);

CREATE INDEX rm_relation_source_idx
  ON rm_relation (workspace_id, relation_type_code, source_id);

CREATE INDEX rm_relation_target_idx
  ON rm_relation (workspace_id, relation_type_code, target_id);

CREATE TABLE rm_consumed_event (
  consumer_group VARCHAR(64) NOT NULL,
  event_id CHAR(26) NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (consumer_group, event_id)
);
