-- 对象变更历史读模型:按对象聚合的内核事件时间线,支撑属性栏「历史」与「版本·护照·来源链」。
-- 由 ReadModelProjection 从统一事件信封投影;关系事件在两端对象各落一行。
CREATE TABLE rm_object_history (
  workspace_id   uuid        NOT NULL,
  object_id      uuid        NOT NULL,
  seq            bigint      NOT NULL,      -- 信封 sequence,同聚合单调递增,排序用
  event_id       text        NOT NULL,
  kind           varchar(32) NOT NULL,      -- create|edit|state|archive|delete|link|unlink
  field_code     text,
  before_val     jsonb,
  after_val      jsonb,
  actor_kind     varchar(32) NOT NULL,      -- user|rule|ai|artifact_sync|simulation|system
  actor_id       text,
  actor_display  text,
  source         varchar(32) NOT NULL,      -- manual|rule|AI|artifact_sync|simulation|system
  object_version bigint      NOT NULL,
  correlation_id uuid,
  occurred_at    timestamptz NOT NULL,
  -- 关系事件在两端各写一行(同 event_id、不同 object_id),故主键含 object_id;重复投递幂等
  PRIMARY KEY (workspace_id, object_id, event_id)
);

CREATE INDEX ix_rm_object_history_obj
  ON rm_object_history (workspace_id, object_id, seq DESC, occurred_at DESC);
