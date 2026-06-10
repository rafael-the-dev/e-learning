BEGIN TRY

BEGIN TRAN;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [dbo].[subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
