CREATE TABLE ai_change_set (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  action VARCHAR(64) NOT NULL CHECK (action IN ('SUGGEST_FIELDS', 'EXPLAIN_CHECK')),
  status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED'
    CHECK (status IN ('PROPOSED', 'REJECTED', 'CONFIRMED')),
  created_by VARCHAR(64) NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  provider VARCHAR(128) NOT NULL,
  provider_version VARCHAR(64) NOT NULL,
  context_hash CHAR(64) NOT NULL,
  result_text TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ai_change_set_workspace_status_idx
  ON ai_change_set (workspace_id, status);

CREATE TABLE ai_change_item (
  id UUID PRIMARY KEY,
  set_id UUID NOT NULL REFERENCES ai_change_set(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  op_type VARCHAR(64) NOT NULL CHECK (op_type IN ('UpdateFields')),
  payload JSONB NOT NULL,
  precheck JSONB NOT NULL DEFAULT '{}'::jsonb,
  item_status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED'
    CHECK (item_status IN ('PROPOSED', 'REJECTED', 'CONFIRMED')),
  UNIQUE (set_id, seq)
);

CREATE INDEX ai_change_item_set_seq_idx
  ON ai_change_item (set_id, seq);

CREATE TABLE rm_ai_change_set (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  action VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  provider VARCHAR(128) NOT NULL,
  provider_version VARCHAR(64) NOT NULL,
  context_hash CHAR(64) NOT NULL,
  result_text TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX rm_ai_change_set_workspace_status_idx
  ON rm_ai_change_set (workspace_id, status);

CREATE TABLE rm_ai_change_item (
  id UUID PRIMARY KEY,
  set_id UUID NOT NULL REFERENCES rm_ai_change_set(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  op_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  precheck JSONB NOT NULL,
  item_status VARCHAR(32) NOT NULL,
  UNIQUE (set_id, seq)
);

CREATE INDEX rm_ai_change_item_set_seq_idx
  ON rm_ai_change_item (set_id, seq);
