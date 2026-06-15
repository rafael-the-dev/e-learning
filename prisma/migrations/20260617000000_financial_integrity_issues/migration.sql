-- =============================================================================
-- FinancialIntegrityIssue — persist detected data-integrity violations
-- =============================================================================
-- Append-mostly: rows are CREATED by check runs and UPDATED only when resolved.
-- A filtered unique index (WHERE status = 'OPEN') prevents duplicate OPEN issues
-- for the same entity + check, while allowing re-detection after resolution.
-- =============================================================================

CREATE TABLE [financial_integrity_issues] (
    [id]              NVARCHAR(36)    NOT NULL,
    [organizationId]  NVARCHAR(36)    NOT NULL,
    -- IntegrityIssueSeverity: CRITICAL | HIGH | MEDIUM | LOW
    [severity]        NVARCHAR(20)    NOT NULL,
    -- IntegrityIssueCategory: INVOICE_BALANCE | INSTALLMENT_BALANCE | PAYMENT_ALLOCATION |
    --   WALLET_BALANCE | REFUND_TOTAL | RECEIPT_INTEGRITY | ORPHAN_RECORD | LEDGER_CONSISTENCY
    [category]        NVARCHAR(50)    NOT NULL,
    -- Stable machine-readable check identifier, e.g. "invoice.balance_amounts"
    [checkName]       NVARCHAR(100)   NOT NULL,
    -- Domain entity type, e.g. "Invoice", "Payment", "Receipt"
    [entityType]      NVARCHAR(50)    NOT NULL,
    -- Primary key of the offending entity
    [entityId]        NVARCHAR(36)    NOT NULL,
    [description]     NVARCHAR(MAX)   NOT NULL,
    -- Human-readable strings for numeric/status discrepancies
    [expectedValue]   NVARCHAR(500)   NULL,
    [actualValue]     NVARCHAR(500)   NULL,
    [detectedAt]      DATETIME2       NOT NULL CONSTRAINT [DF_fii_detectedAt] DEFAULT GETDATE(),
    -- Links all issues detected in the same job run
    [jobRunId]        NVARCHAR(36)    NULL,
    -- IntegrityIssueStatus: OPEN | ACKNOWLEDGED | RESOLVED | SUPPRESSED
    [status]          NVARCHAR(20)    NOT NULL CONSTRAINT [DF_fii_status] DEFAULT 'OPEN',
    [resolvedAt]      DATETIME2       NULL,
    [resolvedBy]      NVARCHAR(36)    NULL,
    [resolutionNotes] NVARCHAR(MAX)   NULL,
    [createdAt]       DATETIME2       NOT NULL CONSTRAINT [DF_fii_createdAt] DEFAULT GETDATE(),
    [updatedAt]       DATETIME2       NOT NULL CONSTRAINT [DF_fii_updatedAt] DEFAULT GETDATE(),

    CONSTRAINT [PK_financial_integrity_issues] PRIMARY KEY ([id]),
    CONSTRAINT [FK_fii_organizations]
        FOREIGN KEY ([organizationId])
        REFERENCES [organizations]([id])
        ON DELETE NO ACTION
        ON UPDATE NO ACTION
);

-- =============================================================================
-- Deduplication guard: one OPEN issue per (org, entity, check) at a time.
-- Filtered unique index — only rows where status = 'OPEN' participate.
-- When an issue is resolved, a new OPEN row can be created again on the next run.
-- =============================================================================
CREATE UNIQUE INDEX [uq_open_integrity_issue]
    ON [financial_integrity_issues] ([organizationId], [entityType], [entityId], [checkName])
    WHERE [status] = 'OPEN';

-- Query indexes
CREATE INDEX [idx_fii_severity]
    ON [financial_integrity_issues] ([organizationId], [severity]);

CREATE INDEX [idx_fii_category]
    ON [financial_integrity_issues] ([organizationId], [category]);

CREATE INDEX [idx_fii_status_date]
    ON [financial_integrity_issues] ([organizationId], [status], [detectedAt]);

CREATE INDEX [idx_fii_entity]
    ON [financial_integrity_issues] ([organizationId], [entityType], [entityId]);

CREATE INDEX [idx_fii_job]
    ON [financial_integrity_issues] ([jobRunId])
    WHERE [jobRunId] IS NOT NULL;
