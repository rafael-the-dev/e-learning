/*
  Generalizes ImportJob for reuse across future import types.
  Renames are done via sp_rename to preserve existing data, not drop+add.

  - Rename `fileName` -> `uploadedFileName` (same concept, clearer name).
  - Rename `createdBy` -> `uploadedById`, upgraded to a real FK relation to `users`
    so the history page can join + display "Importado por: <nome>".
  - Add `validationSummary` / `executionSummary` (JSON-encoded summaries, NVarChar(Max)
    per this schema's established JSON-as-string convention).
*/
BEGIN TRY

BEGIN TRAN;

-- RenameColumn (preserves data)
EXEC sp_rename 'dbo.import_jobs.fileName', 'uploadedFileName', 'COLUMN';
EXEC sp_rename 'dbo.import_jobs.createdBy', 'uploadedById', 'COLUMN';

-- AlterTable
ALTER TABLE [dbo].[import_jobs] ADD [executionSummary] NVARCHAR(max),
[validationSummary] NVARCHAR(max);

-- AddForeignKey
ALTER TABLE [dbo].[import_jobs] ADD CONSTRAINT [import_jobs_uploadedById_fkey] FOREIGN KEY ([uploadedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
