-- Remove the old misnamed record (was applied manually, now superseded)
DELETE FROM [dbo].[_prisma_migrations]
WHERE [migration_name] = '20260616093339_finance_schema_sync';

-- Mark the correctly-named record as applied (it may exist from a prior partial run)
UPDATE [dbo].[_prisma_migrations]
SET [applied_steps_count] = 1,
    [finished_at]         = GETDATE(),
    [logs]                = NULL
WHERE [migration_name] = '20260619000000_finance_schema_sync';
