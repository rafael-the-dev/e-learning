BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[import_jobs] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL CONSTRAINT [import_jobs_type_df] DEFAULT 'STUDENTS',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [import_jobs_status_df] DEFAULT 'PENDING',
    [fileName] NVARCHAR(1000) NOT NULL,
    [totalRows] INT NOT NULL CONSTRAINT [import_jobs_totalRows_df] DEFAULT 0,
    [successRows] INT NOT NULL CONSTRAINT [import_jobs_successRows_df] DEFAULT 0,
    [failedRows] INT NOT NULL CONSTRAINT [import_jobs_failedRows_df] DEFAULT 0,
    [rowsData] NVARCHAR(max),
    [resultData] NVARCHAR(max),
    [startedAt] DATETIME2,
    [completedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [import_jobs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [import_jobs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [import_jobs_organizationId_status_idx] ON [dbo].[import_jobs]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [import_jobs_organizationId_createdAt_idx] ON [dbo].[import_jobs]([organizationId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[import_jobs] ADD CONSTRAINT [import_jobs_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
