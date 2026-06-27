BEGIN TRY

BEGIN TRAN;

-- AlterTable
-- Split into its own migration step: SQL Server compiles a whole script as one batch,
-- so a later statement in the SAME batch cannot reference a column added earlier in that
-- batch ("Invalid column name"). The dependent unique index/FK on [userId] live in the
-- next migration step instead. Mirrors the Teacher.userId migration.
ALTER TABLE [dbo].[students] ADD [userId] NVARCHAR(1000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
