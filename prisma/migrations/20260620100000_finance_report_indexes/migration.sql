BEGIN TRY

BEGIN TRAN;

-- =============================================================================
-- FINANCE REPORT INDEXES
-- Composite indexes that match the WHERE / ORDER BY patterns used by finance
-- report queries. All created with IF NOT EXISTS guards so the migration is
-- safe to re-run and does not conflict with prior migrations.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- INVOICE
-- #1/#2/#3 already exist (from schema baseline).
-- -----------------------------------------------------------------------------

-- #4: Branch Revenue Report, branch-filtered AR/Aging dashboards
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'invoices_org_branch_status_issuedate_idx' AND object_id = OBJECT_ID('invoices'))
  CREATE NONCLUSTERED INDEX [invoices_org_branch_status_issuedate_idx]
    ON [dbo].[invoices] ([organizationId], [branchId], [status], [issueDate]);

-- #5: Course Revenue Report, enrollment financial history
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'invoices_org_enrollment_status_idx' AND object_id = OBJECT_ID('invoices'))
  CREATE NONCLUSTERED INDEX [invoices_org_enrollment_status_idx]
    ON [dbo].[invoices] ([organizationId], [enrollmentId], [status]);

-- -----------------------------------------------------------------------------
-- PAYMENT
-- -----------------------------------------------------------------------------

-- #6: Payments Report, payment date filters, cash-flow support
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'payments_org_status_paymentdate_idx' AND object_id = OBJECT_ID('payments'))
  CREATE NONCLUSTERED INDEX [payments_org_status_paymentdate_idx]
    ON [dbo].[payments] ([organizationId], [status], [paymentDate]);

-- #7: Branch Revenue Report, branch payment trends
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'payments_org_branch_status_paymentdate_idx' AND object_id = OBJECT_ID('payments'))
  CREATE NONCLUSTERED INDEX [payments_org_branch_status_paymentdate_idx]
    ON [dbo].[payments] ([organizationId], [branchId], [status], [paymentDate]);

-- #8: Invoice payment history, student statement, refund/payment reconciliation
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'payments_org_invoice_status_idx' AND object_id = OBJECT_ID('payments'))
  CREATE NONCLUSTERED INDEX [payments_org_invoice_status_idx]
    ON [dbo].[payments] ([organizationId], [invoiceId], [status]);

-- -----------------------------------------------------------------------------
-- PAYMENT SPLIT
-- -----------------------------------------------------------------------------

-- #9: Payment Method Mix report, Payments Report method filters
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'payment_splits_org_method_createdat_idx' AND object_id = OBJECT_ID('payment_splits'))
  CREATE NONCLUSTERED INDEX [payment_splits_org_method_createdat_idx]
    ON [dbo].[payment_splits] ([organizationId], [method], [createdAt]);

-- #10: Payment detail drilldown, method breakdown
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'payment_splits_payment_method_idx' AND object_id = OBJECT_ID('payment_splits'))
  CREATE NONCLUSTERED INDEX [payment_splits_payment_method_idx]
    ON [dbo].[payment_splits] ([paymentId], [method]);

-- -----------------------------------------------------------------------------
-- STUDENT WALLET TRANSACTION
-- #11 (studentWalletId, createdAt) — already created in 20260619100000_wallet_indexes
-- #12 (organizationId, type, createdAt) — already created in 20260619100000_wallet_indexes
-- -----------------------------------------------------------------------------

-- #13: Wallet activity trends, wallet liability period movement
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'swt_org_createdat_idx' AND object_id = OBJECT_ID('student_wallet_transactions'))
  CREATE NONCLUSTERED INDEX [swt_org_createdat_idx]
    ON [dbo].[student_wallet_transactions] ([organizationId], [createdAt]);

-- -----------------------------------------------------------------------------
-- FINANCIAL TRANSACTION
-- Existing single-column indexes remain. These composites improve multi-filter
-- queries without making the simpler indexes redundant for their own patterns.
-- -----------------------------------------------------------------------------

-- #14: Cash Flow, Ledger timeline, Reconciliation reports (type + date filter)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'financial_tx_org_type_occurredat_idx' AND object_id = OBJECT_ID('financial_transactions'))
  CREATE NONCLUSTERED INDEX [financial_tx_org_type_occurredat_idx]
    ON [dbo].[financial_transactions] ([organizationId], [transactionType], [occurredAt]);

-- #15: Entity reconciliation, ledger lookup by sourceType + sourceId
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'financial_tx_org_source_ref_idx' AND object_id = OBJECT_ID('financial_transactions'))
  CREATE NONCLUSTERED INDEX [financial_tx_org_source_ref_idx]
    ON [dbo].[financial_transactions] ([organizationId], [sourceType], [sourceId]);

-- #16: Student Financial Statement ledger timeline (student + date range)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'financial_tx_org_student_occurredat_idx' AND object_id = OBJECT_ID('financial_transactions'))
  CREATE NONCLUSTERED INDEX [financial_tx_org_student_occurredat_idx]
    ON [dbo].[financial_transactions] ([organizationId], [studentId], [occurredAt]);

-- -----------------------------------------------------------------------------
-- REFUND
-- -----------------------------------------------------------------------------

-- #17: Refund Report, Refund Analysis (status + date filter)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'refunds_org_status_createdat_idx' AND object_id = OBJECT_ID('refunds'))
  CREATE NONCLUSTERED INDEX [refunds_org_status_createdat_idx]
    ON [dbo].[refunds] ([organizationId], [status], [createdAt]);

-- #18: Refundable amount calculation, payment refund history
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'refunds_org_payment_status_idx' AND object_id = OBJECT_ID('refunds'))
  CREATE NONCLUSTERED INDEX [refunds_org_payment_status_idx]
    ON [dbo].[refunds] ([organizationId], [paymentId], [status]);

-- -----------------------------------------------------------------------------
-- INSTALLMENT
-- -----------------------------------------------------------------------------

-- #19: Collections Report, overdue installments, installment aging
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'installments_org_status_duedate_idx' AND object_id = OBJECT_ID('installments'))
  CREATE NONCLUSTERED INDEX [installments_org_status_duedate_idx]
    ON [dbo].[installments] ([organizationId], [status], [dueDate]);

-- #20: Invoice payment plan detail, installment reconciliation
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'installments_org_invoice_status_idx' AND object_id = OBJECT_ID('installments'))
  CREATE NONCLUSTERED INDEX [installments_org_invoice_status_idx]
    ON [dbo].[installments] ([organizationId], [invoiceId], [status]);

-- -----------------------------------------------------------------------------
-- FINANCIAL INTEGRITY ISSUE
-- Existing: (org, severity), (org, category), (org, status, detectedAt),
--           (org, entityType, entityId).
-- -----------------------------------------------------------------------------

-- #21: Combined status + severity filter — e.g. "OPEN CRITICAL issues" (integrity banner)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'fii_org_status_severity_idx' AND object_id = OBJECT_ID('financial_integrity_issues'))
  CREATE NONCLUSTERED INDEX [fii_org_status_severity_idx]
    ON [dbo].[financial_integrity_issues] ([organizationId], [status], [severity]);

-- #22: Combined category + status filter — integrity report category drilldown
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'fii_org_category_status_idx' AND object_id = OBJECT_ID('financial_integrity_issues'))
  CREATE NONCLUSTERED INDEX [fii_org_category_status_idx]
    ON [dbo].[financial_integrity_issues] ([organizationId], [category], [status]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
