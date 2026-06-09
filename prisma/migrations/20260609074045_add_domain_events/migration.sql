BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[domain_events] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [eventType] NVARCHAR(1000) NOT NULL,
    [aggregateType] NVARCHAR(1000) NOT NULL,
    [aggregateId] NVARCHAR(1000) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [domain_events_status_df] DEFAULT 'PENDING',
    [occurredAt] DATETIME2 NOT NULL CONSTRAINT [domain_events_occurredAt_df] DEFAULT CURRENT_TIMESTAMP,
    [processedAt] DATETIME2,
    [failedAt] DATETIME2,
    [failureReason] NVARCHAR(max),
    [retryCount] INT NOT NULL CONSTRAINT [domain_events_retryCount_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [domain_events_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [domain_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[domain_event_handler_logs] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [eventId] NVARCHAR(1000) NOT NULL,
    [handlerName] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [domain_event_handler_logs_status_df] DEFAULT 'PENDING',
    [startedAt] DATETIME2,
    [completedAt] DATETIME2,
    [failedAt] DATETIME2,
    [failureReason] NVARCHAR(max),
    [retryCount] INT NOT NULL CONSTRAINT [domain_event_handler_logs_retryCount_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [domain_event_handler_logs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [domain_event_handler_logs_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [domain_event_handler_logs_eventId_handlerName_key] UNIQUE NONCLUSTERED ([eventId],[handlerName])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_events_organizationId_eventType_status_idx] ON [dbo].[domain_events]([organizationId], [eventType], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_events_organizationId_aggregateType_aggregateId_idx] ON [dbo].[domain_events]([organizationId], [aggregateType], [aggregateId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_events_organizationId_status_occurredAt_idx] ON [dbo].[domain_events]([organizationId], [status], [occurredAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_event_handler_logs_organizationId_eventId_idx] ON [dbo].[domain_event_handler_logs]([organizationId], [eventId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_event_handler_logs_organizationId_handlerName_status_idx] ON [dbo].[domain_event_handler_logs]([organizationId], [handlerName], [status]);

-- AddForeignKey
ALTER TABLE [dbo].[domain_events] ADD CONSTRAINT [domain_events_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[domain_event_handler_logs] ADD CONSTRAINT [domain_event_handler_logs_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[domain_event_handler_logs] ADD CONSTRAINT [domain_event_handler_logs_eventId_fkey] FOREIGN KEY ([eventId]) REFERENCES [dbo].[domain_events]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
