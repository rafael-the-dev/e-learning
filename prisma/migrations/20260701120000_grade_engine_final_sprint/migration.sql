-- Grade Engine Final Sprint
-- Extends grade_change_logs so every grade mutation is fully traceable:
--   * oldNormalizedGrade / newNormalizedGrade — capture the normalized (0-100) values
--   * source — origin of the mutation (CREATE | UPDATE | CANCEL | INVALIDATE | RECOVERY | BULK)
-- Additive, nullable columns only. No data backfill required.

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[grade_change_logs] ADD [oldNormalizedGrade] DECIMAL(5,2);
ALTER TABLE [dbo].[grade_change_logs] ADD [newNormalizedGrade] DECIMAL(5,2);
ALTER TABLE [dbo].[grade_change_logs] ADD [source] NVARCHAR(1000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
