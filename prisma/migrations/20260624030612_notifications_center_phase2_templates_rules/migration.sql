BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[notifications] DROP CONSTRAINT [notifications_updatedAt_df];

-- CreateTable
CREATE TABLE [dbo].[notification_templates] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [eventType] NVARCHAR(1000) NOT NULL,
    [channel] NVARCHAR(1000) NOT NULL CONSTRAINT [notification_templates_channel_df] DEFAULT 'IN_APP',
    [name] NVARCHAR(1000) NOT NULL,
    [subject] NVARCHAR(1000),
    [titleTemplate] NVARCHAR(max) NOT NULL,
    [bodyTemplate] NVARCHAR(max) NOT NULL,
    [variables] NVARCHAR(max) NOT NULL,
    [language] NVARCHAR(1000) NOT NULL CONSTRAINT [notification_templates_language_df] DEFAULT 'pt-PT',
    [isActive] BIT NOT NULL CONSTRAINT [notification_templates_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [notification_templates_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [notification_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[notification_event_rules] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [eventType] NVARCHAR(1000) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [notification_event_rules_enabled_df] DEFAULT 1,
    [channels] NVARCHAR(max) NOT NULL,
    [dedupeWindowMinutes] INT NOT NULL CONSTRAINT [notification_event_rules_dedupeWindowMinutes_df] DEFAULT 1440,
    [delayMinutes] INT NOT NULL CONSTRAINT [notification_event_rules_delayMinutes_df] DEFAULT 0,
    [priority] NVARCHAR(1000) NOT NULL CONSTRAINT [notification_event_rules_priority_df] DEFAULT 'NORMAL',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [notification_event_rules_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [notification_event_rules_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [notification_event_rules_organizationId_eventType_key] UNIQUE NONCLUSTERED ([organizationId],[eventType])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notification_templates_organizationId_eventType_channel_idx] ON [dbo].[notification_templates]([organizationId], [eventType], [channel]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notification_templates_organizationId_isActive_idx] ON [dbo].[notification_templates]([organizationId], [isActive]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notification_event_rules_organizationId_eventType_idx] ON [dbo].[notification_event_rules]([organizationId], [eventType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notification_event_rules_organizationId_enabled_idx] ON [dbo].[notification_event_rules]([organizationId], [enabled]);

-- AddForeignKey
ALTER TABLE [dbo].[notification_templates] ADD CONSTRAINT [notification_templates_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[notification_event_rules] ADD CONSTRAINT [notification_event_rules_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
