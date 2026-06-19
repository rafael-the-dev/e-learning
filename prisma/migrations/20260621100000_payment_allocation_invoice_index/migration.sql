BEGIN TRY

BEGIN TRAN;

-- =============================================================================
-- PAYMENT ALLOCATION INDEX — Financial Reconciliation Report
-- payment_allocations had no index beyond its primary key. The reconciliation
-- report's "Invoice.paidAmount vs SUM(PaymentAllocation.amount)" check groups
-- by invoiceId scoped to organizationId — without this index it is a full
-- table scan at scale.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'payment_allocations_org_invoice_idx' AND object_id = OBJECT_ID('payment_allocations'))
  CREATE NONCLUSTERED INDEX [payment_allocations_org_invoice_idx]
    ON [dbo].[payment_allocations] ([organizationId], [invoiceId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
