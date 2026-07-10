-- Examination Engine — Phase 11B: canonical exam→grade component binding (ADR-014)
--
-- Purely additive: creates the single new table exam_grade_component_bindings, which
-- explicitly binds an ExamSession to the Grade Engine's target AssessmentComponent so a
-- SCORED exam result can be integrated WITHOUT any heuristic component guessing. No
-- existing table, column, or behaviour changes.
--
-- Column pointers with NO foreign key (ADR-013 bounded-context convention — the exam
-- schema never hard-couples to Grade / User internals; the bind command validates them
-- at write time against the real AssessmentComponent / LevelSubject):
--   • assessmentComponentId — POINTER to assessment_components.id (validated in-app).
--   • createdById            — actor pointer (users.id), plain column.
-- Only organizationId and examSessionId are real FKs (ON DELETE NO ACTION ON UPDATE NO
-- ACTION), matching every other exam_* table.
--
-- ONE UNIQUE index is FILTERED (partial) and therefore MIGRATION-ONLY — Prisma cannot
-- express partial/filtered unique indexes, so it is NOT declared with @@unique in
-- schema.prisma. Introspection may report drift for it; that is EXPECTED and intentional:
--   1. exam_grade_component_bindings_active_key — at most ONE active binding per
--      (organizationId, examSessionId) among live rows (deletedAt IS NULL). An archived
--      (soft-deleted) binding does not block a later re-bind.

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[exam_grade_component_bindings] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [examSessionId] NVARCHAR(1000) NOT NULL,
    [assessmentComponentId] NVARCHAR(1000) NOT NULL,
    [createdById] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [exam_grade_component_bindings_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [exam_grade_component_bindings_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_grade_component_bindings_organizationId_examSessionId_idx] ON [dbo].[exam_grade_component_bindings]([organizationId], [examSessionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_grade_component_bindings_organizationId_assessmentComponentId_idx] ON [dbo].[exam_grade_component_bindings]([organizationId], [assessmentComponentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_grade_component_bindings_organizationId_deletedAt_idx] ON [dbo].[exam_grade_component_bindings]([organizationId], [deletedAt]);

-- AddForeignKey
ALTER TABLE [dbo].[exam_grade_component_bindings] ADD CONSTRAINT [exam_grade_component_bindings_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[exam_grade_component_bindings] ADD CONSTRAINT [exam_grade_component_bindings_examSessionId_fkey] FOREIGN KEY ([examSessionId]) REFERENCES [dbo].[exam_sessions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateIndex (FILTERED UNIQUE — migration-only; Prisma cannot express this)
-- One active binding per (organizationId, examSessionId) among live rows.
CREATE UNIQUE NONCLUSTERED INDEX [exam_grade_component_bindings_active_key] ON [dbo].[exam_grade_component_bindings]([organizationId], [examSessionId]) WHERE [deletedAt] IS NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
