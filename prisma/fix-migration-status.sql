UPDATE [dbo].[_prisma_migrations]
SET [applied_steps_count] = 1,
    [finished_at]         = GETDATE(),
    [logs]                = NULL,
    [rolled_back_at]      = NULL
WHERE [migration_name] = '20260619000000_finance_schema_sync';
