-- M11 — StudentRiskProjection: the canonical persisted per-student risk classification.
-- The risk RULES stay in the engine (buildStudentRiskSummary, H6); this table only
-- persists the engine's output so Student 360, the dashboards and the watchlists read ONE
-- classification with cheap WHERE / ORDER BY / GROUP BY, instead of each re-deriving risk
-- with its own 75/85/CASE-WHEN thresholds or running the engine per student in a loop.
--
-- Notes:
--  * `level` / `levelWithoutFinance` carry the H6 permission-aware pair — the read layer
--    serves `levelWithoutFinance` to viewers without finance permission (no hidden-risk
--    inference). `levelRank` / `levelWithoutFinanceRank` are the numeric severity ranks so
--    dashboards can ORDER BY severity in SQL (the string level is NOT severity-ordered).
--  * `reasonsJson` is the engine's ordered StudentRiskReason[] as NVARCHAR(MAX) JSON
--    (SQL Server has no native JSON type).
--  * `sourceVersion` records the rules version that produced the row (recompute on bump).
--  * FKs use ON DELETE NO ACTION / ON UPDATE NO ACTION (house rule: no multiple cascade paths).

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[student_risk_projections] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [level] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projections_level_df] DEFAULT 'UNKNOWN',
    [levelRank] INT NOT NULL CONSTRAINT [student_risk_projections_levelRank_df] DEFAULT -1,
    [levelWithoutFinance] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projections_levelWithoutFinance_df] DEFAULT 'UNKNOWN',
    [levelWithoutFinanceRank] INT NOT NULL CONSTRAINT [student_risk_projections_levelWithoutFinanceRank_df] DEFAULT -1,
    [isAtRisk] BIT NOT NULL CONSTRAINT [student_risk_projections_isAtRisk_df] DEFAULT 0,
    [evaluationStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projections_evaluationStatus_df] DEFAULT 'INSUFFICIENT_DATA',
    [academicLevel] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projections_academicLevel_df] DEFAULT 'NONE',
    [attendanceLevel] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projections_attendanceLevel_df] DEFAULT 'NONE',
    [financialLevel] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projections_financialLevel_df] DEFAULT 'NONE',
    [progressionLevel] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projections_progressionLevel_df] DEFAULT 'NONE',
    [documentsLevel] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projections_documentsLevel_df] DEFAULT 'NONE',
    [reasonsJson] NVARCHAR(max),
    [recommendedAction] NVARCHAR(1000),
    [sourceVersion] NVARCHAR(1000) NOT NULL CONSTRAINT [student_risk_projections_sourceVersion_df] DEFAULT 'student-risk-v1',
    [evaluatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_risk_projections_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [student_risk_projections_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [student_risk_projections_organizationId_studentId_key] UNIQUE NONCLUSTERED ([organizationId],[studentId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projections_organizationId_level_idx] ON [dbo].[student_risk_projections]([organizationId], [level]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projections_organizationId_isAtRisk_idx] ON [dbo].[student_risk_projections]([organizationId], [isAtRisk]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projections_organizationId_evaluatedAt_idx] ON [dbo].[student_risk_projections]([organizationId], [evaluatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projections_organizationId_academicLevel_idx] ON [dbo].[student_risk_projections]([organizationId], [academicLevel]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projections_organizationId_attendanceLevel_idx] ON [dbo].[student_risk_projections]([organizationId], [attendanceLevel]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_risk_projections_organizationId_sourceVersion_idx] ON [dbo].[student_risk_projections]([organizationId], [sourceVersion]);

-- AddForeignKey
ALTER TABLE [dbo].[student_risk_projections] ADD CONSTRAINT [student_risk_projections_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_risk_projections] ADD CONSTRAINT [student_risk_projections_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
