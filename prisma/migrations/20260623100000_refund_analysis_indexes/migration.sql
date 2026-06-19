BEGIN TRY

BEGIN TRAN;

-- =============================================================================
-- REFUND ANALYSIS REPORT INDEXES
-- Composite indexes matching the WHERE / GROUP BY / ORDER BY patterns used by
-- the Refund Analysis Report. IF NOT EXISTS guards keep this migration safe
-- to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- REFUND
-- -----------------------------------------------------------------------------

-- General population filter / Refund Trend chart — Refund.createdAt is the
-- report's default date basis (see docs/financial-reports.md "Refund
-- Analysis Report"). (organizationId, status, createdAt) already exists but
-- is less useful when no status filter is active (the common case).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'refunds_org_createdat_idx' AND object_id = OBJECT_ID('refunds'))
  CREATE NONCLUSTERED INDEX [refunds_org_createdat_idx]
    ON [dbo].[refunds] ([organizationId], [createdAt]);

-- COMPLETED-only, completedAt-bucketed queries — Refunded Amount trend series
-- and Processing Time Trend both filter status = 'COMPLETED' then group by
-- completedAt month.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'refunds_org_status_completedat_idx' AND object_id = OBJECT_ID('refunds'))
  CREATE NONCLUSTERED INDEX [refunds_org_status_completedat_idx]
    ON [dbo].[refunds] ([organizationId], [status], [completedAt]);

-- -----------------------------------------------------------------------------
-- PAYMENT / INVOICE / ENROLLMENT
-- All access paths needed (branch/course fallback joins, gross-collected
-- denominator) are already covered by existing indexes from the schema
-- baseline and the 20260620100000 / 20260622100000 migrations.
-- -----------------------------------------------------------------------------

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
