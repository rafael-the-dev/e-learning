-- Academic Transcript Engine — Phase 0: Transcript Number Counter
--
-- Adds the per-(organization, year, transcriptType) sequence counter used to
-- allocate human-facing transcript numbers (TRN-{year}-{seq}) at ISSUE time
-- (per decision D9). Purely additive: a new table with no data and no impact on
-- any existing table or behaviour. No transcript entity models are created in
-- this phase — this counter stands alone.

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[transcript_number_counters] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [year] INT NOT NULL,
    [transcriptType] NVARCHAR(1000) NOT NULL,
    [lastSeq] INT NOT NULL CONSTRAINT [transcript_number_counters_lastSeq_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [transcript_number_counters_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [transcript_number_counters_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [transcript_number_counters_organizationId_year_transcriptType_key] UNIQUE NONCLUSTERED ([organizationId],[year],[transcriptType])
);

-- AddForeignKey
ALTER TABLE [dbo].[transcript_number_counters] ADD CONSTRAINT [transcript_number_counters_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW

END CATCH
