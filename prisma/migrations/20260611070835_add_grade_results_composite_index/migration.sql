BEGIN TRY

BEGIN TRAN;

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_assessment_results_organizationId_enrollmentId_subjectId_idx] ON [dbo].[student_assessment_results]([organizationId], [enrollmentId], [subjectId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
