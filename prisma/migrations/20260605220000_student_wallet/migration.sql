-- CreateTable: student_wallets
CREATE TABLE [dbo].[student_wallets] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_wallets_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_wallets_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [student_wallets_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [student_wallets_organizationId_studentId_key] UNIQUE ([organizationId], [studentId])
);

-- CreateTable: student_wallet_transactions
CREATE TABLE [dbo].[student_wallet_transactions] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentWalletId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(15,2) NOT NULL,
    [referenceType] NVARCHAR(1000),
    [referenceId] NVARCHAR(1000),
    [description] NVARCHAR(MAX),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_wallet_transactions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [student_wallet_transactions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable: credit_applications
CREATE TABLE [dbo].[credit_applications] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [studentWalletId] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(15,2) NOT NULL,
    [notes] NVARCHAR(MAX),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [credit_applications_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [credit_applications_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[student_wallets] ADD CONSTRAINT [student_wallets_organizationId_fkey]
    FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[student_wallets] ADD CONSTRAINT [student_wallets_studentId_fkey]
    FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_wallet_transactions] ADD CONSTRAINT [student_wallet_transactions_organizationId_fkey]
    FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[student_wallet_transactions] ADD CONSTRAINT [student_wallet_transactions_studentWalletId_fkey]
    FOREIGN KEY ([studentWalletId]) REFERENCES [dbo].[student_wallets]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[credit_applications] ADD CONSTRAINT [credit_applications_organizationId_fkey]
    FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[credit_applications] ADD CONSTRAINT [credit_applications_studentWalletId_fkey]
    FOREIGN KEY ([studentWalletId]) REFERENCES [dbo].[student_wallets]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
