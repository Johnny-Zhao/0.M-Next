ALTER TABLE scene_template_version
  DROP CONSTRAINT scene_template_version_status_check;

ALTER TABLE scene_template_version
  ADD CONSTRAINT scene_template_version_status_check
    CHECK (status IN ('draft', 'published', 'withdrawn'));
