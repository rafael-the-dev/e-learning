-- Academic Transcript Engine — Phase 5 fix C1: transcript-number scope.
--
-- The transcript number format is TRN-{year}-{seq} (no type segment) and
-- `AcademicTranscript` enforces one number per (organizationId, transcriptNumber).
-- The counter, however, was keyed by (organizationId, year, transcriptType), so
-- each transcript type restarted the sequence at 1 and produced colliding numbers
-- across types (e.g. COURSE_TRANSCRIPT and CERTIFICATE_SUPPORT both getting
-- TRN-2026-000001) — the second type could never be issued.
--
-- Fix (per decision D9): one shared sequence per (organizationId, year). Drop the
-- transcriptType column and re-key the unique constraint to (organizationId, year).
--
-- No data-collapse step is needed: under the old (buggy) behaviour only ONE type
-- could ever commit a counter row per (organizationId, year) — a second type's
-- issue transaction hit the per-org transcriptNumber unique index and rolled back,
-- taking its counter row with it. So no duplicate (organizationId, year) rows can
-- exist in committed data.

BEGIN TRY

BEGIN TRAN;

-- Drop the retired per-type unique constraint (references transcriptType, so it
-- must go before the column).
ALTER TABLE [dbo].[transcript_number_counters]
    DROP CONSTRAINT [transcript_number_counters_organizationId_year_transcriptType_key];

-- Drop the now-unused type column.
ALTER TABLE [dbo].[transcript_number_counters] DROP COLUMN [transcriptType];

-- One shared sequence per (organizationId, year).
ALTER TABLE [dbo].[transcript_number_counters]
    ADD CONSTRAINT [transcript_number_counters_organizationId_year_key] UNIQUE NONCLUSTERED ([organizationId],[year]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW

END CATCH
