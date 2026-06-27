BEGIN TRY

BEGIN TRAN;

-- CreateIndex
-- Filtered unique index, NOT a plain UNIQUE constraint: SQL Server treats all NULLs as
-- duplicates under a plain UNIQUE constraint/index (unlike Postgres/MySQL), so a naive
-- UNIQUE([userId]) would reject the second student with no linked user account — and most
-- students have none. Mirrors the Teacher.userId migration.
CREATE UNIQUE NONCLUSTERED INDEX [students_userId_key] ON [dbo].[students]([userId]) WHERE [userId] IS NOT NULL;

-- AddForeignKey
ALTER TABLE [dbo].[students] ADD CONSTRAINT [students_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
