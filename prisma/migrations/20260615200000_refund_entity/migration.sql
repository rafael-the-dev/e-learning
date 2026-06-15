BEGIN TRY

BEGIN TRAN;

-- RefundSequence: starts at 1 (no existing refund numbers to seed from)
EXEC sp_executesql N'CREATE SEQUENCE [dbo].[RefundSequence] START WITH 1 INCREMENT BY 1 NO CACHE;';

-- refunds table
CREATE TABLE [dbo].[refunds] (
    [id]              NVARCHAR(1000) NOT NULL,
    [organizationId]  NVARCHAR(1000) NOT NULL,
    [branchId]        NVARCHAR(1000) NULL,
    [paymentId]       NVARCHAR(1000) NOT NULL,
    [receiptId]       NVARCHAR(1000) NULL,
    [studentId]       NVARCHAR(1000) NULL,
    [enrollmentId]    NVARCHAR(1000) NULL,
    [invoiceId]       NVARCHAR(1000) NULL,
    [refundNumber]    NVARCHAR(1000) NOT NULL,
    [amount]          DECIMAL(10,2)  NOT NULL,
    [reason]          NVARCHAR(MAX)  NOT NULL,
    -- RefundStatus: REQUESTED | APPROVED | REJECTED | COMPLETED
    [status]          NVARCHAR(1000) NOT NULL CONSTRAINT [DF_refunds_status] DEFAULT 'REQUESTED',
    [notes]           NVARCHAR(MAX)  NULL,
    [rejectionReason] NVARCHAR(MAX)  NULL,
    [requestedBy]     NVARCHAR(1000) NOT NULL,
    [approvedBy]      NVARCHAR(1000) NULL,
    [rejectedBy]      NVARCHAR(1000) NULL,
    [completedBy]     NVARCHAR(1000) NULL,
    [approvedAt]      DATETIME2      NULL,
    [rejectedAt]      DATETIME2      NULL,
    [completedAt]     DATETIME2      NULL,
    [createdAt]       DATETIME2      NOT NULL CONSTRAINT [DF_refunds_createdAt] DEFAULT GETDATE(),
    [updatedAt]       DATETIME2      NOT NULL,
    [deletedAt]       DATETIME2      NULL,
    CONSTRAINT [PK_refunds] PRIMARY KEY ([id])
);

CREATE UNIQUE INDEX [refunds_organizationId_refundNumber_key]
    ON [dbo].[refunds]([organizationId], [refundNumber]);

ALTER TABLE [dbo].[refunds] ADD CONSTRAINT [FK_refunds_organizations]
    FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[refunds] ADD CONSTRAINT [FK_refunds_payments]
    FOREIGN KEY ([paymentId]) REFERENCES [dbo].[payments]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
