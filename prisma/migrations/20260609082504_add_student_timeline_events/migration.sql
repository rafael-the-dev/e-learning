BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[student_timeline_events] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [eventType] NVARCHAR(1000) NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [referenceType] NVARCHAR(1000),
    [referenceId] NVARCHAR(1000),
    [sourceEventId] NVARCHAR(1000),
    [actorUserId] NVARCHAR(1000),
    [visibility] NVARCHAR(1000) NOT NULL CONSTRAINT [student_timeline_events_visibility_df] DEFAULT 'INTERNAL',
    [metadata] NVARCHAR(max),
    [occurredAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_timeline_events_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [student_timeline_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_timeline_events_organizationId_studentId_occurredAt_idx] ON [dbo].[student_timeline_events]([organizationId], [studentId], [occurredAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_timeline_events_organizationId_studentId_eventType_idx] ON [dbo].[student_timeline_events]([organizationId], [studentId], [eventType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_timeline_events_sourceEventId_idx] ON [dbo].[student_timeline_events]([sourceEventId]);

-- AddForeignKey
ALTER TABLE [dbo].[student_timeline_events] ADD CONSTRAINT [student_timeline_events_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_timeline_events] ADD CONSTRAINT [student_timeline_events_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
