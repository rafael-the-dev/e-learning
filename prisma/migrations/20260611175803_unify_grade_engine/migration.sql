/*
  Warnings:

  - You are about to drop the `subject_assessment_components` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `subject_assessment_policies` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `levelSubjectId` to the `student_assessment_results` table without a default value. This is not possible if the table is not empty.

*/
BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[student_assessment_results] DROP CONSTRAINT [student_assessment_results_assessmentComponentId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[subject_assessment_components] DROP CONSTRAINT [subject_assessment_components_assessmentPolicyId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[subject_assessment_components] DROP CONSTRAINT [subject_assessment_components_organizationId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[subject_assessment_policies] DROP CONSTRAINT [subject_assessment_policies_organizationId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[subject_assessment_policies] DROP CONSTRAINT [subject_assessment_policies_subjectId_fkey];

-- DropIndex
DROP INDEX [student_assessment_results_organizationId_enrollmentId_subjectId_idx] ON [dbo].[student_assessment_results];

-- AlterTable
ALTER TABLE [dbo].[assessment_components] ADD [maxGrade] DECIMAL(5,2) NOT NULL CONSTRAINT [assessment_components_maxGrade_df] DEFAULT 20;

-- AlterTable
ALTER TABLE [dbo].[assessment_policies] ADD [allowRecovery] BIT NOT NULL CONSTRAINT [assessment_policies_allowRecovery_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[student_assessment_results] ADD [assessmentEventId] NVARCHAR(1000),
[levelSubjectId] NVARCHAR(1000) NOT NULL,
[sourceType] NVARCHAR(1000) NOT NULL CONSTRAINT [student_assessment_results_sourceType_df] DEFAULT 'CONTINUOUS';

-- DropTable
DROP TABLE [dbo].[subject_assessment_components];

-- DropTable
DROP TABLE [dbo].[subject_assessment_policies];

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_assessment_results_organizationId_levelSubjectId_idx] ON [dbo].[student_assessment_results]([organizationId], [levelSubjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_assessment_results_organizationId_enrollmentId_levelSubjectId_idx] ON [dbo].[student_assessment_results]([organizationId], [enrollmentId], [levelSubjectId]);

-- AddForeignKey
ALTER TABLE [dbo].[student_assessment_results] ADD CONSTRAINT [student_assessment_results_levelSubjectId_fkey] FOREIGN KEY ([levelSubjectId]) REFERENCES [dbo].[level_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_assessment_results] ADD CONSTRAINT [student_assessment_results_assessmentComponentId_fkey] FOREIGN KEY ([assessmentComponentId]) REFERENCES [dbo].[assessment_components]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_assessment_results] ADD CONSTRAINT [student_assessment_results_assessmentEventId_fkey] FOREIGN KEY ([assessmentEventId]) REFERENCES [dbo].[assessments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
