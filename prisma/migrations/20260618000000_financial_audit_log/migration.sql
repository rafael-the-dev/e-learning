-- CreateTable: financial_audit_logs
-- Append-only domain audit trail for all financial events.
-- Never updated or deleted; enforced at the application level.

CREATE TABLE [dbo].[financial_audit_logs] (
    [id]             NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [eventType]      NVARCHAR(100)  NOT NULL,
    [entityType]     NVARCHAR(1000) NOT NULL,
    [entityId]       NVARCHAR(1000) NOT NULL,
    [performedBy]    NVARCHAR(1000) NULL,
    [performedAt]    DATETIME2      NOT NULL CONSTRAINT [financial_audit_logs_performedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [amount]         DECIMAL(18,2)  NULL,
    [currency]       NVARCHAR(10)   NOT NULL CONSTRAINT [financial_audit_logs_currency_df] DEFAULT 'MZN',
    [beforeData]     NVARCHAR(MAX)  NULL,
    [afterData]      NVARCHAR(MAX)  NULL,
    [metadata]       NVARCHAR(MAX)  NULL,
    [ipAddress]      NVARCHAR(100)  NULL,
    [userAgent]      NVARCHAR(MAX)  NULL,
    [createdAt]      DATETIME2      NOT NULL CONSTRAINT [financial_audit_logs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [financial_audit_logs_pkey] PRIMARY KEY ([id])
);

-- FK to organizations (NO ACTION — audit rows must survive org soft-deletes)
ALTER TABLE [dbo].[financial_audit_logs]
    ADD CONSTRAINT [financial_audit_logs_organizationId_fkey]
    FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Indexes for filtering and reporting queries
CREATE INDEX [financial_audit_logs_org_entity_idx]    ON [dbo].[financial_audit_logs] ([organizationId], [entityType], [entityId]);
CREATE INDEX [financial_audit_logs_org_event_idx]     ON [dbo].[financial_audit_logs] ([organizationId], [eventType]);
CREATE INDEX [financial_audit_logs_org_performed_idx] ON [dbo].[financial_audit_logs] ([organizationId], [performedAt]);
CREATE INDEX [financial_audit_logs_org_actor_idx]     ON [dbo].[financial_audit_logs] ([organizationId], [performedBy]);
