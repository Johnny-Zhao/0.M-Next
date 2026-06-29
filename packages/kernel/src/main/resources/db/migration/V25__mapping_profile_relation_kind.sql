ALTER TABLE scene_template
  ADD COLUMN profile_kind VARCHAR(24) NOT NULL DEFAULT 'domain',
  ADD COLUMN source_profile_code VARCHAR(128),
  ADD COLUMN target_profile_code VARCHAR(128);

ALTER TABLE scene_template
  ADD CONSTRAINT scene_template_profile_kind_chk
  CHECK (profile_kind IN ('domain', 'mapping'));

ALTER TABLE relation_type
  ADD COLUMN kind VARCHAR(24) NOT NULL DEFAULT 'domain';

ALTER TABLE relation_type
  ADD CONSTRAINT relation_type_kind_chk
  CHECK (kind IN ('domain', 'correspondence'));
