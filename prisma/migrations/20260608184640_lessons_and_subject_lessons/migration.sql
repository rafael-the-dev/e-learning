BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[lessons] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [summary] NVARCHAR(max),
    [objectives] NVARCHAR(max),
    [durationMinutes] INT,
    [lessonType] NVARCHAR(1000) NOT NULL CONSTRAINT [lessons_lessonType_df] DEFAULT 'TEXT',
    [videoProvider] NVARCHAR(1000) NOT NULL CONSTRAINT [lessons_videoProvider_df] DEFAULT 'NONE',
    [videoUrl] NVARCHAR(max),
    [externalVideoId] NVARCHAR(1000),
    [thumbnailUrl] NVARCHAR(max),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [lessons_status_df] DEFAULT 'DRAFT',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [lessons_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [lessons_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [lessons_organizationId_slug_key] UNIQUE NONCLUSTERED ([organizationId],[slug])
);

-- CreateTable
CREATE TABLE [dbo].[lesson_attachments] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [lessonId] NVARCHAR(1000) NOT NULL,
    [fileName] NVARCHAR(1000) NOT NULL,
    [fileUrl] NVARCHAR(max) NOT NULL,
    [fileType] NVARCHAR(1000) NOT NULL CONSTRAINT [lesson_attachments_fileType_df] DEFAULT 'OTHER',
    [fileSize] INT,
    [isDownloadable] BIT NOT NULL CONSTRAINT [lesson_attachments_isDownloadable_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [lesson_attachments_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [lesson_attachments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [lesson_attachments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[subject_lessons] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [subjectId] NVARCHAR(1000) NOT NULL,
    [lessonId] NVARCHAR(1000) NOT NULL,
    [order] INT NOT NULL CONSTRAINT [subject_lessons_order_df] DEFAULT 0,
    [isRequired] BIT NOT NULL CONSTRAINT [subject_lessons_isRequired_df] DEFAULT 0,
    [minWatchPercentage] INT NOT NULL CONSTRAINT [subject_lessons_minWatchPercentage_df] DEFAULT 0,
    [unlockAfterLessonId] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [subject_lessons_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [subject_lessons_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [subject_lessons_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [subject_lessons_subjectId_lessonId_key] UNIQUE NONCLUSTERED ([subjectId],[lessonId]),
    CONSTRAINT [subject_lessons_subjectId_order_key] UNIQUE NONCLUSTERED ([subjectId],[order])
);

-- CreateTable
CREATE TABLE [dbo].[student_lesson_progress] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [subjectId] NVARCHAR(1000) NOT NULL,
    [lessonId] NVARCHAR(1000) NOT NULL,
    [subjectLessonId] NVARCHAR(1000),
    [watchedSeconds] INT NOT NULL CONSTRAINT [student_lesson_progress_watchedSeconds_df] DEFAULT 0,
    [progressPercentage] DECIMAL(5,2) NOT NULL CONSTRAINT [student_lesson_progress_progressPercentage_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_lesson_progress_status_df] DEFAULT 'NOT_STARTED',
    [completedAt] DATETIME2,
    [lastAccessedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_lesson_progress_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [student_lesson_progress_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [student_lesson_progress_studentId_enrollmentId_lessonId_key] UNIQUE NONCLUSTERED ([studentId],[enrollmentId],[lessonId])
);

-- AddForeignKey
ALTER TABLE [dbo].[lessons] ADD CONSTRAINT [lessons_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lesson_attachments] ADD CONSTRAINT [lesson_attachments_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lesson_attachments] ADD CONSTRAINT [lesson_attachments_lessonId_fkey] FOREIGN KEY ([lessonId]) REFERENCES [dbo].[lessons]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[subject_lessons] ADD CONSTRAINT [subject_lessons_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[subject_lessons] ADD CONSTRAINT [subject_lessons_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [dbo].[subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[subject_lessons] ADD CONSTRAINT [subject_lessons_lessonId_fkey] FOREIGN KEY ([lessonId]) REFERENCES [dbo].[lessons]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[subject_lessons] ADD CONSTRAINT [subject_lessons_unlockAfterLessonId_fkey] FOREIGN KEY ([unlockAfterLessonId]) REFERENCES [dbo].[subject_lessons]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_lesson_progress] ADD CONSTRAINT [student_lesson_progress_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_lesson_progress] ADD CONSTRAINT [student_lesson_progress_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_lesson_progress] ADD CONSTRAINT [student_lesson_progress_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_lesson_progress] ADD CONSTRAINT [student_lesson_progress_lessonId_fkey] FOREIGN KEY ([lessonId]) REFERENCES [dbo].[lessons]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_lesson_progress] ADD CONSTRAINT [student_lesson_progress_subjectLessonId_fkey] FOREIGN KEY ([subjectLessonId]) REFERENCES [dbo].[subject_lessons]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
