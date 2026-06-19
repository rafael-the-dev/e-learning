BEGIN TRY

BEGIN TRAN;

-- Covers wallet transaction aggregation and lastTx CTE (PARTITION BY studentWalletId ORDER BY createdAt)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'swt_wallet_createdat_idx' AND object_id = OBJECT_ID('student_wallet_transactions'))
  CREATE NONCLUSTERED INDEX [swt_wallet_createdat_idx] ON [dbo].[student_wallet_transactions]([studentWalletId], [createdAt]);

-- Covers org-scoped transaction queries with type and date filters
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'swt_org_type_createdat_idx' AND object_id = OBJECT_ID('student_wallet_transactions'))
  CREATE NONCLUSTERED INDEX [swt_org_type_createdat_idx] ON [dbo].[student_wallet_transactions]([organizationId], [type], [createdAt]);

-- Covers branch filter on students within an org
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'students_org_branch_idx' AND object_id = OBJECT_ID('students'))
  CREATE NONCLUSTERED INDEX [students_org_branch_idx] ON [dbo].[students]([organizationId], [branchId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
