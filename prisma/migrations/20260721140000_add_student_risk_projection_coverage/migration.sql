-- M11 / F-H1 — StudentRiskProjectionCoverage: per-organization rollout state for the risk
-- projection. Lets the dashboards decide readiness by COMPLETENESS (all eligible students
-- have a current-version projection) instead of the fragile "at least one row exists" gate.
-- Only a full backfill/reconcile may set status READY; a single event-driven projection
-- write can never flip an org to covered. Additive, forward-only; one new table, one FK to
-- organizations (NO ACTION), initially empty.

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[student_risk_projection_coverage] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [sourceVersion] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projection_coverage_status_df] DEFAULT 'NOT_STARTED',
    [expectedStudentCount] INT NOT NULL CONSTRAINT [student_risk_projection_coverage_expectedStudentCount_df] DEFAULT 0,
    [projectedStudentCount] INT NOT NULL CONSTRAINT [student_risk_projection_coverage_projectedStudentCount_df] DEFAULT 0,
    [missingStudentCount] INT NOT NULL CONSTRAINT [student_risk_projection_coverage_missingStudentCount_df] DEFAULT 0,
    [staleStudentCount] INT NOT NULL CONSTRAINT [student_risk_projection_coverage_staleStudentCount_df] DEFAULT 0,
    [errorSummary] NVARCHAR(1000),
    [backfillStartedAt] DATETIME2,
    [backfilledAt] DATETIME2,
    [verifiedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_risk_projection_coverage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [student_risk_projection_coverage_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [student_risk_projection_coverage_organizationId_key] UNIQUE NONCLUSTERED ([organizationId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projection_coverage_status_idx] ON [dbo].[student_risk_projection_coverage]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projection_coverage_sourceVersion_idx] ON [dbo].[student_risk_projection_coverage]([sourceVersion]);

-- AddForeignKey
ALTER TABLE [dbo].[student_risk_projection_coverage] ADD CONSTRAINT [student_risk_projection_coverage_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
