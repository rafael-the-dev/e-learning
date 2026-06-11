-- CreateTable: grade_change_logs
-- Immutable history of every post-submission grade edit.

BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[grade_change_logs] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentAssessmentResultId] NVARCHAR(1000) NOT NULL,
    [assessmentEventId] NVARCHAR(1000),
    [oldGrade] DECIMAL(5,2),
    [newGrade] DECIMAL(5,2) NOT NULL,
    [oldStatus] NVARCHAR(1000),
    [newStatus] NVARCHAR(1000) NOT NULL,
    [reason] NVARCHAR(MAX) NOT NULL,
    [changedBy] NVARCHAR(1000) NOT NULL,
    [changedAt] DATETIME2 NOT NULL CONSTRAINT [grade_change_logs_changedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [grade_change_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[grade_change_logs] ADD CONSTRAINT [grade_change_logs_organizationId_fkey]
    FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[grade_change_logs] ADD CONSTRAINT [grade_change_logs_studentAssessmentResultId_fkey]
    FOREIGN KEY ([studentAssessmentResultId]) REFERENCES [dbo].[student_assessment_results]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateIndex
CREATE NONCLUSTERED INDEX [grade_change_logs_organizationId_studentAssessmentResultId_idx]
    ON [dbo].[grade_change_logs]([organizationId], [studentAssessmentResultId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [grade_change_logs_organizationId_changedAt_idx]
    ON [dbo].[grade_change_logs]([organizationId], [changedAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
