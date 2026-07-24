CREATE TABLE workspace_expression_config (
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  expression_id VARCHAR(128) NOT NULL,
  name VARCHAR(256) NOT NULL,
  space VARCHAR(32) NOT NULL,
  default_view_id VARCHAR(128) NOT NULL,
  default_form VARCHAR(16) NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (expression_id),
  UNIQUE (workspace_id, expression_id),
  CHECK (btrim(name) <> ''),
  CHECK (space IN ('main', 'workshop')),
  CHECK (default_form IN ('grid', 'canvas', 'doc', 'matrix', 'bi', 'ana'))
);

CREATE UNIQUE INDEX workspace_expression_config_name_idx
  ON workspace_expression_config (workspace_id, lower(btrim(name)));

CREATE TABLE workspace_view_config (
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  view_id VARCHAR(128) NOT NULL,
  expression_id VARCHAR(128) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  config JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (view_id),
  UNIQUE (workspace_id, view_id),
  CHECK (kind IN ('grid', 'canvas', 'doc', 'matrix', 'bi', 'ana')),
  CHECK (jsonb_typeof(config) = 'object'),
  FOREIGN KEY (workspace_id, expression_id)
    REFERENCES workspace_expression_config(workspace_id, expression_id)
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE workspace_expression_config
  ADD CONSTRAINT workspace_expression_default_view_fk
  FOREIGN KEY (workspace_id, default_view_id)
  REFERENCES workspace_view_config(workspace_id, view_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX workspace_view_config_expression_idx
  ON workspace_view_config (workspace_id, expression_id);
