BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[enrollments] ADD [billingPolicyId] NVARCHAR(1000);

-- AlterTable
ALTER TABLE [dbo].[invoice_items] DROP CONSTRAINT [invoice_items_updatedAt_df];

-- AlterTable
ALTER TABLE [dbo].[invoices] ADD [billingPolicyId] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[fee_definitions] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [feeType] NVARCHAR(1000) NOT NULL,
    [defaultAmount] DECIMAL(10,2) NOT NULL,
    [appliesTo] NVARCHAR(1000) NOT NULL CONSTRAINT [fee_definitions_appliesTo_df] DEFAULT 'ENROLLMENT',
    [isMandatory] BIT NOT NULL CONSTRAINT [fee_definitions_isMandatory_df] DEFAULT 0,
    [priority] INT NOT NULL CONSTRAINT [fee_definitions_priority_df] DEFAULT 7,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [fee_definitions_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [fee_definitions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [fee_definitions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fee_definitions_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[enrollment_billing_policies] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [autoGenerateInvoiceOnEnrollment] BIT NOT NULL CONSTRAINT [enrollment_billing_policies_autoGenerateInvoiceOnEnrollment_df] DEFAULT 1,
    [invoiceMode] NVARCHAR(1000) NOT NULL CONSTRAINT [enrollment_billing_policies_invoiceMode_df] DEFAULT 'SINGLE_INVOICE',
    [activationRule] NVARCHAR(1000) NOT NULL CONSTRAINT [enrollment_billing_policies_activationRule_df] DEFAULT 'MANUAL',
    [installmentsRequired] BIT NOT NULL CONSTRAINT [enrollment_billing_policies_installmentsRequired_df] DEFAULT 0,
    [defaultNumberOfInstallments] INT,
    [minimumFirstPaymentAmount] DECIMAL(10,2),
    [allowWalletCreditOnEnrollment] BIT NOT NULL CONSTRAINT [enrollment_billing_policies_allowWalletCreditOnEnrollment_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [enrollment_billing_policies_status_df] DEFAULT 'ACTIVE',
    [isDefault] BIT NOT NULL CONSTRAINT [enrollment_billing_policies_isDefault_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [enrollment_billing_policies_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [enrollment_billing_policies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [enrollment_billing_policies_organizationId_name_key] UNIQUE NONCLUSTERED ([organizationId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[policy_fees] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [policyId] NVARCHAR(1000) NOT NULL,
    [feeDefinitionId] NVARCHAR(1000) NOT NULL,
    [amountType] NVARCHAR(1000) NOT NULL CONSTRAINT [policy_fees_amountType_df] DEFAULT 'FIXED',
    [fixedAmount] DECIMAL(10,2),
    [percentage] DECIMAL(5,2),
    [isRequired] BIT NOT NULL CONSTRAINT [policy_fees_isRequired_df] DEFAULT 1,
    [priority] INT NOT NULL CONSTRAINT [policy_fees_priority_df] DEFAULT 7,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [policy_fees_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [policy_fees_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [policy_fees_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [policy_fees_policyId_feeDefinitionId_key] UNIQUE NONCLUSTERED ([policyId],[feeDefinitionId])
);

-- CreateTable
CREATE TABLE [dbo].[discount_rules] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [discountType] NVARCHAR(1000) NOT NULL,
    [value] DECIMAL(10,2) NOT NULL,
    [appliesTo] NVARCHAR(1000) NOT NULL CONSTRAINT [discount_rules_appliesTo_df] DEFAULT 'ENROLLMENT',
    [startDate] DATETIME2,
    [endDate] DATETIME2,
    [stackable] BIT NOT NULL CONSTRAINT [discount_rules_stackable_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [discount_rules_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [discount_rules_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [discount_rules_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [discount_rules_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[tax_rules] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [rate] DECIMAL(5,2) NOT NULL,
    [appliesTo] NVARCHAR(1000) NOT NULL CONSTRAINT [tax_rules_appliesTo_df] DEFAULT 'ENROLLMENT',
    [isIncludedInPrice] BIT NOT NULL CONSTRAINT [tax_rules_isIncludedInPrice_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [tax_rules_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [tax_rules_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [tax_rules_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [tax_rules_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[applied_discounts] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [discountRuleId] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(10,2) NOT NULL,
    [description] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [applied_discounts_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [applied_discounts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[applied_taxes] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [taxRuleId] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(10,2) NOT NULL,
    [rate] DECIMAL(5,2) NOT NULL,
    [description] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [applied_taxes_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [applied_taxes_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[fee_definitions] ADD CONSTRAINT [fee_definitions_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[enrollment_billing_policies] ADD CONSTRAINT [enrollment_billing_policies_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[policy_fees] ADD CONSTRAINT [policy_fees_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[policy_fees] ADD CONSTRAINT [policy_fees_policyId_fkey] FOREIGN KEY ([policyId]) REFERENCES [dbo].[enrollment_billing_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[policy_fees] ADD CONSTRAINT [policy_fees_feeDefinitionId_fkey] FOREIGN KEY ([feeDefinitionId]) REFERENCES [dbo].[fee_definitions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[discount_rules] ADD CONSTRAINT [discount_rules_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[tax_rules] ADD CONSTRAINT [tax_rules_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[applied_discounts] ADD CONSTRAINT [applied_discounts_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[applied_discounts] ADD CONSTRAINT [applied_discounts_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[applied_discounts] ADD CONSTRAINT [applied_discounts_discountRuleId_fkey] FOREIGN KEY ([discountRuleId]) REFERENCES [dbo].[discount_rules]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[applied_taxes] ADD CONSTRAINT [applied_taxes_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[applied_taxes] ADD CONSTRAINT [applied_taxes_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[applied_taxes] ADD CONSTRAINT [applied_taxes_taxRuleId_fkey] FOREIGN KEY ([taxRuleId]) REFERENCES [dbo].[tax_rules]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_billingPolicyId_fkey] FOREIGN KEY ([billingPolicyId]) REFERENCES [dbo].[enrollment_billing_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invoices] ADD CONSTRAINT [invoices_billingPolicyId_fkey] FOREIGN KEY ([billingPolicyId]) REFERENCES [dbo].[enrollment_billing_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
