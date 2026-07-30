CREATE TABLE template_catalog_directory (
  template_version_id UUID NOT NULL REFERENCES scene_template_version(id) ON DELETE CASCADE,
  code VARCHAR(128) NOT NULL,
  name VARCHAR(256) NOT NULL,
  parent_code VARCHAR(128),
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (template_version_id, code),
  FOREIGN KEY (template_version_id, parent_code)
    REFERENCES template_catalog_directory(template_version_id, code)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE template_catalog_library (
  template_version_id UUID NOT NULL REFERENCES scene_template_version(id) ON DELETE CASCADE,
  object_type_code VARCHAR(128) NOT NULL,
  directory_code VARCHAR(128) NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (template_version_id, object_type_code),
  FOREIGN KEY (template_version_id, directory_code)
    REFERENCES template_catalog_directory(template_version_id, code)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE workspace_catalog_directory (
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  code VARCHAR(128) NOT NULL,
  name VARCHAR(256) NOT NULL,
  parent_code VARCHAR(128),
  sort_order INTEGER NOT NULL,
  source_template_version_id UUID REFERENCES scene_template_version(id),
  installed_by VARCHAR(128) NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, code)
);

CREATE TABLE workspace_catalog_library (
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  object_type_code VARCHAR(128) NOT NULL,
  directory_code VARCHAR(128) NOT NULL,
  sort_order INTEGER NOT NULL,
  source_template_version_id UUID REFERENCES scene_template_version(id),
  installed_by VARCHAR(128) NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, object_type_code),
  FOREIGN KEY (workspace_id, directory_code)
    REFERENCES workspace_catalog_directory(workspace_id, code)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX workspace_catalog_directory_parent_idx
  ON workspace_catalog_directory (workspace_id, parent_code, sort_order, code);
CREATE INDEX workspace_catalog_library_order_idx
  ON workspace_catalog_library (workspace_id, sort_order, object_type_code);
