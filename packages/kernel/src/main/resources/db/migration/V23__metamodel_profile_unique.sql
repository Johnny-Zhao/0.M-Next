DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT workspace_id, template_version_id, code, COUNT(*) AS duplicate_count
      FROM object_type
      GROUP BY workspace_id, template_version_id, code
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'object_type duplicates exist for (workspace_id, template_version_id, code)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT workspace_id, template_version_id, code, COUNT(*) AS duplicate_count
      FROM relation_type
      GROUP BY workspace_id, template_version_id, code
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'relation_type duplicates exist for (workspace_id, template_version_id, code)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT workspace_id, template_version_id, code, COUNT(*) AS duplicate_count
      FROM value_type
      GROUP BY workspace_id, template_version_id, code
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'value_type duplicates exist for (workspace_id, template_version_id, code)';
  END IF;
END $$;

ALTER TABLE object_type
  DROP CONSTRAINT IF EXISTS object_type_workspace_id_code_key;
ALTER TABLE object_type
  ADD CONSTRAINT object_type_ws_tv_code_key
  UNIQUE NULLS NOT DISTINCT (workspace_id, template_version_id, code);

ALTER TABLE relation_type
  DROP CONSTRAINT IF EXISTS relation_type_workspace_id_code_key;
ALTER TABLE relation_type
  ADD CONSTRAINT relation_type_ws_tv_code_key
  UNIQUE NULLS NOT DISTINCT (workspace_id, template_version_id, code);

ALTER TABLE value_type
  DROP CONSTRAINT IF EXISTS value_type_workspace_id_code_key;
ALTER TABLE value_type
  ADD CONSTRAINT value_type_ws_tv_code_key
  UNIQUE NULLS NOT DISTINCT (workspace_id, template_version_id, code);
