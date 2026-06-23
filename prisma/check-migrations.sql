SELECT [id], [migration_name], [applied_steps_count], [finished_at], [logs]
FROM [dbo].[_prisma_migrations]
WHERE [migration_name] LIKE '%finance_schema_sync%'
ORDER BY [migration_name];
