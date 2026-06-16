BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[financial_transactions] DROP CONSTRAINT [DF_financial_transactions_currencyCode];
EXEC SP_RENAME N'dbo.PK_financial_transactions', N'financial_transactions_pkey';
ALTER TABLE [dbo].[financial_transactions] ADD CONSTRAINT [financial_transactions_currencyCode_df] DEFAULT 'MZN' FOR [currencyCode];

-- AlterTable
ALTER TABLE [dbo].[organization_settings] DROP CONSTRAINT [DF_org_settings_enableAutomaticOverdueProcessing],
[DF_org_settings_markInvoiceOverdueWhenAny],
[DF_org_settings_notifyOnOverdue],
[DF_org_settings_overdueGraceDays],
[DF_org_settings_overdueNotificationDelayDays];
ALTER TABLE [dbo].[organization_settings] ADD CONSTRAINT [organization_settings_enableAutomaticOverdueProcessing_df] DEFAULT 1 FOR [enableAutomaticOverdueProcessing], CONSTRAINT [organization_settings_markInvoiceOverdueWhenAnyInstallmentOverdue_df] DEFAULT 1 FOR [markInvoiceOverdueWhenAnyInstallmentOverdue], CONSTRAINT [organization_settings_notifyOnOverdue_df] DEFAULT 1 FOR [notifyOnOverdue], CONSTRAINT [organization_settings_overdueGraceDays_df] DEFAULT 0 FOR [overdueGraceDays], CONSTRAINT [organization_settings_overdueNotificationDelayDays_df] DEFAULT 0 FOR [overdueNotificationDelayDays];

-- AlterTable
ALTER TABLE [dbo].[receipts] DROP CONSTRAINT [DF_receipts_refundedAmount];
ALTER TABLE [dbo].[receipts] ADD CONSTRAINT [receipts_refundedAmount_df] DEFAULT 0 FOR [refundedAmount];

-- AlterTable
ALTER TABLE [dbo].[refunds] DROP CONSTRAINT [DF_refunds_refundMethod],
[DF_refunds_status];
EXEC SP_RENAME N'dbo.PK_refunds', N'refunds_pkey';
ALTER TABLE [dbo].[refunds] ADD CONSTRAINT [refunds_refundMethod_df] DEFAULT 'CASH_RETURN' FOR [refundMethod], CONSTRAINT [refunds_status_df] DEFAULT 'REQUESTED' FOR [status];

-- RenameForeignKey
EXEC sp_rename 'dbo.FK_financial_transactions_organization', 'financial_transactions_organizationId_fkey', 'OBJECT';

-- RenameForeignKey
EXEC sp_rename 'dbo.FK_refunds_organizations', 'refunds_organizationId_fkey', 'OBJECT';

-- RenameForeignKey
EXEC sp_rename 'dbo.FK_refunds_payments', 'refunds_paymentId_fkey', 'OBJECT';

-- AddForeignKey
ALTER TABLE [dbo].[refunds] ADD CONSTRAINT [refunds_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[refunds] ADD CONSTRAINT [refunds_receiptId_fkey] FOREIGN KEY ([receiptId]) REFERENCES [dbo].[receipts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[refunds] ADD CONSTRAINT [refunds_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[refunds] ADD CONSTRAINT [refunds_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[refunds] ADD CONSTRAINT [refunds_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- RenameIndex
EXEC SP_RENAME N'dbo.financial_transactions.financial_transactions_orgId_invoiceId_idx', N'financial_transactions_organizationId_invoiceId_idx', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.financial_transactions.financial_transactions_orgId_occurredAt_idx', N'financial_transactions_organizationId_occurredAt_idx', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.financial_transactions.financial_transactions_orgId_paymentId_idx', N'financial_transactions_organizationId_paymentId_idx', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.financial_transactions.financial_transactions_orgId_studentId_idx', N'financial_transactions_organizationId_studentId_idx', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.financial_transactions.financial_transactions_orgId_txnNumber_key', N'financial_transactions_organizationId_transactionNumber_key', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.financial_transactions.financial_transactions_orgId_type_idx', N'financial_transactions_organizationId_transactionType_idx', N'INDEX';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
