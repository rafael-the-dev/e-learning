/*
  Phase 1 of the Notifications Center redefines the Notification model from a
  delivery-channel-oriented shape (channel/isRead/sentAt, PENDING|SENT|FAILED|READ
  status) to a read-state in-app inbox (severity/status/actionUrl/archivedAt,
  UNREAD|READ|ARCHIVED status).

  The 11 existing rows were written by CommunicationEventHandler /
  EnrollmentActivationEventHandler but were never surfaced by any UI (no
  bell/inbox existed before this migration), so they are discarded rather
  than backfilled into the new required-recipient shape.
*/
BEGIN TRY
BEGIN TRAN;

DELETE FROM [dbo].[notifications];

-- Columns that keep their meaning, renamed to match the new model
EXEC sp_rename 'dbo.notifications.userId', 'recipientUserId', 'COLUMN';
EXEC sp_rename 'dbo.notifications.data', 'metadata', 'COLUMN';
EXEC sp_rename 'dbo.notifications.body', 'message', 'COLUMN';
EXEC sp_rename 'dbo.notifications_userId_fkey', 'notifications_recipientUserId_fkey', 'OBJECT';

-- recipientUserId is mandatory in Phase 1 (table is empty after the DELETE above)
ALTER TABLE [dbo].[notifications] ALTER COLUMN [recipientUserId] NVARCHAR(1000) NOT NULL;

-- Drop delivery-channel concepts not used by the in-app-only Phase 1 model
ALTER TABLE [dbo].[notifications] DROP CONSTRAINT [notifications_channel_df];
ALTER TABLE [dbo].[notifications] DROP CONSTRAINT [notifications_isRead_df];
ALTER TABLE [dbo].[notifications] DROP COLUMN [channel], [isRead], [sentAt];

-- Replace the delivery-status default ('PENDING') with the read-status default ('UNREAD')
ALTER TABLE [dbo].[notifications] DROP CONSTRAINT [notifications_status_df];
ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_status_df] DEFAULT 'UNREAD' FOR [status];

-- New Phase 1 columns
ALTER TABLE [dbo].[notifications] ADD [severity] NVARCHAR(1000) NOT NULL
    CONSTRAINT [notifications_severity_df] DEFAULT 'INFO';

ALTER TABLE [dbo].[notifications] ADD [actionUrl] NVARCHAR(1000);

ALTER TABLE [dbo].[notifications] ADD [archivedAt] DATETIME2;

ALTER TABLE [dbo].[notifications] ADD [updatedAt] DATETIME2 NOT NULL
    CONSTRAINT [notifications_updatedAt_df] DEFAULT CURRENT_TIMESTAMP;

-- Inbox / bell query indexes
CREATE INDEX [notifications_organizationId_recipientUserId_status_createdAt_idx]
    ON [dbo].[notifications]([organizationId], [recipientUserId], [status], [createdAt]);

CREATE INDEX [notifications_organizationId_type_createdAt_idx]
    ON [dbo].[notifications]([organizationId], [type], [createdAt]);

COMMIT TRAN;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRAN;
    THROW;
END CATCH
