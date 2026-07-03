-- Attendance Engine — Phase 1: Schema Foundation
--
-- Adds the structural foundation only. NO academic behaviour changes:
--   * INCOMPLETE gating stays inactive.
--   * StudentSubjectProgress.attendancePercentage is NOT written by anything.
--   * Existing attendance flows are untouched.
--
-- Introduces:
--   * attendance_policies                       (interpretation-only config)
--   * student_subject_attendance_summaries      (persisted read-model, unwritten yet)
--   * student_period_attendance_summaries       (persisted read-model, unwritten yet)
--   * level_subjects.attendancePolicyId         (optional per-subject policy override)
--   * attendance_records index on enrollmentId  (Phase-2 backfill prep; STAYS NULLABLE)
--
-- SQL Server specifics:
--   * "One default active policy per org" and the nullable-academicTermId period
--     uniqueness are enforced by FILTERED unique indexes (plain UNIQUE treats
--     multiple NULLs as duplicates and cannot carry a predicate).
--   * All FKs are ON DELETE NO ACTION ON UPDATE NO ACTION (no multiple cascade paths).

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[attendance_policies] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [countExcusedAsPresent] BIT NOT NULL CONSTRAINT [attendance_policies_countExcusedAsPresent_df] DEFAULT 0,
    [countRemoteAsPresent] BIT NOT NULL CONSTRAINT [attendance_policies_countRemoteAsPresent_df] DEFAULT 1,
    [countLateAsPartial] BIT NOT NULL CONSTRAINT [attendance_policies_countLateAsPartial_df] DEFAULT 1,
    [lateAfterMinutes] INT NOT NULL CONSTRAINT [attendance_policies_lateAfterMinutes_df] DEFAULT 10,
    [absenceAfterMinutes] INT NOT NULL CONSTRAINT [attendance_policies_absenceAfterMinutes_df] DEFAULT 30,
    [atRiskBufferPercentage] DECIMAL(5,2) NOT NULL CONSTRAINT [attendance_policies_atRiskBufferPercentage_df] DEFAULT 5,
    [allowJustification] BIT NOT NULL CONSTRAINT [attendance_policies_allowJustification_df] DEFAULT 1,
    [requireJustificationApproval] BIT NOT NULL CONSTRAINT [attendance_policies_requireJustificationApproval_df] DEFAULT 1,
    [justificationWindowDays] INT,
    [autoCloseSessions] BIT NOT NULL CONSTRAINT [attendance_policies_autoCloseSessions_df] DEFAULT 0,
    [isDefault] BIT NOT NULL CONSTRAINT [attendance_policies_isDefault_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [attendance_policies_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [attendance_policies_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [attendance_policies_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[student_subject_attendance_summaries] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [levelSubjectId] NVARCHAR(1000) NOT NULL,
    [attendancePolicyId] NVARCHAR(1000),
    [totalSessions] INT NOT NULL CONSTRAINT [student_subject_attendance_summaries_totalSessions_df] DEFAULT 0,
    [totalScheduledMinutes] INT NOT NULL CONSTRAINT [student_subject_attendance_summaries_totalScheduledMinutes_df] DEFAULT 0,
    [totalPresentMinutes] INT NOT NULL CONSTRAINT [student_subject_attendance_summaries_totalPresentMinutes_df] DEFAULT 0,
    [totalAbsentMinutes] INT NOT NULL CONSTRAINT [student_subject_attendance_summaries_totalAbsentMinutes_df] DEFAULT 0,
    [totalLateMinutes] INT NOT NULL CONSTRAINT [student_subject_attendance_summaries_totalLateMinutes_df] DEFAULT 0,
    [totalExcusedMinutes] INT NOT NULL CONSTRAINT [student_subject_attendance_summaries_totalExcusedMinutes_df] DEFAULT 0,
    [attendancePercentage] DECIMAL(5,2),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_subject_attendance_summaries_status_df] DEFAULT 'NOT_STARTED',
    [calculatedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_subject_attendance_summaries_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [student_subject_attendance_summaries_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [student_subject_attendance_summaries_enrollmentId_levelSubjectId_key] UNIQUE NONCLUSTERED ([enrollmentId],[levelSubjectId])
);

-- CreateTable
CREATE TABLE [dbo].[student_period_attendance_summaries] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [academicYearId] NVARCHAR(1000) NOT NULL,
    [academicTermId] NVARCHAR(1000),
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000) NOT NULL,
    [courseLevelId] NVARCHAR(1000),
    [classGroupId] NVARCHAR(1000),
    [totalSessions] INT NOT NULL CONSTRAINT [student_period_attendance_summaries_totalSessions_df] DEFAULT 0,
    [presentCount] INT NOT NULL CONSTRAINT [student_period_attendance_summaries_presentCount_df] DEFAULT 0,
    [absentCount] INT NOT NULL CONSTRAINT [student_period_attendance_summaries_absentCount_df] DEFAULT 0,
    [lateCount] INT NOT NULL CONSTRAINT [student_period_attendance_summaries_lateCount_df] DEFAULT 0,
    [excusedCount] INT NOT NULL CONSTRAINT [student_period_attendance_summaries_excusedCount_df] DEFAULT 0,
    [remoteCount] INT NOT NULL CONSTRAINT [student_period_attendance_summaries_remoteCount_df] DEFAULT 0,
    [totalScheduledMinutes] INT NOT NULL CONSTRAINT [student_period_attendance_summaries_totalScheduledMinutes_df] DEFAULT 0,
    [totalPresentMinutes] INT NOT NULL CONSTRAINT [student_period_attendance_summaries_totalPresentMinutes_df] DEFAULT 0,
    [attendancePercentage] DECIMAL(5,2),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_period_attendance_summaries_status_df] DEFAULT 'GOOD',
    [calculatedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_period_attendance_summaries_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [student_period_attendance_summaries_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AlterTable: additive nullable column only; existing rows keep NULL.
ALTER TABLE [dbo].[level_subjects] ADD [attendancePolicyId] NVARCHAR(1000);

-- CreateIndex
CREATE NONCLUSTERED INDEX [attendance_policies_organizationId_status_idx] ON [dbo].[attendance_policies]([organizationId], [status]);

-- CreateIndex
-- Filtered unique: at most ONE default, active (non-deleted) policy per organization.
CREATE UNIQUE NONCLUSTERED INDEX [attendance_policies_org_default_key] ON [dbo].[attendance_policies]([organizationId]) WHERE [isDefault] = 1 AND [deletedAt] IS NULL;

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_subject_attendance_summaries_organizationId_studentId_idx] ON [dbo].[student_subject_attendance_summaries]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_subject_attendance_summaries_organizationId_levelSubjectId_idx] ON [dbo].[student_subject_attendance_summaries]([organizationId], [levelSubjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_subject_attendance_summaries_organizationId_status_idx] ON [dbo].[student_subject_attendance_summaries]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_subject_attendance_summaries_organizationId_calculatedAt_idx] ON [dbo].[student_subject_attendance_summaries]([organizationId], [calculatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_period_attendance_summaries_organizationId_studentId_idx] ON [dbo].[student_period_attendance_summaries]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_period_attendance_summaries_organizationId_academicYearId_idx] ON [dbo].[student_period_attendance_summaries]([organizationId], [academicYearId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_period_attendance_summaries_organizationId_academicTermId_idx] ON [dbo].[student_period_attendance_summaries]([organizationId], [academicTermId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_period_attendance_summaries_organizationId_classGroupId_idx] ON [dbo].[student_period_attendance_summaries]([organizationId], [classGroupId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_period_attendance_summaries_organizationId_status_idx] ON [dbo].[student_period_attendance_summaries]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_period_attendance_summaries_organizationId_calculatedAt_idx] ON [dbo].[student_period_attendance_summaries]([organizationId], [calculatedAt]);

-- CreateIndex
-- Nullable-term uniqueness split into two filtered unique indexes: one for rows
-- WITH a term, one for the year-only (NULL term) row. A plain UNIQUE would reject
-- multiple NULL-term rows for the same enrolment/year.
CREATE UNIQUE NONCLUSTERED INDEX [student_period_attendance_summaries_term_key] ON [dbo].[student_period_attendance_summaries]([enrollmentId], [academicYearId], [academicTermId]) WHERE [academicTermId] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [student_period_attendance_summaries_noterm_key] ON [dbo].[student_period_attendance_summaries]([enrollmentId], [academicYearId]) WHERE [academicTermId] IS NULL;

-- CreateIndex
CREATE NONCLUSTERED INDEX [level_subjects_organizationId_attendancePolicyId_idx] ON [dbo].[level_subjects]([organizationId], [attendancePolicyId]);

-- CreateIndex
-- Phase-2 backfill prep. enrollmentId STAYS NULLABLE in Phase 1.
CREATE NONCLUSTERED INDEX [attendance_records_organizationId_enrollmentId_idx] ON [dbo].[attendance_records]([organizationId], [enrollmentId]);

-- AddForeignKey
ALTER TABLE [dbo].[attendance_policies] ADD CONSTRAINT [attendance_policies_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[level_subjects] ADD CONSTRAINT [level_subjects_attendancePolicyId_fkey] FOREIGN KEY ([attendancePolicyId]) REFERENCES [dbo].[attendance_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_subject_attendance_summaries] ADD CONSTRAINT [student_subject_attendance_summaries_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_subject_attendance_summaries] ADD CONSTRAINT [student_subject_attendance_summaries_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_subject_attendance_summaries] ADD CONSTRAINT [student_subject_attendance_summaries_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_subject_attendance_summaries] ADD CONSTRAINT [student_subject_attendance_summaries_levelSubjectId_fkey] FOREIGN KEY ([levelSubjectId]) REFERENCES [dbo].[level_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_subject_attendance_summaries] ADD CONSTRAINT [student_subject_attendance_summaries_attendancePolicyId_fkey] FOREIGN KEY ([attendancePolicyId]) REFERENCES [dbo].[attendance_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_period_attendance_summaries] ADD CONSTRAINT [student_period_attendance_summaries_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_period_attendance_summaries] ADD CONSTRAINT [student_period_attendance_summaries_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[academic_years]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_period_attendance_summaries] ADD CONSTRAINT [student_period_attendance_summaries_academicTermId_fkey] FOREIGN KEY ([academicTermId]) REFERENCES [dbo].[academic_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_period_attendance_summaries] ADD CONSTRAINT [student_period_attendance_summaries_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_period_attendance_summaries] ADD CONSTRAINT [student_period_attendance_summaries_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_period_attendance_summaries] ADD CONSTRAINT [student_period_attendance_summaries_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_period_attendance_summaries] ADD CONSTRAINT [student_period_attendance_summaries_courseLevelId_fkey] FOREIGN KEY ([courseLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_period_attendance_summaries] ADD CONSTRAINT [student_period_attendance_summaries_classGroupId_fkey] FOREIGN KEY ([classGroupId]) REFERENCES [dbo].[class_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
