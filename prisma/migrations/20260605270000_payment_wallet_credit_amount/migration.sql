-- PaymentAllocation module migration
-- Replaces the planned walletCreditAmount addition with the full allocation architecture.

BEGIN TRY
BEGIN TRAN;

-- =========================================================
-- 1. Expand invoice_items
-- =========================================================

ALTER TABLE [dbo].[invoice_items] ADD [feeDefinitionId] NVARCHAR(1000);

ALTER TABLE [dbo].[invoice_items] ADD [itemType] NVARCHAR(1000) NOT NULL
    CONSTRAINT [invoice_items_itemType_df] DEFAULT 'OTHER';

ALTER TABLE [dbo].[invoice_items] ADD [paidAmount] DECIMAL(10,2) NOT NULL
    CONSTRAINT [invoice_items_paidAmount_df] DEFAULT 0;

ALTER TABLE [dbo].[invoice_items] ADD [balanceAmount] DECIMAL(10,2) NOT NULL
    CONSTRAINT [invoice_items_balanceAmount_df] DEFAULT 0;

ALTER TABLE [dbo].[invoice_items] ADD [priority] INT NOT NULL
    CONSTRAINT [invoice_items_priority_df] DEFAULT 7;

ALTER TABLE [dbo].[invoice_items] ADD [status] NVARCHAR(1000) NOT NULL
    CONSTRAINT [invoice_items_status_df] DEFAULT 'PENDING';

ALTER TABLE [dbo].[invoice_items] ADD [createdAt] DATETIME2 NOT NULL
    CONSTRAINT [invoice_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE [dbo].[invoice_items] ADD [updatedAt] DATETIME2 NOT NULL
    CONSTRAINT [invoice_items_updatedAt_df] DEFAULT CURRENT_TIMESTAMP;

-- Initialize balanceAmount = totalPrice for all existing items (all have paidAmount = 0 since the column was just added)
-- EXEC used to defer compilation so the new column is visible at runtime
EXEC('UPDATE [dbo].[invoice_items] SET [balanceAmount] = [totalPrice]');

-- =========================================================
-- 2. Clean up Payment: remove denormalized/derived columns
-- =========================================================

-- Drop DEFAULT constraint on 'method' before dropping the column
ALTER TABLE [dbo].[payments] DROP CONSTRAINT [payments_method_df];
ALTER TABLE [dbo].[payments] DROP COLUMN [method];

-- Drop 'reference' (nullable, no constraint)
ALTER TABLE [dbo].[payments] DROP COLUMN [reference];

-- Drop 'invoiceAppliedAmount' (nullable, no constraint)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.payments') AND name = 'invoiceAppliedAmount')
    ALTER TABLE [dbo].[payments] DROP COLUMN [invoiceAppliedAmount];

-- =========================================================
-- 3. Create payment_allocations table
-- =========================================================

CREATE TABLE [dbo].[payment_allocations] (
    [id]                  NVARCHAR(1000) NOT NULL,
    [organizationId]      NVARCHAR(1000) NOT NULL,
    [paymentId]           NVARCHAR(1000),
    [creditApplicationId] NVARCHAR(1000),
    [invoiceId]           NVARCHAR(1000) NOT NULL,
    [invoiceItemId]       NVARCHAR(1000) NOT NULL,
    [amount]              DECIMAL(10,2)  NOT NULL,
    [allocationType]      NVARCHAR(1000) NOT NULL
        CONSTRAINT [payment_allocations_allocationType_df] DEFAULT 'PAYMENT',
    [createdAt]           DATETIME2      NOT NULL
        CONSTRAINT [payment_allocations_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy]           NVARCHAR(1000),
    CONSTRAINT [payment_allocations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- Foreign keys for payment_allocations
ALTER TABLE [dbo].[payment_allocations] ADD CONSTRAINT [payment_allocations_organizationId_fkey]
    FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[payment_allocations] ADD CONSTRAINT [payment_allocations_paymentId_fkey]
    FOREIGN KEY ([paymentId]) REFERENCES [dbo].[payments]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[payment_allocations] ADD CONSTRAINT [payment_allocations_creditApplicationId_fkey]
    FOREIGN KEY ([creditApplicationId]) REFERENCES [dbo].[credit_applications]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[payment_allocations] ADD CONSTRAINT [payment_allocations_invoiceId_fkey]
    FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[payment_allocations] ADD CONSTRAINT [payment_allocations_invoiceItemId_fkey]
    FOREIGN KEY ([invoiceItemId]) REFERENCES [dbo].[invoice_items]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRAN;
    THROW;
END CATCH
