CREATE TABLE workspace_profile (
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  template_version_id UUID NOT NULL REFERENCES scene_template_version(id),
  applied_by VARCHAR(128) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, template_version_id)
);

CREATE INDEX workspace_profile_version_idx
  ON workspace_profile (template_version_id, workspace_id);
