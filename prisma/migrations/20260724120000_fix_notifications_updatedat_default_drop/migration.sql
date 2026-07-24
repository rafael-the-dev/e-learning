-- Corrective migration (release-validation): converge the notifications.updatedAt default.
--
-- Root cause: the notifications Phase-2 migration (20260624030612, 03:06) sorts BEFORE the
-- Phase-1 migration (20260624130000, 13:00) that CREATES the [notifications_updatedAt_df]
-- default. On incrementally-built databases the drop ran after the create (real authoring
-- order), leaving NO default. On a clean replay (lexicographic order) Phase-2 ran first and
-- crashed (SQL Server 3728). Phase-2's drop is now guarded (IF EXISTS), so on a clean replay
-- it no-ops and Phase-1 then LEAVES the default in place — diverging from existing DBs.
--
-- This migration removes that divergence: it drops the default only IF it still exists.
--   * fresh DB   → the default (re-added by Phase-1) exists here → dropped → converges to NONE.
--   * existing DB → the default was already dropped historically → IF EXISTS no-ops.
-- Both databases end in the same state: notifications.updatedAt has NO database default
-- (the application always supplies updatedAt). Idempotent and safe to run anywhere.

BEGIN TRY

BEGIN TRAN;

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE [name] = 'notifications_updatedAt_df')
    ALTER TABLE [dbo].[notifications] DROP CONSTRAINT [notifications_updatedAt_df];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
