DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'ai_change_set'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%action%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_change_set DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE ai_change_set
  ADD CHECK (action IN ('SUGGEST_FIELDS', 'EXPLAIN_CHECK', 'EXTRACT_MODULES'));

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'ai_change_item'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%op_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_change_item DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE ai_change_item
  ADD CHECK (op_type IN ('UpdateFields', 'CreateObject'));
