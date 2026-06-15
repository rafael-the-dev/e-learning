BEGIN TRY

BEGIN TRAN;

-- SQL SEQUENCE for append-only transaction numbers (TXN-000001 format)
CREATE SEQUENCE [dbo].[FinancialTransactionSequence]
    START WITH 1
    INCREMENT BY 1
    NO CACHE;

-- financial_transactions: append-only financial journal
-- CRITICAL: This table must never be updated or deleted from application code.
--           It is the authoritative audit trail for all financial movements.
CREATE TABLE [dbo].[financial_transactions] (
    [id]                NVARCHAR(1000) NOT NULL
        CONSTRAINT [PK_financial_transactions] PRIMARY KEY,

    [organizationId]    NVARCHAR(1000) NOT NULL,
    [transactionNumber] NVARCHAR(1000) NOT NULL,

    -- FinancialTransactionType:
    --   INVOICE_CREATED | INVOICE_CANCELLED |
    --   PAYMENT_RECEIVED | PAYMENT_CANCELLED |
    --   CREDIT_APPLIED |
    --   WALLET_CREDIT | WALLET_DEBIT |
    --   REFUND_DISBURSED | RECEIPT_ISSUED
    [transactionType]   NVARCHAR(1000) NOT NULL,

    -- FinancialDirection: CREDIT | DEBIT  (from organization's perspective)
    [direction]         NVARCHAR(1000) NOT NULL,

    [amount]            DECIMAL(10, 2) NOT NULL,
    [currencyCode]      NVARCHAR(1000) NOT NULL
        CONSTRAINT [DF_financial_transactions_currencyCode] DEFAULT 'MZN',

    -- Source entity that caused this journal entry
    -- sourceType: "Invoice" | "Payment" | "Receipt" | "Refund" |
    --             "WalletTransaction" | "CreditApplication"
    [sourceType]        NVARCHAR(1000) NOT NULL,
    [sourceId]          NVARCHAR(1000) NOT NULL,

    -- Cross-references for reconciliation and reporting queries
    [invoiceId]         NVARCHAR(1000) NULL,
    [paymentId]         NVARCHAR(1000) NULL,
    [receiptId]         NVARCHAR(1000) NULL,
    [refundId]          NVARCHAR(1000) NULL,
    [studentId]         NVARCHAR(1000) NULL,
    [enrollmentId]      NVARCHAR(1000) NULL,

    [description]       NVARCHAR(MAX) NULL,
    [actorId]           NVARCHAR(1000) NULL,

    -- occurredAt = when the business event happened (may differ from createdAt
    --              if entries are written slightly after the originating event)
    [occurredAt]        DATETIME2 NOT NULL
        CONSTRAINT [DF_financial_transactions_occurredAt] DEFAULT GETDATE(),
    [createdAt]         DATETIME2 NOT NULL
        CONSTRAINT [DF_financial_transactions_createdAt]  DEFAULT GETDATE()
);

-- Tenant + sequence uniqueness
CREATE UNIQUE INDEX [financial_transactions_orgId_txnNumber_key]
    ON [dbo].[financial_transactions] ([organizationId], [transactionNumber]);

-- Query indexes (all scoped to tenant)
CREATE INDEX [financial_transactions_orgId_invoiceId_idx]
    ON [dbo].[financial_transactions] ([organizationId], [invoiceId]);

CREATE INDEX [financial_transactions_orgId_paymentId_idx]
    ON [dbo].[financial_transactions] ([organizationId], [paymentId]);

CREATE INDEX [financial_transactions_orgId_studentId_idx]
    ON [dbo].[financial_transactions] ([organizationId], [studentId]);

CREATE INDEX [financial_transactions_orgId_occurredAt_idx]
    ON [dbo].[financial_transactions] ([organizationId], [occurredAt]);

CREATE INDEX [financial_transactions_orgId_type_idx]
    ON [dbo].[financial_transactions] ([organizationId], [transactionType]);

-- FK to organizations — NoAction: ledger entries survive org soft-deletes
ALTER TABLE [dbo].[financial_transactions]
    ADD CONSTRAINT [FK_financial_transactions_organization]
    FOREIGN KEY ([organizationId])
    REFERENCES [dbo].[organizations] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
