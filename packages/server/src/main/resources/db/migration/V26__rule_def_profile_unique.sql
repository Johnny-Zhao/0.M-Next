DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM rule_def
    GROUP BY workspace_id, template_version_id, rule_code
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'rule_def duplicates exist for (workspace_id, template_version_id, rule_code)';
  END IF;
END $$;

ALTER TABLE rule_def
  DROP CONSTRAINT rule_def_workspace_id_rule_code_key;

ALTER TABLE rule_def
  ADD CONSTRAINT rule_def_ws_tv_rule_code_key
  UNIQUE NULLS NOT DISTINCT (workspace_id, template_version_id, rule_code);
