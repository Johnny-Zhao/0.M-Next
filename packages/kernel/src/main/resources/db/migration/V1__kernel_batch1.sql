CREATE TABLE workspace (
  id UUID PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE object_type (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  code VARCHAR(128) NOT NULL,
  name VARCHAR(256) NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (workspace_id, code)
);

CREATE TABLE field_def (
  id UUID PRIMARY KEY,
  object_type_id UUID NOT NULL REFERENCES object_type(id),
  code VARCHAR(128) NOT NULL,
  name VARCHAR(256) NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (object_type_id, code)
);

CREATE TABLE data_object (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  object_type_id UUID NOT NULL REFERENCES object_type(id),
  status VARCHAR(32) NOT NULL,
  version BIGINT NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE data_field_value (
  object_id UUID NOT NULL REFERENCES data_object(id),
  field_def_id UUID NOT NULL REFERENCES field_def(id),
  value JSONB,
  version BIGINT NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (object_id, field_def_id)
);

CREATE TABLE field_value_history (
  id BIGSERIAL PRIMARY KEY,
  object_id UUID NOT NULL,
  field_def_id UUID NOT NULL,
  value JSONB,
  version BIGINT NOT NULL,
  changed_by VARCHAR(64) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE command_log (
  workspace_id UUID NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  command_id CHAR(26) NOT NULL,
  command_type VARCHAR(64) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  result_snapshot JSONB NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key)
);

CREATE TABLE event_outbox (
  id CHAR(26) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(32) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  sequence BIGINT NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ
);

CREATE INDEX event_outbox_pending_idx
  ON event_outbox (status, created_at)
  WHERE status = 'PENDING';

INSERT INTO workspace (id, name, status)
VALUES ('11111111-1111-4111-8111-111111111111', 'Demo Workspace', 'ACTIVE');

INSERT INTO object_type (id, workspace_id, code, name, published)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'demo_object',
  'Demo Object',
  TRUE
);

INSERT INTO field_def (id, object_type_id, code, name, required)
VALUES
  (
    '33333333-3333-4333-8333-333333333331',
    '22222222-2222-4222-8222-222222222222',
    'name',
    'Name',
    TRUE
  ),
  (
    '33333333-3333-4333-8333-333333333332',
    '22222222-2222-4222-8222-222222222222',
    'cost',
    'Cost',
    FALSE
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    'owner',
    'Owner',
    FALSE
  );
