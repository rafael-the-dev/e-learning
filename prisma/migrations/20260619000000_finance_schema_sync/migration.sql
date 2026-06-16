/*
  Warnings:

  - You are about to alter the column `userAgent` on the `financial_audit_logs` table. The data in that column could be lost. The data in that column will be cast from `NVarChar(Max)` to `NVarChar(1000)`.

*/
BEGIN TRY

BEGIN TRAN;

-- DropIndex
DROP INDEX [financial_audit_logs_org_event_idx] ON [dbo].[financial_audit_logs];

-- DropIndex
DROP INDEX [idx_fii_category] ON [dbo].[financial_integrity_issues];

-- DropIndex
DROP INDEX [idx_fii_entity] ON [dbo].[financial_integrity_issues];

-- DropIndex
DROP INDEX [idx_fii_severity] ON [dbo].[financial_integrity_issues];

-- DropIndex
DROP INDEX [idx_fii_status_date] ON [dbo].[financial_integrity_issues];

-- Drop filtered unique index before altering [status] column (SQL Server error 5074 otherwise)
DROP INDEX [uq_open_integrity_issue] ON [dbo].[financial_integrity_issues];

-- AlterTable
ALTER TABLE [dbo].[financial_audit_logs] ALTER COLUMN [eventType] NVARCHAR(1000) NOT NULL;
ALTER TABLE [dbo].[financial_audit_logs] ALTER COLUMN [currency] NVARCHAR(1000) NOT NULL;
ALTER TABLE [dbo].[financial_audit_logs] ALTER COLUMN [ipAddress] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[financial_audit_logs] ALTER COLUMN [userAgent] NVARCHAR(1000) NULL;

-- AlterTable
ALTER TABLE [dbo].[financial_integrity_issues] DROP CONSTRAINT [DF_fii_status],
[DF_fii_updatedAt];
EXEC SP_RENAME N'dbo.PK_financial_integrity_issues', N'financial_integrity_issues_pkey';
ALTER TABLE [dbo].[financial_integrity_issues] ALTER COLUMN [severity] NVARCHAR(1000) NOT NULL;
ALTER TABLE [dbo].[financial_integrity_issues] ALTER COLUMN [category] NVARCHAR(1000) NOT NULL;
ALTER TABLE [dbo].[financial_integrity_issues] ALTER COLUMN [checkName] NVARCHAR(1000) NOT NULL;
ALTER TABLE [dbo].[financial_integrity_issues] ALTER COLUMN [entityType] NVARCHAR(1000) NOT NULL;
ALTER TABLE [dbo].[financial_integrity_issues] ALTER COLUMN [expectedValue] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[financial_integrity_issues] ALTER COLUMN [actualValue] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[financial_integrity_issues] ALTER COLUMN [status] NVARCHAR(1000) NOT NULL;
ALTER TABLE [dbo].[financial_integrity_issues] ADD CONSTRAINT [financial_integrity_issues_status_df] DEFAULT 'OPEN' FOR [status];

-- Recreate filtered unique deduplication guard (must be after ALTER COLUMN [status])
CREATE UNIQUE INDEX [uq_open_integrity_issue]
    ON [dbo].[financial_integrity_issues] ([organizationId], [entityType], [entityId], [checkName])
    WHERE [status] = 'OPEN';

-- CreateIndex
CREATE NONCLUSTERED INDEX [financial_integrity_issues_organizationId_severity_idx] ON [dbo].[financial_integrity_issues]([organizationId], [severity]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [financial_integrity_issues_organizationId_category_idx] ON [dbo].[financial_integrity_issues]([organizationId], [category]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [financial_integrity_issues_organizationId_status_detectedAt_idx] ON [dbo].[financial_integrity_issues]([organizationId], [status], [detectedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [financial_integrity_issues_organizationId_entityType_entityId_idx] ON [dbo].[financial_integrity_issues]([organizationId], [entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [financial_audit_logs_organizationId_eventType_idx] ON [dbo].[financial_audit_logs]([organizationId], [eventType]);

-- RenameForeignKey
EXEC sp_rename 'dbo.FK_fii_organizations', 'financial_integrity_issues_organizationId_fkey', 'OBJECT';

-- RenameIndex (only indexes NOT already dropped and recreated above)
EXEC SP_RENAME N'dbo.financial_audit_logs.financial_audit_logs_org_actor_idx', N'financial_audit_logs_organizationId_performedBy_idx', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.financial_audit_logs.financial_audit_logs_org_entity_idx', N'financial_audit_logs_organizationId_entityType_entityId_idx', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.financial_audit_logs.financial_audit_logs_org_performed_idx', N'financial_audit_logs_organizationId_performedAt_idx', N'INDEX';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
