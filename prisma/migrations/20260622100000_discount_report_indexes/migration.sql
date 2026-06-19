BEGIN TRY

BEGIN TRAN;

-- =============================================================================
-- DISCOUNT REPORT INDEXES
-- Composite indexes matching the WHERE / GROUP BY / ORDER BY patterns used by
-- the Discount & Revenue Leakage Report. IF NOT EXISTS guards keep this
-- migration safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- APPLIED DISCOUNT
-- -----------------------------------------------------------------------------

-- Discount-rooted date filter / monthly trend (AppliedDiscount.createdAt is
-- the report's date basis — see docs/financial-reports.md "Discount Report").
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'applied_discounts_org_createdat_idx' AND object_id = OBJECT_ID('applied_discounts'))
  CREATE NONCLUSTERED INDEX [applied_discounts_org_createdat_idx]
    ON [dbo].[applied_discounts] ([organizationId], [createdAt]);

-- Discount Rule filter + by-rule breakdown
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'applied_discounts_org_rule_createdat_idx' AND object_id = OBJECT_ID('applied_discounts'))
  CREATE NONCLUSTERED INDEX [applied_discounts_org_rule_createdat_idx]
    ON [dbo].[applied_discounts] ([organizationId], [discountRuleId], [createdAt]);

-- Invoice-rooted KPIs' EXISTS(applied_discounts WHERE invoiceId = i.id) lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'applied_discounts_org_invoice_idx' AND object_id = OBJECT_ID('applied_discounts'))
  CREATE NONCLUSTERED INDEX [applied_discounts_org_invoice_idx]
    ON [dbo].[applied_discounts] ([organizationId], [invoiceId]);

-- -----------------------------------------------------------------------------
-- INVOICE
-- (organizationId, status, issueDate) and (organizationId, branchId, status,
-- issueDate) already exist from the schema baseline / 20260620100000 migration.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- ENROLLMENT
-- -----------------------------------------------------------------------------

-- Course filter (Discount/Tax/Revenue reports all filter discounts/invoices by
-- enrollment.courseId via a LEFT JOIN from invoices.enrollmentId)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'enrollments_org_course_idx' AND object_id = OBJECT_ID('enrollments'))
  CREATE NONCLUSTERED INDEX [enrollments_org_course_idx]
    ON [dbo].[enrollments] ([organizationId], [courseId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
