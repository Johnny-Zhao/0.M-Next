ALTER TABLE field_def
  ADD COLUMN redefines_field_def_id UUID NULL REFERENCES field_def(id);

CREATE INDEX field_def_redefines_idx
  ON field_def (redefines_field_def_id)
  WHERE redefines_field_def_id IS NOT NULL;
