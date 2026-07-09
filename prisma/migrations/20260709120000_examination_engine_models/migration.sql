-- Examination Engine — Phase 1: entity data model
--
-- Purely additive: creates the 13 exam_* entity tables (periods, rooms, sessions,
-- attempts, candidates, attendances, results, result_revisions, appeals,
-- publications, incidents, invigilator_assignments, events). No existing table or
-- behaviour changes.
--
-- All FKs use ON DELETE NO ACTION ON UPDATE NO ACTION. Actor/"by"/marker/reviewer/
-- approver/requester/invigilator-identity fields (createdById, lockedById, markerId,
-- reviewedById, approvedById, requestedById, decidedById, reportedById, assignedById,
-- teacherId, userId, actorId, ...) are PLAIN columns with NO foreign key. So is
-- exam_results.currentRevisionId — a POINTER to the CURRENT ExamResultRevision that
-- deliberately has NO foreign key (avoids a cyclic FK; the result row is authoritative
-- and never follows revision deletion).
--
-- SIX UNIQUE indexes are FILTERED (partial) and therefore MIGRATION-ONLY — Prisma
-- cannot express partial/filtered unique indexes, so they are NOT declared with
-- @@unique in schema.prisma. Introspection may report drift for them; that is EXPECTED
-- and intentional:
--   1. exam_rooms_org_code_key — one room code per (organizationId, code) among live
--      rows (code IS NOT NULL AND deletedAt IS NULL).
--   2. exam_attempts_org_enrollment_subject_number_key — one attemptNumber per
--      (organizationId, enrollmentId, levelSubjectId) among live rows (deletedAt IS NULL);
--      makes re-sit numbering unique while preserving historical attempts.
--   3. exam_candidates_active_key — one ACTIVE candidate per (organizationId,
--      examSessionId, studentId) among live rows; "active" excludes WITHDRAWN and
--      DISQUALIFIED so a re-registration after withdrawal is allowed. (SQL Server
--      filtered predicates cannot use IN, so the active set is status <> 'WITHDRAWN'
--      AND status <> 'DISQUALIFIED'.)
--   4. exam_result_revisions_current_key — at most one CURRENT revision per
--      (organizationId, examResultId) among rows with isCurrent = 1.
--   5. exam_invigilator_assignments_teacher_key — one active teacher assignment per
--      (organizationId, examSessionId, teacherId) among rows with teacherId IS NOT NULL.
--   6. exam_invigilator_assignments_user_key — one active user assignment per
--      (organizationId, examSessionId, userId) among rows with userId IS NOT NULL.

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[exam_periods] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [name] NVARCHAR(1000) NOT NULL,
    [academicYear] NVARCHAR(1000) NOT NULL,
    [term] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_periods_status_df] DEFAULT 'DRAFT',
    [startsAt] DATETIME2 NOT NULL,
    [endsAt] DATETIME2 NOT NULL,
    [lockedAt] DATETIME2,
    [completedAt] DATETIME2,
    [cancelledAt] DATETIME2,
    [createdById] NVARCHAR(1000),
    [lockedById] NVARCHAR(1000),
    [completedById] NVARCHAR(1000),
    [cancelledById] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_periods_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [exam_periods_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_rooms] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [name] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000),
    [capacity] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_rooms_status_df] DEFAULT 'ACTIVE',
    [description] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_rooms_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [exam_rooms_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_sessions] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [periodId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [courseId] NVARCHAR(1000),
    [courseLevelId] NVARCHAR(1000),
    [levelSubjectId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000),
    [title] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_sessions_status_df] DEFAULT 'DRAFT',
    [startsAt] DATETIME2 NOT NULL,
    [endsAt] DATETIME2 NOT NULL,
    [capacity] INT NOT NULL,
    [instructions] NVARCHAR(1000),
    [lockedAt] DATETIME2,
    [startedAt] DATETIME2,
    [completedAt] DATETIME2,
    [publishedAt] DATETIME2,
    [cancelledAt] DATETIME2,
    [createdById] NVARCHAR(1000),
    [lockedById] NVARCHAR(1000),
    [completedById] NVARCHAR(1000),
    [publishedById] NVARCHAR(1000),
    [cancelledById] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_sessions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [exam_sessions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_attempts] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [levelSubjectId] NVARCHAR(1000) NOT NULL,
    [attemptNumber] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_attempts_status_df] DEFAULT 'OPEN',
    [source] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_attempts_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [exam_attempts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_candidates] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [examSessionId] NVARCHAR(1000) NOT NULL,
    [examAttemptId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [eligibilityStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_candidates_eligibilityStatus_df] DEFAULT 'PENDING_ELIGIBILITY',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_candidates_status_df] DEFAULT 'PENDING_ELIGIBILITY',
    [assignedSeat] NVARCHAR(1000),
    [registeredAt] DATETIME2,
    [registeredById] NVARCHAR(1000),
    [withdrawnAt] DATETIME2,
    [withdrawnById] NVARCHAR(1000),
    [disqualifiedAt] DATETIME2,
    [disqualifiedById] NVARCHAR(1000),
    [disqualificationReason] NVARCHAR(1000),
    [overriddenById] NVARCHAR(1000),
    [overrideReason] NVARCHAR(1000),
    [eligibilitySnapshot] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_candidates_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [exam_candidates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_attendances] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [examCandidateId] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [checkedInAt] DATETIME2,
    [markedAt] DATETIME2,
    [markedById] NVARCHAR(1000),
    [remarks] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_attendances_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [exam_attendances_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [exam_attendances_examCandidateId_key] UNIQUE NONCLUSTERED ([examCandidateId])
);

-- CreateTable
CREATE TABLE [dbo].[exam_results] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [examCandidateId] NVARCHAR(1000) NOT NULL,
    [examAttemptId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [levelSubjectId] NVARCHAR(1000) NOT NULL,
    [score] DECIMAL(6,2),
    [maxScore] DECIMAL(6,2) NOT NULL,
    [normalizedScore] DECIMAL(6,2),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_results_status_df] DEFAULT 'DRAFT',
    [resultCode] NVARCHAR(1000),
    [markerId] NVARCHAR(1000),
    [reviewedById] NVARCHAR(1000),
    [approvedById] NVARCHAR(1000),
    [submittedAt] DATETIME2,
    [reviewedAt] DATETIME2,
    [approvedAt] DATETIME2,
    [publishedAt] DATETIME2,
    [invalidatedAt] DATETIME2,
    [invalidationReason] NVARCHAR(1000),
    [remarks] NVARCHAR(1000),
    [resultChecksum] NVARCHAR(1000),
    [currentRevisionId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_results_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [exam_results_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [exam_results_examCandidateId_key] UNIQUE NONCLUSTERED ([examCandidateId])
);

-- CreateTable
CREATE TABLE [dbo].[exam_result_revisions] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [examResultId] NVARCHAR(1000) NOT NULL,
    [revisionNumber] INT NOT NULL,
    [previousScore] DECIMAL(6,2),
    [revisedScore] DECIMAL(6,2),
    [previousStatus] NVARCHAR(1000),
    [revisedStatus] NVARCHAR(1000),
    [reason] NVARCHAR(1000) NOT NULL,
    [sourceType] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_result_revisions_status_df] DEFAULT 'DRAFT',
    [isCurrent] BIT NOT NULL CONSTRAINT [exam_result_revisions_isCurrent_df] DEFAULT 0,
    [createdById] NVARCHAR(1000),
    [approvedById] NVARCHAR(1000),
    [approvedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_result_revisions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [exam_result_revisions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [exam_result_revisions_organizationId_examResultId_revisionNumber_key] UNIQUE NONCLUSTERED ([organizationId], [examResultId], [revisionNumber])
);

-- CreateTable
CREATE TABLE [dbo].[exam_appeals] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [examResultId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [requestedById] NVARCHAR(1000) NOT NULL,
    [reason] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_appeals_status_df] DEFAULT 'PENDING',
    [decision] NVARCHAR(1000),
    [decisionReason] NVARCHAR(1000),
    [decidedById] NVARCHAR(1000),
    [decidedAt] DATETIME2,
    [closedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_appeals_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [exam_appeals_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_publications] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [examSessionId] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_publications_status_df] DEFAULT 'DRAFT',
    [publishedAt] DATETIME2,
    [publishedById] NVARCHAR(1000),
    [retractedAt] DATETIME2,
    [retractedById] NVARCHAR(1000),
    [reason] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_publications_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [exam_publications_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_incidents] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [examSessionId] NVARCHAR(1000) NOT NULL,
    [examCandidateId] NVARCHAR(1000),
    [type] NVARCHAR(1000) NOT NULL,
    [severity] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max) NOT NULL,
    [actionTaken] NVARCHAR(1000),
    [reportedById] NVARCHAR(1000),
    [reportedAt] DATETIME2 NOT NULL CONSTRAINT [exam_incidents_reportedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_incidents_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [exam_incidents_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_invigilator_assignments] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [examSessionId] NVARCHAR(1000) NOT NULL,
    [teacherId] NVARCHAR(1000),
    [userId] NVARCHAR(1000),
    [role] NVARCHAR(1000) NOT NULL,
    [assignedAt] DATETIME2 NOT NULL CONSTRAINT [exam_invigilator_assignments_assignedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [assignedById] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_invigilator_assignments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [exam_invigilator_assignments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_events] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [aggregateType] NVARCHAR(1000) NOT NULL,
    [aggregateId] NVARCHAR(1000) NOT NULL,
    [eventType] NVARCHAR(1000) NOT NULL,
    [previousStatus] NVARCHAR(1000),
    [newStatus] NVARCHAR(1000),
    [actorId] NVARCHAR(1000),
    [reason] NVARCHAR(1000),
    [metadata] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_events_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [exam_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_periods_organizationId_status_idx] ON [dbo].[exam_periods]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_periods_organizationId_academicYear_idx] ON [dbo].[exam_periods]([organizationId], [academicYear]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_periods_organizationId_startsAt_endsAt_idx] ON [dbo].[exam_periods]([organizationId], [startsAt], [endsAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_periods_organizationId_deletedAt_idx] ON [dbo].[exam_periods]([organizationId], [deletedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_rooms_organizationId_branchId_idx] ON [dbo].[exam_rooms]([organizationId], [branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_rooms_organizationId_deletedAt_idx] ON [dbo].[exam_rooms]([organizationId], [deletedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_sessions_organizationId_periodId_idx] ON [dbo].[exam_sessions]([organizationId], [periodId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_sessions_organizationId_levelSubjectId_idx] ON [dbo].[exam_sessions]([organizationId], [levelSubjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_sessions_organizationId_status_idx] ON [dbo].[exam_sessions]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_sessions_organizationId_startsAt_endsAt_idx] ON [dbo].[exam_sessions]([organizationId], [startsAt], [endsAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_sessions_organizationId_roomId_startsAt_endsAt_idx] ON [dbo].[exam_sessions]([organizationId], [roomId], [startsAt], [endsAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_sessions_organizationId_deletedAt_idx] ON [dbo].[exam_sessions]([organizationId], [deletedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_attempts_organizationId_studentId_idx] ON [dbo].[exam_attempts]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_attempts_organizationId_enrollmentId_levelSubjectId_idx] ON [dbo].[exam_attempts]([organizationId], [enrollmentId], [levelSubjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_attempts_organizationId_levelSubjectId_status_idx] ON [dbo].[exam_attempts]([organizationId], [levelSubjectId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_attempts_organizationId_deletedAt_idx] ON [dbo].[exam_attempts]([organizationId], [deletedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_candidates_organizationId_examSessionId_idx] ON [dbo].[exam_candidates]([organizationId], [examSessionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_candidates_organizationId_studentId_idx] ON [dbo].[exam_candidates]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_candidates_organizationId_enrollmentId_idx] ON [dbo].[exam_candidates]([organizationId], [enrollmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_candidates_organizationId_status_idx] ON [dbo].[exam_candidates]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_candidates_organizationId_deletedAt_idx] ON [dbo].[exam_candidates]([organizationId], [deletedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_attendances_organizationId_status_idx] ON [dbo].[exam_attendances]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_attendances_organizationId_markedAt_idx] ON [dbo].[exam_attendances]([organizationId], [markedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_results_organizationId_status_idx] ON [dbo].[exam_results]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_results_organizationId_studentId_idx] ON [dbo].[exam_results]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_results_organizationId_enrollmentId_levelSubjectId_idx] ON [dbo].[exam_results]([organizationId], [enrollmentId], [levelSubjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_results_organizationId_publishedAt_idx] ON [dbo].[exam_results]([organizationId], [publishedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_result_revisions_organizationId_examResultId_idx] ON [dbo].[exam_result_revisions]([organizationId], [examResultId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_result_revisions_organizationId_status_idx] ON [dbo].[exam_result_revisions]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_result_revisions_organizationId_isCurrent_idx] ON [dbo].[exam_result_revisions]([organizationId], [isCurrent]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_appeals_organizationId_status_idx] ON [dbo].[exam_appeals]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_appeals_organizationId_studentId_idx] ON [dbo].[exam_appeals]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_appeals_organizationId_examResultId_idx] ON [dbo].[exam_appeals]([organizationId], [examResultId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_publications_organizationId_examSessionId_idx] ON [dbo].[exam_publications]([organizationId], [examSessionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_publications_organizationId_status_idx] ON [dbo].[exam_publications]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_publications_organizationId_publishedAt_idx] ON [dbo].[exam_publications]([organizationId], [publishedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_incidents_organizationId_examSessionId_idx] ON [dbo].[exam_incidents]([organizationId], [examSessionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_incidents_organizationId_examCandidateId_idx] ON [dbo].[exam_incidents]([organizationId], [examCandidateId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_incidents_organizationId_severity_idx] ON [dbo].[exam_incidents]([organizationId], [severity]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_incidents_organizationId_reportedAt_idx] ON [dbo].[exam_incidents]([organizationId], [reportedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_invigilator_assignments_organizationId_examSessionId_idx] ON [dbo].[exam_invigilator_assignments]([organizationId], [examSessionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_invigilator_assignments_organizationId_teacherId_idx] ON [dbo].[exam_invigilator_assignments]([organizationId], [teacherId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_invigilator_assignments_organizationId_userId_idx] ON [dbo].[exam_invigilator_assignments]([organizationId], [userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_invigilator_assignments_organizationId_assignedAt_idx] ON [dbo].[exam_invigilator_assignments]([organizationId], [assignedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_events_organizationId_aggregateType_aggregateId_idx] ON [dbo].[exam_events]([organizationId], [aggregateType], [aggregateId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_events_organizationId_eventType_idx] ON [dbo].[exam_events]([organizationId], [eventType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_events_organizationId_createdAt_idx] ON [dbo].[exam_events]([organizationId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[exam_periods] ADD CONSTRAINT [exam_periods_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_periods] ADD CONSTRAINT [exam_periods_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_rooms] ADD CONSTRAINT [exam_rooms_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_rooms] ADD CONSTRAINT [exam_rooms_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_sessions] ADD CONSTRAINT [exam_sessions_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_sessions] ADD CONSTRAINT [exam_sessions_periodId_fkey] FOREIGN KEY ([periodId]) REFERENCES [dbo].[exam_periods]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_sessions] ADD CONSTRAINT [exam_sessions_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_sessions] ADD CONSTRAINT [exam_sessions_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_sessions] ADD CONSTRAINT [exam_sessions_courseLevelId_fkey] FOREIGN KEY ([courseLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_sessions] ADD CONSTRAINT [exam_sessions_levelSubjectId_fkey] FOREIGN KEY ([levelSubjectId]) REFERENCES [dbo].[level_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_sessions] ADD CONSTRAINT [exam_sessions_roomId_fkey] FOREIGN KEY ([roomId]) REFERENCES [dbo].[exam_rooms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_attempts] ADD CONSTRAINT [exam_attempts_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_attempts] ADD CONSTRAINT [exam_attempts_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_attempts] ADD CONSTRAINT [exam_attempts_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_attempts] ADD CONSTRAINT [exam_attempts_levelSubjectId_fkey] FOREIGN KEY ([levelSubjectId]) REFERENCES [dbo].[level_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_candidates] ADD CONSTRAINT [exam_candidates_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_candidates] ADD CONSTRAINT [exam_candidates_examSessionId_fkey] FOREIGN KEY ([examSessionId]) REFERENCES [dbo].[exam_sessions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_candidates] ADD CONSTRAINT [exam_candidates_examAttemptId_fkey] FOREIGN KEY ([examAttemptId]) REFERENCES [dbo].[exam_attempts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_candidates] ADD CONSTRAINT [exam_candidates_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_candidates] ADD CONSTRAINT [exam_candidates_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_attendances] ADD CONSTRAINT [exam_attendances_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_attendances] ADD CONSTRAINT [exam_attendances_examCandidateId_fkey] FOREIGN KEY ([examCandidateId]) REFERENCES [dbo].[exam_candidates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_results] ADD CONSTRAINT [exam_results_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_results] ADD CONSTRAINT [exam_results_examCandidateId_fkey] FOREIGN KEY ([examCandidateId]) REFERENCES [dbo].[exam_candidates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_results] ADD CONSTRAINT [exam_results_examAttemptId_fkey] FOREIGN KEY ([examAttemptId]) REFERENCES [dbo].[exam_attempts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_results] ADD CONSTRAINT [exam_results_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_results] ADD CONSTRAINT [exam_results_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_results] ADD CONSTRAINT [exam_results_levelSubjectId_fkey] FOREIGN KEY ([levelSubjectId]) REFERENCES [dbo].[level_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_result_revisions] ADD CONSTRAINT [exam_result_revisions_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_result_revisions] ADD CONSTRAINT [exam_result_revisions_examResultId_fkey] FOREIGN KEY ([examResultId]) REFERENCES [dbo].[exam_results]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_appeals] ADD CONSTRAINT [exam_appeals_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_appeals] ADD CONSTRAINT [exam_appeals_examResultId_fkey] FOREIGN KEY ([examResultId]) REFERENCES [dbo].[exam_results]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_appeals] ADD CONSTRAINT [exam_appeals_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_publications] ADD CONSTRAINT [exam_publications_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_publications] ADD CONSTRAINT [exam_publications_examSessionId_fkey] FOREIGN KEY ([examSessionId]) REFERENCES [dbo].[exam_sessions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_incidents] ADD CONSTRAINT [exam_incidents_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_incidents] ADD CONSTRAINT [exam_incidents_examSessionId_fkey] FOREIGN KEY ([examSessionId]) REFERENCES [dbo].[exam_sessions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_incidents] ADD CONSTRAINT [exam_incidents_examCandidateId_fkey] FOREIGN KEY ([examCandidateId]) REFERENCES [dbo].[exam_candidates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_invigilator_assignments] ADD CONSTRAINT [exam_invigilator_assignments_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_invigilator_assignments] ADD CONSTRAINT [exam_invigilator_assignments_examSessionId_fkey] FOREIGN KEY ([examSessionId]) REFERENCES [dbo].[exam_sessions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_events] ADD CONSTRAINT [exam_events_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- One room code per (organizationId, code) among live rows.
CREATE UNIQUE NONCLUSTERED INDEX [exam_rooms_org_code_key] ON [dbo].[exam_rooms]([organizationId], [code]) WHERE [code] IS NOT NULL AND [deletedAt] IS NULL;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- One attemptNumber per (organizationId, enrollmentId, levelSubjectId) among live rows.
CREATE UNIQUE NONCLUSTERED INDEX [exam_attempts_org_enrollment_subject_number_key] ON [dbo].[exam_attempts]([organizationId], [enrollmentId], [levelSubjectId], [attemptNumber]) WHERE [deletedAt] IS NULL;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- One ACTIVE candidate per (organizationId, examSessionId, studentId); active excludes WITHDRAWN/DISQUALIFIED.
CREATE UNIQUE NONCLUSTERED INDEX [exam_candidates_active_key] ON [dbo].[exam_candidates]([organizationId], [examSessionId], [studentId]) WHERE [deletedAt] IS NULL AND [status] <> 'WITHDRAWN' AND [status] <> 'DISQUALIFIED';

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- At most one CURRENT revision per (organizationId, examResultId).
CREATE UNIQUE NONCLUSTERED INDEX [exam_result_revisions_current_key] ON [dbo].[exam_result_revisions]([organizationId], [examResultId]) WHERE [isCurrent] = 1;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- One active teacher assignment per (organizationId, examSessionId, teacherId).
CREATE UNIQUE NONCLUSTERED INDEX [exam_invigilator_assignments_teacher_key] ON [dbo].[exam_invigilator_assignments]([organizationId], [examSessionId], [teacherId]) WHERE [teacherId] IS NOT NULL;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- One active user assignment per (organizationId, examSessionId, userId).
CREATE UNIQUE NONCLUSTERED INDEX [exam_invigilator_assignments_user_key] ON [dbo].[exam_invigilator_assignments]([organizationId], [examSessionId], [userId]) WHERE [userId] IS NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
