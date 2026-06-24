BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[notification_deliveries] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [notificationId] NVARCHAR(1000) NOT NULL,
    [channel] NVARCHAR(1000) NOT NULL,
    [recipient] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [notification_deliveries_status_df] DEFAULT 'PENDING',
    [provider] NVARCHAR(1000),
    [providerMessageId] NVARCHAR(1000),
    [attempts] INT NOT NULL CONSTRAINT [notification_deliveries_attempts_df] DEFAULT 0,
    [maxAttempts] INT NOT NULL CONSTRAINT [notification_deliveries_maxAttempts_df] DEFAULT 3,
    [lastAttemptAt] DATETIME2,
    [nextAttemptAt] DATETIME2,
    [sentAt] DATETIME2,
    [deliveredAt] DATETIME2,
    [failedAt] DATETIME2,
    [cancelledAt] DATETIME2,
    [failureReason] NVARCHAR(max),
    [metadata] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [notification_deliveries_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [notification_deliveries_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notification_deliveries_organizationId_status_channel_createdAt_idx] ON [dbo].[notification_deliveries]([organizationId], [status], [channel], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notification_deliveries_notificationId_idx] ON [dbo].[notification_deliveries]([notificationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notification_deliveries_organizationId_nextAttemptAt_status_idx] ON [dbo].[notification_deliveries]([organizationId], [nextAttemptAt], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notification_deliveries_organizationId_channel_createdAt_idx] ON [dbo].[notification_deliveries]([organizationId], [channel], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[notification_deliveries] ADD CONSTRAINT [notification_deliveries_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[notification_deliveries] ADD CONSTRAINT [notification_deliveries_notificationId_fkey] FOREIGN KEY ([notificationId]) REFERENCES [dbo].[notifications]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
