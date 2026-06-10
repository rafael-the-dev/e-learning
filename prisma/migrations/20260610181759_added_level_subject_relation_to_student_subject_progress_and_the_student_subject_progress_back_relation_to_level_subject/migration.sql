BEGIN TRY

BEGIN TRAN;

-- AddForeignKey
ALTER TABLE [dbo].[student_subject_progress] ADD CONSTRAINT [student_subject_progress_levelSubjectId_fkey] FOREIGN KEY ([levelSubjectId]) REFERENCES [dbo].[level_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
