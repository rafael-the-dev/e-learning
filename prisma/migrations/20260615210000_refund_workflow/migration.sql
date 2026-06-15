BEGIN TRY

BEGIN TRAN;

-- Add refundMethod to refunds table.
-- CASH_RETURN: money returned outside wallet.
-- WALLET_CREDIT: refund amount credited to student wallet.
ALTER TABLE [dbo].[refunds] ADD
    [refundMethod] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_refunds_refundMethod] DEFAULT 'CASH_RETURN';

-- Add refundedAmount to receipts table to support partial-refund tracking.
-- Status PARTIALLY_REFUNDED is enforced at the application layer (Receipt.status is a String).
ALTER TABLE [dbo].[receipts] ADD
    [refundedAmount] DECIMAL(10, 2) NOT NULL CONSTRAINT [DF_receipts_refundedAmount] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
