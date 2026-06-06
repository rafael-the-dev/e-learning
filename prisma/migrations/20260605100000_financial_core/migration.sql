-- DropForeignKey: receipts
ALTER TABLE [dbo].[receipts] DROP CONSTRAINT [receipts_invoiceId_fkey];
ALTER TABLE [dbo].[receipts] DROP CONSTRAINT [receipts_paymentId_fkey];

-- DropForeignKey: payments
ALTER TABLE [dbo].[payments] DROP CONSTRAINT [payments_organizationId_fkey];
ALTER TABLE [dbo].[payments] DROP CONSTRAINT [payments_studentId_fkey];
ALTER TABLE [dbo].[payments] DROP CONSTRAINT [payments_invoiceId_fkey];
ALTER TABLE [dbo].[payments] DROP CONSTRAINT [payments_installmentId_fkey];

-- DropForeignKey: installments
ALTER TABLE [dbo].[installments] DROP CONSTRAINT [installments_paymentPlanId_fkey];

-- DropForeignKey: payment_plans
ALTER TABLE [dbo].[payment_plans] DROP CONSTRAINT [payment_plans_invoiceId_fkey];

-- DropForeignKey: invoice_items
ALTER TABLE [dbo].[invoice_items] DROP CONSTRAINT [invoice_items_invoiceId_fkey];

-- DropForeignKey: invoices
ALTER TABLE [dbo].[invoices] DROP CONSTRAINT [invoices_studentId_fkey];
ALTER TABLE [dbo].[invoices] DROP CONSTRAINT [invoices_enrollmentId_fkey];

-- DropTable: in dependency order
DROP TABLE [dbo].[receipts];
DROP TABLE [dbo].[payments];
DROP TABLE [dbo].[installments];
DROP TABLE [dbo].[payment_plans];
DROP TABLE [dbo].[invoice_items];
DROP TABLE [dbo].[invoices];

-- CreateTable: invoices (new schema)
CREATE TABLE [dbo].[invoices] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [enrollmentId] NVARCHAR(1000),
    [studentId] NVARCHAR(1000),
    [invoiceNumber] NVARCHAR(1000) NOT NULL,
    [issueDate] DATETIME2 NOT NULL CONSTRAINT [invoices_issueDate_df] DEFAULT CURRENT_TIMESTAMP,
    [dueDate] DATETIME2,
    [subtotal] DECIMAL(10,2) NOT NULL,
    [discountAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [invoices_discountAmount_df] DEFAULT 0,
    [taxAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [invoices_taxAmount_df] DEFAULT 0,
    [totalAmount] DECIMAL(10,2) NOT NULL,
    [paidAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [invoices_paidAmount_df] DEFAULT 0,
    [balanceAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [invoices_balanceAmount_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [invoices_status_df] DEFAULT 'PENDING',
    [notes] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [invoices_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [invoices_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [invoices_organizationId_invoiceNumber_key] UNIQUE NONCLUSTERED ([organizationId],[invoiceNumber])
);

-- CreateTable: invoice_items (new schema)
CREATE TABLE [dbo].[invoice_items] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000) NOT NULL,
    [quantity] DECIMAL(10,2) NOT NULL CONSTRAINT [invoice_items_quantity_df] DEFAULT 1,
    [unitPrice] DECIMAL(10,2) NOT NULL,
    [totalPrice] DECIMAL(10,2) NOT NULL,
    CONSTRAINT [invoice_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable: payment_plans (new schema)
CREATE TABLE [dbo].[payment_plans] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [numberOfInstallments] INT NOT NULL,
    [totalAmount] DECIMAL(10,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [payment_plans_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [payment_plans_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [payment_plans_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [payment_plans_invoiceId_key] UNIQUE NONCLUSTERED ([invoiceId])
);

-- CreateTable: installments (new schema)
CREATE TABLE [dbo].[installments] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [paymentPlanId] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [installmentNumber] INT NOT NULL,
    [dueDate] DATETIME2 NOT NULL,
    [amount] DECIMAL(10,2) NOT NULL,
    [paidAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [installments_paidAmount_df] DEFAULT 0,
    [balanceAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [installments_balanceAmount_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [installments_status_df] DEFAULT 'PENDING',
    [paidAt] DATETIME2,
    CONSTRAINT [installments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable: payments (new schema)
CREATE TABLE [dbo].[payments] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [invoiceId] NVARCHAR(1000),
    [installmentId] NVARCHAR(1000),
    [studentId] NVARCHAR(1000),
    [enrollmentId] NVARCHAR(1000),
    [paymentNumber] NVARCHAR(1000) NOT NULL,
    [paymentDate] DATETIME2 NOT NULL CONSTRAINT [payments_paymentDate_df] DEFAULT CURRENT_TIMESTAMP,
    [totalAmount] DECIMAL(10,2) NOT NULL,
    [method] NVARCHAR(1000) NOT NULL CONSTRAINT [payments_method_df] DEFAULT 'CASH',
    [reference] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [payments_status_df] DEFAULT 'PENDING',
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [payments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [payments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [payments_organizationId_paymentNumber_key] UNIQUE NONCLUSTERED ([organizationId],[paymentNumber])
);

-- CreateTable: receipts (new schema)
CREATE TABLE [dbo].[receipts] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [paymentId] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000),
    [receiptNumber] NVARCHAR(1000) NOT NULL,
    [issueDate] DATETIME2 NOT NULL CONSTRAINT [receipts_issueDate_df] DEFAULT CURRENT_TIMESTAMP,
    [amount] DECIMAL(10,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [receipts_status_df] DEFAULT 'ISSUED',
    [issuedBy] NVARCHAR(1000),
    CONSTRAINT [receipts_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [receipts_paymentId_key] UNIQUE NONCLUSTERED ([paymentId]),
    CONSTRAINT [receipts_organizationId_receiptNumber_key] UNIQUE NONCLUSTERED ([organizationId],[receiptNumber])
);

-- AddForeignKey: invoices
ALTER TABLE [dbo].[invoices] ADD CONSTRAINT [invoices_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[invoices] ADD CONSTRAINT [invoices_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[invoices] ADD CONSTRAINT [invoices_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[invoices] ADD CONSTRAINT [invoices_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey: invoice_items
ALTER TABLE [dbo].[invoice_items] ADD CONSTRAINT [invoice_items_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: payment_plans
ALTER TABLE [dbo].[payment_plans] ADD CONSTRAINT [payment_plans_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey: installments
ALTER TABLE [dbo].[installments] ADD CONSTRAINT [installments_paymentPlanId_fkey] FOREIGN KEY ([paymentPlanId]) REFERENCES [dbo].[payment_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey: payments
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_installmentId_fkey] FOREIGN KEY ([installmentId]) REFERENCES [dbo].[installments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey: receipts
ALTER TABLE [dbo].[receipts] ADD CONSTRAINT [receipts_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[receipts] ADD CONSTRAINT [receipts_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[receipts] ADD CONSTRAINT [receipts_paymentId_fkey] FOREIGN KEY ([paymentId]) REFERENCES [dbo].[payments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[receipts] ADD CONSTRAINT [receipts_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[receipts] ADD CONSTRAINT [receipts_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
