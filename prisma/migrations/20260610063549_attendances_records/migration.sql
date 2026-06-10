/*
  Warnings:

  - You are about to drop the column `classGroupId` on the `attendance_records` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `attendance_records` table. All the data in the column will be lost.
  - You are about to drop the column `justification` on the `attendance_records` table. All the data in the column will be lost.
  - You are about to drop the column `markedBy` on the `attendance_records` table. All the data in the column will be lost.
  - You are about to drop the column `subjectId` on the `attendance_records` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[attendanceSessionId,studentId]` on the table `attendance_records` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `attendanceSessionId` to the `attendance_records` table without a default value. This is not possible if the table is not empty.

*/
BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[attendance_records] DROP CONSTRAINT [attendance_records_classGroupId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[attendance_records] DROP CONSTRAINT [attendance_records_subjectId_fkey];

-- DropIndex
ALTER TABLE [dbo].[attendance_records] DROP CONSTRAINT [attendance_records_classGroupId_studentId_date_subjectId_key];

-- AlterTable
ALTER TABLE [dbo].[attendance_records] DROP COLUMN [classGroupId],
[date],
[justification],
[markedBy],
[subjectId];
ALTER TABLE [dbo].[attendance_records] ADD [attendanceSessionId] NVARCHAR(1000) NOT NULL,
[checkInAt] DATETIME2,
[checkOutAt] DATETIME2,
[deletedAt] DATETIME2,
[enrollmentId] NVARCHAR(1000),
[lateMinutes] INT,
[markedAt] DATETIME2,
[markedByUserId] NVARCHAR(1000),
[minutesAttended] INT NOT NULL CONSTRAINT [attendance_records_minutesAttended_df] DEFAULT 0,
[notes] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[attendance_sessions] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [academicYearId] NVARCHAR(1000) NOT NULL,
    [academicTermId] NVARCHAR(1000),
    [classGroupId] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000) NOT NULL,
    [courseLevelId] NVARCHAR(1000) NOT NULL,
    [subjectId] NVARCHAR(1000) NOT NULL,
    [levelSubjectId] NVARCHAR(1000) NOT NULL,
    [teacherId] NVARCHAR(1000),
    [classroomId] NVARCHAR(1000),
    [scheduleSlotId] NVARCHAR(1000),
    [sessionDate] DATETIME2 NOT NULL,
    [startTime] NVARCHAR(1000) NOT NULL,
    [endTime] NVARCHAR(1000) NOT NULL,
    [durationMinutes] INT NOT NULL,
    [title] NVARCHAR(1000),
    [notes] NVARCHAR(max),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [attendance_sessions_status_df] DEFAULT 'DRAFT',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [attendance_sessions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [attendance_sessions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[attendance_justifications] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [attendanceRecordId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [reason] NVARCHAR(max) NOT NULL,
    [attachmentUrl] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [attendance_justifications_status_df] DEFAULT 'PENDING',
    [reviewedByUserId] NVARCHAR(1000),
    [reviewedAt] DATETIME2,
    [reviewNotes] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [attendance_justifications_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [attendance_justifications_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[assessment_policies] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [levelSubjectId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [calculationMethod] NVARCHAR(1000) NOT NULL CONSTRAINT [assessment_policies_calculationMethod_df] DEFAULT 'WEIGHTED_AVERAGE',
    [roundingMethod] NVARCHAR(1000) NOT NULL CONSTRAINT [assessment_policies_roundingMethod_df] DEFAULT 'NONE',
    [minimumPassingGrade] DECIMAL(5,2) NOT NULL,
    [allowRetake] BIT NOT NULL CONSTRAINT [assessment_policies_allowRetake_df] DEFAULT 1,
    [maxRetakes] INT NOT NULL CONSTRAINT [assessment_policies_maxRetakes_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [assessment_policies_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [assessment_policies_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [assessment_policies_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[assessment_components] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [assessmentPolicyId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [componentType] NVARCHAR(1000) NOT NULL CONSTRAINT [assessment_components_componentType_df] DEFAULT 'TEST',
    [weight] DECIMAL(5,2) NOT NULL,
    [order] INT NOT NULL CONSTRAINT [assessment_components_order_df] DEFAULT 0,
    [isRequired] BIT NOT NULL CONSTRAINT [assessment_components_isRequired_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [assessment_components_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [assessment_components_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [assessment_components_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[assessment_periods] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [academicYearId] NVARCHAR(1000) NOT NULL,
    [academicTermId] NVARCHAR(1000),
    [name] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2 NOT NULL,
    [order] INT NOT NULL CONSTRAINT [assessment_periods_order_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [assessment_periods_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [assessment_periods_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [assessment_periods_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [assessment_periods_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[assessments] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [assessmentPolicyId] NVARCHAR(1000) NOT NULL,
    [assessmentComponentId] NVARCHAR(1000) NOT NULL,
    [assessmentPeriodId] NVARCHAR(1000) NOT NULL,
    [academicYearId] NVARCHAR(1000) NOT NULL,
    [academicTermId] NVARCHAR(1000),
    [classGroupId] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000) NOT NULL,
    [courseLevelId] NVARCHAR(1000) NOT NULL,
    [levelSubjectId] NVARCHAR(1000) NOT NULL,
    [subjectId] NVARCHAR(1000) NOT NULL,
    [teacherId] NVARCHAR(1000),
    [title] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [assessmentDate] DATETIME2 NOT NULL,
    [maxScore] DECIMAL(5,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [assessments_status_df] DEFAULT 'DRAFT',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [assessments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [assessments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[assessment_results] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [assessmentId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000),
    [score] DECIMAL(5,2),
    [normalizedScore] DECIMAL(5,2),
    [feedback] NVARCHAR(max),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [assessment_results_status_df] DEFAULT 'PENDING',
    [gradedByUserId] NVARCHAR(1000),
    [gradedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [assessment_results_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [assessment_results_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [assessment_results_assessmentId_studentId_key] UNIQUE NONCLUSTERED ([assessmentId],[studentId])
);

-- CreateTable
CREATE TABLE [dbo].[assessment_publications] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [assessmentId] NVARCHAR(1000) NOT NULL,
    [publicationStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [assessment_publications_publicationStatus_df] DEFAULT 'DRAFT',
    [publishedAt] DATETIME2,
    [publishedByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [assessment_publications_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [assessment_publications_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [assessment_publications_assessmentId_key] UNIQUE NONCLUSTERED ([assessmentId])
);

-- CreateTable
CREATE TABLE [dbo].[student_subject_progress] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [levelSubjectId] NVARCHAR(1000) NOT NULL,
    [finalGrade] DECIMAL(5,2),
    [attendancePercentage] DECIMAL(5,2),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_subject_progress_status_df] DEFAULT 'NOT_STARTED',
    [progressReason] NVARCHAR(max),
    [completedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_subject_progress_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [student_subject_progress_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [student_subject_progress_enrollmentId_levelSubjectId_key] UNIQUE NONCLUSTERED ([enrollmentId],[levelSubjectId])
);

-- CreateTable
CREATE TABLE [dbo].[assessment_retakes] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [originalAssessmentResultId] NVARCHAR(1000) NOT NULL,
    [assessmentId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000),
    [attemptNumber] INT NOT NULL CONSTRAINT [assessment_retakes_attemptNumber_df] DEFAULT 1,
    [score] DECIMAL(5,2),
    [normalizedScore] DECIMAL(5,2),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [assessment_retakes_status_df] DEFAULT 'REQUESTED',
    [requestedAt] DATETIME2 NOT NULL CONSTRAINT [assessment_retakes_requestedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [approvedAt] DATETIME2,
    [approvedByUserId] NVARCHAR(1000),
    [gradedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [assessment_retakes_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [assessment_retakes_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [attendance_sessions_organizationId_classGroupId_sessionDate_idx] ON [dbo].[attendance_sessions]([organizationId], [classGroupId], [sessionDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [attendance_sessions_organizationId_status_idx] ON [dbo].[attendance_sessions]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [attendance_justifications_organizationId_studentId_idx] ON [dbo].[attendance_justifications]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [attendance_justifications_organizationId_status_idx] ON [dbo].[attendance_justifications]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessment_policies_organizationId_levelSubjectId_status_idx] ON [dbo].[assessment_policies]([organizationId], [levelSubjectId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessment_components_organizationId_assessmentPolicyId_status_idx] ON [dbo].[assessment_components]([organizationId], [assessmentPolicyId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessment_periods_organizationId_academicYearId_status_idx] ON [dbo].[assessment_periods]([organizationId], [academicYearId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessments_organizationId_classGroupId_status_idx] ON [dbo].[assessments]([organizationId], [classGroupId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessments_organizationId_assessmentPeriodId_idx] ON [dbo].[assessments]([organizationId], [assessmentPeriodId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessments_organizationId_levelSubjectId_idx] ON [dbo].[assessments]([organizationId], [levelSubjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessment_results_organizationId_studentId_idx] ON [dbo].[assessment_results]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessment_results_organizationId_assessmentId_status_idx] ON [dbo].[assessment_results]([organizationId], [assessmentId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessment_publications_organizationId_publicationStatus_idx] ON [dbo].[assessment_publications]([organizationId], [publicationStatus]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_subject_progress_organizationId_studentId_idx] ON [dbo].[student_subject_progress]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_subject_progress_organizationId_levelSubjectId_idx] ON [dbo].[student_subject_progress]([organizationId], [levelSubjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessment_retakes_organizationId_studentId_idx] ON [dbo].[assessment_retakes]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [assessment_retakes_organizationId_assessmentId_idx] ON [dbo].[assessment_retakes]([organizationId], [assessmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [attendance_records_organizationId_studentId_idx] ON [dbo].[attendance_records]([organizationId], [studentId]);

-- CreateIndex
ALTER TABLE [dbo].[attendance_records] ADD CONSTRAINT [attendance_records_attendanceSessionId_studentId_key] UNIQUE NONCLUSTERED ([attendanceSessionId], [studentId]);

-- AddForeignKey
ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[academic_years]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_academicTermId_fkey] FOREIGN KEY ([academicTermId]) REFERENCES [dbo].[academic_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_classGroupId_fkey] FOREIGN KEY ([classGroupId]) REFERENCES [dbo].[class_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_teacherId_fkey] FOREIGN KEY ([teacherId]) REFERENCES [dbo].[teachers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_classroomId_fkey] FOREIGN KEY ([classroomId]) REFERENCES [dbo].[classrooms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_scheduleSlotId_fkey] FOREIGN KEY ([scheduleSlotId]) REFERENCES [dbo].[schedule_slots]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_records] ADD CONSTRAINT [attendance_records_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_records] ADD CONSTRAINT [attendance_records_attendanceSessionId_fkey] FOREIGN KEY ([attendanceSessionId]) REFERENCES [dbo].[attendance_sessions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_justifications] ADD CONSTRAINT [attendance_justifications_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_justifications] ADD CONSTRAINT [attendance_justifications_attendanceRecordId_fkey] FOREIGN KEY ([attendanceRecordId]) REFERENCES [dbo].[attendance_records]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_justifications] ADD CONSTRAINT [attendance_justifications_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_policies] ADD CONSTRAINT [assessment_policies_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_policies] ADD CONSTRAINT [assessment_policies_levelSubjectId_fkey] FOREIGN KEY ([levelSubjectId]) REFERENCES [dbo].[level_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_components] ADD CONSTRAINT [assessment_components_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_components] ADD CONSTRAINT [assessment_components_assessmentPolicyId_fkey] FOREIGN KEY ([assessmentPolicyId]) REFERENCES [dbo].[assessment_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_periods] ADD CONSTRAINT [assessment_periods_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_periods] ADD CONSTRAINT [assessment_periods_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[academic_years]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_periods] ADD CONSTRAINT [assessment_periods_academicTermId_fkey] FOREIGN KEY ([academicTermId]) REFERENCES [dbo].[academic_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessments] ADD CONSTRAINT [assessments_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessments] ADD CONSTRAINT [assessments_assessmentPolicyId_fkey] FOREIGN KEY ([assessmentPolicyId]) REFERENCES [dbo].[assessment_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessments] ADD CONSTRAINT [assessments_assessmentComponentId_fkey] FOREIGN KEY ([assessmentComponentId]) REFERENCES [dbo].[assessment_components]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessments] ADD CONSTRAINT [assessments_assessmentPeriodId_fkey] FOREIGN KEY ([assessmentPeriodId]) REFERENCES [dbo].[assessment_periods]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessments] ADD CONSTRAINT [assessments_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[academic_years]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessments] ADD CONSTRAINT [assessments_academicTermId_fkey] FOREIGN KEY ([academicTermId]) REFERENCES [dbo].[academic_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessments] ADD CONSTRAINT [assessments_classGroupId_fkey] FOREIGN KEY ([classGroupId]) REFERENCES [dbo].[class_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessments] ADD CONSTRAINT [assessments_teacherId_fkey] FOREIGN KEY ([teacherId]) REFERENCES [dbo].[teachers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_results] ADD CONSTRAINT [assessment_results_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_results] ADD CONSTRAINT [assessment_results_assessmentId_fkey] FOREIGN KEY ([assessmentId]) REFERENCES [dbo].[assessments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_results] ADD CONSTRAINT [assessment_results_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_results] ADD CONSTRAINT [assessment_results_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_publications] ADD CONSTRAINT [assessment_publications_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_publications] ADD CONSTRAINT [assessment_publications_assessmentId_fkey] FOREIGN KEY ([assessmentId]) REFERENCES [dbo].[assessments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_subject_progress] ADD CONSTRAINT [student_subject_progress_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_subject_progress] ADD CONSTRAINT [student_subject_progress_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_subject_progress] ADD CONSTRAINT [student_subject_progress_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_retakes] ADD CONSTRAINT [assessment_retakes_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_retakes] ADD CONSTRAINT [assessment_retakes_originalAssessmentResultId_fkey] FOREIGN KEY ([originalAssessmentResultId]) REFERENCES [dbo].[assessment_results]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_retakes] ADD CONSTRAINT [assessment_retakes_assessmentId_fkey] FOREIGN KEY ([assessmentId]) REFERENCES [dbo].[assessments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_retakes] ADD CONSTRAINT [assessment_retakes_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[assessment_retakes] ADD CONSTRAINT [assessment_retakes_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
