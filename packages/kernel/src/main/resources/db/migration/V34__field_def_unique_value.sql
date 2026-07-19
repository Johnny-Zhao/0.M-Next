ALTER TABLE field_def
  ADD COLUMN unique_value BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX data_object_workspace_type_idx
  ON data_object (workspace_id, object_type_id, id);

CREATE INDEX data_field_value_unique_lookup_idx
  ON data_field_value (field_def_id, value, object_id);
