BEGIN TRY

BEGIN TRAN;

-- AlterTable: add credits to level_subjects
ALTER TABLE [dbo].[level_subjects] ADD [credits] INT CONSTRAINT [level_subjects_credits_df] DEFAULT 0;

-- AlterTable: add initialLevelId and currentLevelId to enrollments
ALTER TABLE [dbo].[enrollments] ADD [initialLevelId] NVARCHAR(1000);
ALTER TABLE [dbo].[enrollments] ADD [currentLevelId] NVARCHAR(1000);

-- CreateTable: student_level_progress
CREATE TABLE [dbo].[student_level_progress] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000) NOT NULL,
    [courseLevelId] NVARCHAR(1000) NOT NULL,
    [finalGrade] DECIMAL(5,2),
    [earnedCredits] INT CONSTRAINT [student_level_progress_earnedCredits_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_level_progress_status_df] DEFAULT 'NOT_STARTED',
    [progressReason] NVARCHAR(max),
    [completedAt] DATETIME2,
    [calculatedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_level_progress_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [student_level_progress_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [student_level_progress_enrollmentId_courseLevelId_key] UNIQUE NONCLUSTERED ([enrollmentId],[courseLevelId])
);

-- CreateTable: student_course_progress
CREATE TABLE [dbo].[student_course_progress] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000) NOT NULL,
    [finalGrade] DECIMAL(5,2),
    [earnedCredits] INT CONSTRAINT [student_course_progress_earnedCredits_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_course_progress_status_df] DEFAULT 'NOT_STARTED',
    [progressReason] NVARCHAR(max),
    [completedAt] DATETIME2,
    [calculatedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_course_progress_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [student_course_progress_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [student_course_progress_enrollmentId_key] UNIQUE NONCLUSTERED ([enrollmentId])
);

-- CreateTable: level_subject_prerequisite_groups
CREATE TABLE [dbo].[level_subject_prerequisite_groups] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [levelSubjectId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000),
    [description] NVARCHAR(max),
    [logicType] NVARCHAR(1000) NOT NULL CONSTRAINT [level_subject_prerequisite_groups_logicType_df] DEFAULT 'ALL',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [level_subject_prerequisite_groups_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [level_subject_prerequisite_groups_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [level_subject_prerequisite_groups_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable: level_subject_prerequisite_items
CREATE TABLE [dbo].[level_subject_prerequisite_items] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [prerequisiteGroupId] NVARCHAR(1000) NOT NULL,
    [prerequisiteLevelSubjectId] NVARCHAR(1000) NOT NULL,
    [requirementType] NVARCHAR(1000) NOT NULL CONSTRAINT [level_subject_prerequisite_items_requirementType_df] DEFAULT 'MUST_PASS',
    [minimumRequiredGrade] DECIMAL(5,2),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [level_subject_prerequisite_items_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [level_subject_prerequisite_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [level_subject_prerequisite_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable: prerequisite_waivers
CREATE TABLE [dbo].[prerequisite_waivers] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [levelSubjectId] NVARCHAR(1000) NOT NULL,
    [prerequisiteGroupId] NVARCHAR(1000),
    [prerequisiteItemId] NVARCHAR(1000),
    [reason] NVARCHAR(max) NOT NULL,
    [grantedBy] NVARCHAR(1000) NOT NULL,
    [grantedAt] DATETIME2 NOT NULL CONSTRAINT [prerequisite_waivers_grantedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [prerequisite_waivers_status_df] DEFAULT 'ACTIVE',
    [revokedBy] NVARCHAR(1000),
    [revokedAt] DATETIME2,
    [revokedReason] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [prerequisite_waivers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [prerequisite_waivers_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable: level_progression_policies
CREATE TABLE [dbo].[level_progression_policies] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000) NOT NULL,
    [fromLevelId] NVARCHAR(1000) NOT NULL,
    [toLevelId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [progressionMode] NVARCHAR(1000) NOT NULL CONSTRAINT [level_progression_policies_progressionMode_df] DEFAULT 'STRICT',
    [minimumLevelAverage] DECIMAL(5,2),
    [maxFailedRequiredSubjects] INT CONSTRAINT [level_progression_policies_maxFailed_df] DEFAULT 0,
    [maxPendingSubjects] INT CONSTRAINT [level_progression_policies_maxPending_df] DEFAULT 0,
    [requiredCredits] INT,
    [requireFinancialClearance] BIT NOT NULL CONSTRAINT [level_progression_policies_requireFinancial_df] DEFAULT 0,
    [requireManualApproval] BIT NOT NULL CONSTRAINT [level_progression_policies_requireManual_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [level_progression_policies_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [level_progression_policies_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [level_progression_policies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [level_progression_policies_courseId_fromLevelId_toLevelId_key] UNIQUE NONCLUSTERED ([courseId],[fromLevelId],[toLevelId])
);

-- CreateTable: level_progression_requests
CREATE TABLE [dbo].[level_progression_requests] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000) NOT NULL,
    [policyId] NVARCHAR(1000),
    [fromLevelId] NVARCHAR(1000) NOT NULL,
    [toLevelId] NVARCHAR(1000) NOT NULL,
    [decision] NVARCHAR(1000) NOT NULL CONSTRAINT [level_progression_requests_decision_df] DEFAULT 'PENDING',
    [reason] NVARCHAR(max),
    [reviewNotes] NVARCHAR(max),
    [requestedAt] DATETIME2 NOT NULL CONSTRAINT [level_progression_requests_requestedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [reviewedAt] DATETIME2,
    [reviewedBy] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [level_progression_requests_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [level_progression_requests_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_level_progress_organizationId_studentId_idx] ON [dbo].[student_level_progress]([organizationId], [studentId]);
CREATE NONCLUSTERED INDEX [student_level_progress_organizationId_courseLevelId_idx] ON [dbo].[student_level_progress]([organizationId], [courseLevelId]);
CREATE NONCLUSTERED INDEX [student_course_progress_organizationId_studentId_idx] ON [dbo].[student_course_progress]([organizationId], [studentId]);
CREATE NONCLUSTERED INDEX [student_course_progress_organizationId_courseId_idx] ON [dbo].[student_course_progress]([organizationId], [courseId]);
CREATE NONCLUSTERED INDEX [level_subject_prerequisite_groups_orgId_levelSubjectId_status_idx] ON [dbo].[level_subject_prerequisite_groups]([organizationId], [levelSubjectId], [status]);
CREATE NONCLUSTERED INDEX [level_subject_prerequisite_items_organizationId_groupId_idx] ON [dbo].[level_subject_prerequisite_items]([organizationId], [prerequisiteGroupId]);
CREATE NONCLUSTERED INDEX [level_subject_prerequisite_items_organizationId_prereqId_idx] ON [dbo].[level_subject_prerequisite_items]([organizationId], [prerequisiteLevelSubjectId]);
CREATE NONCLUSTERED INDEX [prerequisite_waivers_organizationId_studentId_idx] ON [dbo].[prerequisite_waivers]([organizationId], [studentId]);
CREATE NONCLUSTERED INDEX [prerequisite_waivers_organizationId_enrollmentId_levelSubjectId_idx] ON [dbo].[prerequisite_waivers]([organizationId], [enrollmentId], [levelSubjectId]);
CREATE NONCLUSTERED INDEX [level_progression_policies_organizationId_courseId_status_idx] ON [dbo].[level_progression_policies]([organizationId], [courseId], [status]);
CREATE NONCLUSTERED INDEX [level_progression_requests_organizationId_enrollmentId_idx] ON [dbo].[level_progression_requests]([organizationId], [enrollmentId]);
CREATE NONCLUSTERED INDEX [level_progression_requests_organizationId_studentId_idx] ON [dbo].[level_progression_requests]([organizationId], [studentId]);
CREATE NONCLUSTERED INDEX [level_progression_requests_organizationId_decision_idx] ON [dbo].[level_progression_requests]([organizationId], [decision]);

-- AddForeignKey
ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_initialLevelId_fkey] FOREIGN KEY ([initialLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_currentLevelId_fkey] FOREIGN KEY ([currentLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[student_level_progress] ADD CONSTRAINT [student_level_progress_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[student_level_progress] ADD CONSTRAINT [student_level_progress_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[student_level_progress] ADD CONSTRAINT [student_level_progress_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[student_level_progress] ADD CONSTRAINT [student_level_progress_courseLevelId_fkey] FOREIGN KEY ([courseLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[student_course_progress] ADD CONSTRAINT [student_course_progress_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[student_course_progress] ADD CONSTRAINT [student_course_progress_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[student_course_progress] ADD CONSTRAINT [student_course_progress_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[student_course_progress] ADD CONSTRAINT [student_course_progress_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[level_subject_prerequisite_groups] ADD CONSTRAINT [level_subject_prerequisite_groups_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_subject_prerequisite_groups] ADD CONSTRAINT [level_subject_prerequisite_groups_levelSubjectId_fkey] FOREIGN KEY ([levelSubjectId]) REFERENCES [dbo].[level_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[level_subject_prerequisite_items] ADD CONSTRAINT [level_subject_prerequisite_items_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_subject_prerequisite_items] ADD CONSTRAINT [level_subject_prerequisite_items_prerequisiteGroupId_fkey] FOREIGN KEY ([prerequisiteGroupId]) REFERENCES [dbo].[level_subject_prerequisite_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_subject_prerequisite_items] ADD CONSTRAINT [level_subject_prerequisite_items_prerequisiteLevelSubjectId_fkey] FOREIGN KEY ([prerequisiteLevelSubjectId]) REFERENCES [dbo].[level_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[prerequisite_waivers] ADD CONSTRAINT [prerequisite_waivers_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[prerequisite_waivers] ADD CONSTRAINT [prerequisite_waivers_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[prerequisite_waivers] ADD CONSTRAINT [prerequisite_waivers_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[prerequisite_waivers] ADD CONSTRAINT [prerequisite_waivers_levelSubjectId_fkey] FOREIGN KEY ([levelSubjectId]) REFERENCES [dbo].[level_subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[prerequisite_waivers] ADD CONSTRAINT [prerequisite_waivers_prerequisiteGroupId_fkey] FOREIGN KEY ([prerequisiteGroupId]) REFERENCES [dbo].[level_subject_prerequisite_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[prerequisite_waivers] ADD CONSTRAINT [prerequisite_waivers_prerequisiteItemId_fkey] FOREIGN KEY ([prerequisiteItemId]) REFERENCES [dbo].[level_subject_prerequisite_items]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[level_progression_policies] ADD CONSTRAINT [level_progression_policies_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_progression_policies] ADD CONSTRAINT [level_progression_policies_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_progression_policies] ADD CONSTRAINT [level_progression_policies_fromLevelId_fkey] FOREIGN KEY ([fromLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_progression_policies] ADD CONSTRAINT [level_progression_policies_toLevelId_fkey] FOREIGN KEY ([toLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[level_progression_requests] ADD CONSTRAINT [level_progression_requests_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_progression_requests] ADD CONSTRAINT [level_progression_requests_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_progression_requests] ADD CONSTRAINT [level_progression_requests_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_progression_requests] ADD CONSTRAINT [level_progression_requests_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_progression_requests] ADD CONSTRAINT [level_progression_requests_policyId_fkey] FOREIGN KEY ([policyId]) REFERENCES [dbo].[level_progression_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_progression_requests] ADD CONSTRAINT [level_progression_requests_fromLevelId_fkey] FOREIGN KEY ([fromLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[level_progression_requests] ADD CONSTRAINT [level_progression_requests_toLevelId_fkey] FOREIGN KEY ([toLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
