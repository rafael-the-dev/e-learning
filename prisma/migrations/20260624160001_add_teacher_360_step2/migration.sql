BEGIN TRY

BEGIN TRAN;

-- CreateIndex
-- Filtered unique index, NOT a plain UNIQUE constraint: SQL Server treats all NULLs as
-- duplicates under a plain UNIQUE constraint/index (unlike Postgres/MySQL), so a naive
-- UNIQUE([userId]) would reject the second teacher with no linked user account — and most
-- teachers have none. Confirmed empirically against this DB before writing this migration.
CREATE UNIQUE NONCLUSTERED INDEX [teachers_userId_key] ON [dbo].[teachers]([userId]) WHERE [userId] IS NOT NULL;

-- AddForeignKey
ALTER TABLE [dbo].[teachers] ADD CONSTRAINT [teachers_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
