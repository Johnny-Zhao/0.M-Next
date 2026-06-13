CREATE TABLE review_round (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  title VARCHAR(256),
  status VARCHAR(16) NOT NULL CHECK (status IN ('draft', 'in_review', 'closed')),
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE annotation (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  round_id UUID NULL REFERENCES review_round(id),
  target_type VARCHAR(16) NOT NULL CHECK (target_type IN ('object', 'field', 'relation')),
  target_id UUID NOT NULL,
  field_code VARCHAR(128) NULL,
  anchored_data_version BIGINT NOT NULL CHECK (anchored_data_version >= 1),
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('info', 'suggest', 'issue', 'block')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  status VARCHAR(16) NOT NULL CHECK (status IN ('open', 'resolved', 'wontfix')),
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  resolved_by VARCHAR(64) NULL,
  resolved_at TIMESTAMPTZ NULL,
  CHECK (
    (target_type = 'field' AND field_code IS NOT NULL)
    OR (target_type IN ('object', 'relation') AND field_code IS NULL)
  )
);

CREATE INDEX annotation_target_idx
  ON annotation (workspace_id, target_type, target_id, field_code);
