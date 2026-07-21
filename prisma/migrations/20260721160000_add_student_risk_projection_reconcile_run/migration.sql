-- M11 / F-H4 — StudentRiskProjectionReconcileRun: resumable, cursor-based reconcile
-- execution. One row per logical backfill/reconcile run; progress (cursor + counters) is
-- checkpointed per batch so a run survives timeout/restart, and a time-boxed lease
-- (leaseOwner/leaseExpiresAt) makes advancing a run safe across instances. Additive,
-- forward-only; one new table, one FK to organizations (NO ACTION), initially empty.

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[student_risk_projection_reconcile_runs] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [mode] NVARCHAR(1000) NOT NULL,
    [sourceVersion] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projection_reconcile_runs_status_df] DEFAULT 'PENDING',
    [cursorStudentId] NVARCHAR(1000),
    [batchSize] INT NOT NULL,
    [processedCount] INT NOT NULL CONSTRAINT [student_risk_projection_reconcile_runs_processedCount_df] DEFAULT 0,
    [succeededCount] INT NOT NULL CONSTRAINT [student_risk_projection_reconcile_runs_succeededCount_df] DEFAULT 0,
    [skippedCount] INT NOT NULL CONSTRAINT [student_risk_projection_reconcile_runs_skippedCount_df] DEFAULT 0,
    [failedCount] INT NOT NULL CONSTRAINT [student_risk_projection_reconcile_runs_failedCount_df] DEFAULT 0,
    [startedAt] DATETIME2 NOT NULL,
    [lastCheckpointAt] DATETIME2,
    [completedAt] DATETIME2,
    [failedAt] DATETIME2,
    [errorCode] NVARCHAR(200),
    [leaseOwner] NVARCHAR(1000),
    [leaseExpiresAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_risk_projection_reconcile_runs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [student_risk_projection_reconcile_runs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projection_reconcile_runs_organizationId_status_idx] ON [dbo].[student_risk_projection_reconcile_runs]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projection_reconcile_runs_status_updatedAt_idx] ON [dbo].[student_risk_projection_reconcile_runs]([status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projection_reconcile_runs_status_leaseExpiresAt_idx] ON [dbo].[student_risk_projection_reconcile_runs]([status], [leaseExpiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projection_reconcile_runs_organizationId_mode_sourceVersion_idx] ON [dbo].[student_risk_projection_reconcile_runs]([organizationId], [mode], [sourceVersion]);

-- AddForeignKey
ALTER TABLE [dbo].[student_risk_projection_reconcile_runs] ADD CONSTRAINT [student_risk_projection_reconcile_runs_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
