-- Academic Transcript Engine — Phase 1: entity data model
--
-- Purely additive: creates the 9 transcript entity tables (transcripts,
-- versions, and the denormalized level/subject/assessment/attendance snapshots,
-- plus events, exports and requests). No existing table or behaviour changes.
--
-- FKs are added AFTER all tables exist so the cyclic relation between
-- academic_transcripts.currentVersionId <-> academic_transcript_versions.transcriptId
-- resolves. All FKs use ON DELETE NO ACTION ON UPDATE NO ACTION. Columns that
-- point at source rows without a FK (POINTER columns) are intentionally left
-- without constraints so a snapshot survives deletion of the source row.
--
-- Two UNIQUE indexes are FILTERED (partial) and therefore MIGRATION-ONLY —
-- Prisma cannot express partial/filtered unique indexes, so they are not
-- declared with @@unique in schema.prisma:
--   1. academic_transcripts_org_transcriptNumber_key: one transcript number per
--      (organizationId, transcriptNumber) among live rows only
--      (transcriptNumber IS NOT NULL AND deletedAt IS NULL).
--   2. academic_transcript_versions_current_issued_key: at most one ISSUED
--      version per transcript (status = 'ISSUED').

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[academic_transcripts] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000),
    [courseId] NVARCHAR(1000),
    [transcriptType] NVARCHAR(1000) NOT NULL,
    [scopeCourseLevelId] NVARCHAR(1000),
    [scopeAcademicTermId] NVARCHAR(1000),
    [scopeLevelSubjectId] NVARCHAR(1000),
    [transcriptNumber] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [academic_transcripts_status_df] DEFAULT 'DRAFT',
    [currentVersionId] NVARCHAR(1000),
    [needsRegeneration] BIT NOT NULL CONSTRAINT [academic_transcripts_needsRegeneration_df] DEFAULT 0,
    [staleReason] NVARCHAR(max),
    [staleDetectedAt] DATETIME2,
    [issuedAt] DATETIME2,
    [issuedBy] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_transcripts_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [academic_transcripts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[academic_transcript_versions] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [transcriptId] NVARCHAR(1000) NOT NULL,
    [versionNumber] INT NOT NULL,
    [snapshotDate] DATETIME2 NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [academic_transcript_versions_status_df] DEFAULT 'DRAFT',
    [reason] NVARCHAR(max),
    [generatedBy] NVARCHAR(1000),
    [issuedBy] NVARCHAR(1000),
    [issuedAt] DATETIME2,
    [supersededAt] DATETIME2,
    [revokedAt] DATETIME2,
    [revokedBy] NVARCHAR(1000),
    [revokeReason] NVARCHAR(max),
    [checksum] NVARCHAR(1000),
    [studentSnapshot] NVARCHAR(max) NOT NULL,
    [courseSnapshot] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_transcript_versions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [academic_transcript_versions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [academic_transcript_versions_transcriptId_versionNumber_key] UNIQUE NONCLUSTERED ([transcriptId],[versionNumber])
);

-- CreateTable
CREATE TABLE [dbo].[academic_transcript_levels] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [transcriptVersionId] NVARCHAR(1000) NOT NULL,
    [courseLevelId] NVARCHAR(1000),
    [levelName] NVARCHAR(1000) NOT NULL,
    [levelCode] NVARCHAR(1000),
    [levelOrder] INT NOT NULL,
    [finalGrade] DECIMAL(5,2),
    [status] NVARCHAR(1000) NOT NULL,
    [completedAt] DATETIME2,
    [startedAt] DATETIME2,
    [earnedCredits] INT,
    [workloadHours] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_transcript_levels_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [academic_transcript_levels_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[academic_transcript_subjects] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [transcriptVersionId] NVARCHAR(1000) NOT NULL,
    [transcriptLevelId] NVARCHAR(1000) NOT NULL,
    [levelSubjectId] NVARCHAR(1000),
    [subjectId] NVARCHAR(1000),
    [subjectName] NVARCHAR(1000) NOT NULL,
    [subjectCode] NVARCHAR(1000),
    [subjectOrder] INT NOT NULL,
    [finalGrade] DECIMAL(5,2),
    [status] NVARCHAR(1000) NOT NULL,
    [minimumPassingGrade] DECIMAL(5,2),
    [attendancePercentage] DECIMAL(5,2),
    [minimumAttendancePercentage] DECIMAL(5,2),
    [completedAt] DATETIME2,
    [credits] INT,
    [workloadHours] INT,
    [isRequired] BIT NOT NULL CONSTRAINT [academic_transcript_subjects_isRequired_df] DEFAULT 1,
    [recoveryStatus] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_transcript_subjects_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [academic_transcript_subjects_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[academic_transcript_assessments] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [transcriptSubjectId] NVARCHAR(1000) NOT NULL,
    [studentAssessmentResultId] NVARCHAR(1000),
    [assessmentComponentId] NVARCHAR(1000),
    [assessmentEventId] NVARCHAR(1000),
    [title] NVARCHAR(1000),
    [componentName] NVARCHAR(1000) NOT NULL,
    [componentType] NVARCHAR(1000),
    [sourceType] NVARCHAR(1000) NOT NULL,
    [grade] DECIMAL(5,2) NOT NULL,
    [maxGrade] DECIMAL(5,2) NOT NULL,
    [normalizedGrade] DECIMAL(5,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [gradedAt] DATETIME2,
    [isRecovery] BIT NOT NULL CONSTRAINT [academic_transcript_assessments_isRecovery_df] DEFAULT 0,
    [recoveryAttemptNumber] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_transcript_assessments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [academic_transcript_assessments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[academic_transcript_attendances] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [transcriptVersionId] NVARCHAR(1000) NOT NULL,
    [transcriptSubjectId] NVARCHAR(1000),
    [levelSubjectId] NVARCHAR(1000),
    [academicYearId] NVARCHAR(1000),
    [academicTermId] NVARCHAR(1000),
    [attendancePercentage] DECIMAL(5,2),
    [totalSessions] INT NOT NULL CONSTRAINT [academic_transcript_attendances_totalSessions_df] DEFAULT 0,
    [totalPresentMinutes] INT NOT NULL CONSTRAINT [academic_transcript_attendances_totalPresentMinutes_df] DEFAULT 0,
    [totalScheduledMinutes] INT NOT NULL CONSTRAINT [academic_transcript_attendances_totalScheduledMinutes_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL,
    [policyId] NVARCHAR(1000),
    [policyName] NVARCHAR(1000),
    [minimumAttendancePercentage] DECIMAL(5,2),
    [calculatedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_transcript_attendances_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [academic_transcript_attendances_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[academic_transcript_events] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [transcriptId] NVARCHAR(1000) NOT NULL,
    [transcriptVersionId] NVARCHAR(1000),
    [eventType] NVARCHAR(1000) NOT NULL,
    [previousStatus] NVARCHAR(1000),
    [newStatus] NVARCHAR(1000),
    [reason] NVARCHAR(max),
    [actorId] NVARCHAR(1000),
    [metadata] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_transcript_events_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [academic_transcript_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[academic_transcript_exports] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [transcriptVersionId] NVARCHAR(1000) NOT NULL,
    [exportType] NVARCHAR(1000) NOT NULL,
    [fileUrl] NVARCHAR(1000),
    [fileChecksum] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [academic_transcript_exports_status_df] DEFAULT 'PENDING',
    [exportedBy] NVARCHAR(1000),
    [exportedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_transcript_exports_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [academic_transcript_exports_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[academic_transcript_requests] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000),
    [courseId] NVARCHAR(1000),
    [requestedBy] NVARCHAR(1000) NOT NULL,
    [requestType] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [academic_transcript_requests_status_df] DEFAULT 'PENDING',
    [reason] NVARCHAR(max),
    [reviewedBy] NVARCHAR(1000),
    [reviewedAt] DATETIME2,
    [fulfilledTranscriptVersionId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_transcript_requests_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [academic_transcript_requests_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcripts] ADD CONSTRAINT [academic_transcripts_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcripts] ADD CONSTRAINT [academic_transcripts_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcripts] ADD CONSTRAINT [academic_transcripts_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcripts] ADD CONSTRAINT [academic_transcripts_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcripts] ADD CONSTRAINT [academic_transcripts_currentVersionId_fkey] FOREIGN KEY ([currentVersionId]) REFERENCES [dbo].[academic_transcript_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_versions] ADD CONSTRAINT [academic_transcript_versions_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_versions] ADD CONSTRAINT [academic_transcript_versions_transcriptId_fkey] FOREIGN KEY ([transcriptId]) REFERENCES [dbo].[academic_transcripts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_levels] ADD CONSTRAINT [academic_transcript_levels_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_levels] ADD CONSTRAINT [academic_transcript_levels_transcriptVersionId_fkey] FOREIGN KEY ([transcriptVersionId]) REFERENCES [dbo].[academic_transcript_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_subjects] ADD CONSTRAINT [academic_transcript_subjects_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_subjects] ADD CONSTRAINT [academic_transcript_subjects_transcriptVersionId_fkey] FOREIGN KEY ([transcriptVersionId]) REFERENCES [dbo].[academic_transcript_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_subjects] ADD CONSTRAINT [academic_transcript_subjects_transcriptLevelId_fkey] FOREIGN KEY ([transcriptLevelId]) REFERENCES [dbo].[academic_transcript_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_assessments] ADD CONSTRAINT [academic_transcript_assessments_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_assessments] ADD CONSTRAINT [academic_transcript_assessments_transcriptSubjectId_fkey] FOREIGN KEY ([transcriptSubjectId]) REFERENCES [dbo].[academic_transcript_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_attendances] ADD CONSTRAINT [academic_transcript_attendances_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_attendances] ADD CONSTRAINT [academic_transcript_attendances_transcriptVersionId_fkey] FOREIGN KEY ([transcriptVersionId]) REFERENCES [dbo].[academic_transcript_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_attendances] ADD CONSTRAINT [academic_transcript_attendances_transcriptSubjectId_fkey] FOREIGN KEY ([transcriptSubjectId]) REFERENCES [dbo].[academic_transcript_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_events] ADD CONSTRAINT [academic_transcript_events_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_events] ADD CONSTRAINT [academic_transcript_events_transcriptId_fkey] FOREIGN KEY ([transcriptId]) REFERENCES [dbo].[academic_transcripts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_events] ADD CONSTRAINT [academic_transcript_events_transcriptVersionId_fkey] FOREIGN KEY ([transcriptVersionId]) REFERENCES [dbo].[academic_transcript_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_exports] ADD CONSTRAINT [academic_transcript_exports_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_exports] ADD CONSTRAINT [academic_transcript_exports_transcriptVersionId_fkey] FOREIGN KEY ([transcriptVersionId]) REFERENCES [dbo].[academic_transcript_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_requests] ADD CONSTRAINT [academic_transcript_requests_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_requests] ADD CONSTRAINT [academic_transcript_requests_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_requests] ADD CONSTRAINT [academic_transcript_requests_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_requests] ADD CONSTRAINT [academic_transcript_requests_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_transcript_requests] ADD CONSTRAINT [academic_transcript_requests_fulfilledTranscriptVersionId_fkey] FOREIGN KEY ([fulfilledTranscriptVersionId]) REFERENCES [dbo].[academic_transcript_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcripts_organizationId_studentId_idx] ON [dbo].[academic_transcripts]([organizationId],[studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcripts_organizationId_enrollmentId_idx] ON [dbo].[academic_transcripts]([organizationId],[enrollmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcripts_organizationId_courseId_idx] ON [dbo].[academic_transcripts]([organizationId],[courseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcripts_organizationId_status_idx] ON [dbo].[academic_transcripts]([organizationId],[status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcripts_organizationId_transcriptType_idx] ON [dbo].[academic_transcripts]([organizationId],[transcriptType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcripts_organizationId_needsRegeneration_idx] ON [dbo].[academic_transcripts]([organizationId],[needsRegeneration]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_versions_organizationId_transcriptId_idx] ON [dbo].[academic_transcript_versions]([organizationId],[transcriptId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_versions_organizationId_status_idx] ON [dbo].[academic_transcript_versions]([organizationId],[status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_versions_organizationId_issuedAt_idx] ON [dbo].[academic_transcript_versions]([organizationId],[issuedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_versions_organizationId_checksum_idx] ON [dbo].[academic_transcript_versions]([organizationId],[checksum]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_levels_organizationId_transcriptVersionId_idx] ON [dbo].[academic_transcript_levels]([organizationId],[transcriptVersionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_subjects_organizationId_transcriptVersionId_idx] ON [dbo].[academic_transcript_subjects]([organizationId],[transcriptVersionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_subjects_organizationId_transcriptLevelId_idx] ON [dbo].[academic_transcript_subjects]([organizationId],[transcriptLevelId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_assessments_organizationId_transcriptSubjectId_idx] ON [dbo].[academic_transcript_assessments]([organizationId],[transcriptSubjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_attendances_organizationId_transcriptVersionId_idx] ON [dbo].[academic_transcript_attendances]([organizationId],[transcriptVersionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_attendances_organizationId_transcriptSubjectId_idx] ON [dbo].[academic_transcript_attendances]([organizationId],[transcriptSubjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_events_organizationId_transcriptId_idx] ON [dbo].[academic_transcript_events]([organizationId],[transcriptId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_events_organizationId_createdAt_idx] ON [dbo].[academic_transcript_events]([organizationId],[createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_exports_organizationId_transcriptVersionId_idx] ON [dbo].[academic_transcript_exports]([organizationId],[transcriptVersionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_requests_organizationId_studentId_idx] ON [dbo].[academic_transcript_requests]([organizationId],[studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_transcript_requests_organizationId_status_idx] ON [dbo].[academic_transcript_requests]([organizationId],[status]);

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- One transcript number per (organizationId, transcriptNumber) among live rows.
CREATE UNIQUE NONCLUSTERED INDEX [academic_transcripts_org_transcriptNumber_key] ON [dbo].[academic_transcripts]([organizationId],[transcriptNumber]) WHERE [transcriptNumber] IS NOT NULL AND [deletedAt] IS NULL;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- At most one ISSUED version per transcript.
CREATE UNIQUE NONCLUSTERED INDEX [academic_transcript_versions_current_issued_key] ON [dbo].[academic_transcript_versions]([transcriptId]) WHERE [status] = 'ISSUED';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW

END CATCH
