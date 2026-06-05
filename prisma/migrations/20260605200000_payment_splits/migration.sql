-- CreateTable: payment_splits
CREATE TABLE [dbo].[payment_splits] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [paymentId] NVARCHAR(1000) NOT NULL,
    [method] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(15,2) NOT NULL,
    [reference] NVARCHAR(1000),
    [notes] NVARCHAR(MAX),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [payment_splits_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [payment_splits_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[payment_splits] ADD CONSTRAINT [payment_splits_organizationId_fkey]
    FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[payment_splits] ADD CONSTRAINT [payment_splits_paymentId_fkey]
    FOREIGN KEY ([paymentId]) REFERENCES [dbo].[payments]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
