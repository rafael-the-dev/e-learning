BEGIN TRY

BEGIN TRAN;

-- AlterTable: Add academic rule columns to level_subjects
ALTER TABLE [dbo].[level_subjects] ADD
    [theoryHours] INT,
    [practicalHours] INT,
    [minimumAttendancePercentage] DECIMAL(5,2),
    [maxAbsences] INT,
    [allowRetakeExam] BIT NOT NULL CONSTRAINT [level_subjects_allowRetakeExam_df] DEFAULT 1,
    [allowCompensation] BIT NOT NULL CONSTRAINT [level_subjects_allowCompensation_df] DEFAULT 0,
    [certificateRequired] BIT NOT NULL CONSTRAINT [level_subjects_certificateRequired_df] DEFAULT 0;

-- Update isRequired default from 0 to 1 for newly inserted rows
-- (existing rows keep their current value)
ALTER TABLE [dbo].[level_subjects] DROP CONSTRAINT [level_subjects_isRequired_df];
ALTER TABLE [dbo].[level_subjects] ADD CONSTRAINT [level_subjects_isRequired_df] DEFAULT 1 FOR [isRequired];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
