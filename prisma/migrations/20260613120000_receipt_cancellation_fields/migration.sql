BEGIN TRY

BEGIN TRAN;

-- Add cancellation tracking fields to receipts.
-- These remain NULL for ISSUED receipts; populated atomically when a
-- receipt transitions to CANCELLED via payment cancellation.
ALTER TABLE [dbo].[receipts] ADD
  [cancelledAt]        DATETIME2,
  [cancelledBy]        NVARCHAR(1000),
  [cancellationReason] NVARCHAR(1000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
