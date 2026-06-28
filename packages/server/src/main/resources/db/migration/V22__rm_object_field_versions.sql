-- 恢复迁移:rm_object 增 field_versions 列(per-field 版本守卫)。
-- ReadModelRepository.updateField 依赖该列,按"该字段自己的版本"去重排序(jsonb_set + COALESCE 守卫)。
-- 该迁移此前在一次 stash 事故中丢失:相关代码已在 main,但建列迁移未提交。本迁移补回。
-- 既有行以默认 '{}' 回填,零破坏。
ALTER TABLE rm_object
  ADD COLUMN field_versions JSONB NOT NULL DEFAULT '{}'::jsonb;
