ALTER TABLE ai_change_set
  ADD COLUMN confirmed_by VARCHAR(64) NULL,
  ADD COLUMN confirmed_at TIMESTAMPTZ NULL;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'ai_change_item'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%item_status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_change_item DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE ai_change_item
  ADD CHECK (item_status IN ('PROPOSED', 'REJECTED', 'APPLIED', 'SKIPPED'));
