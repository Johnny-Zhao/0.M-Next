ALTER TABLE workspace_catalog_directory
  ADD CONSTRAINT workspace_catalog_directory_parent_fk
  FOREIGN KEY (workspace_id, parent_code)
  REFERENCES workspace_catalog_directory(workspace_id, code)
  DEFERRABLE INITIALLY DEFERRED;
