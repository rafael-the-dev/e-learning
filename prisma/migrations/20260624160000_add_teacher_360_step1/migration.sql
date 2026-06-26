BEGIN TRY

BEGIN TRAN;

-- AlterTable
-- Split into its own migration step: SQL Server compiles a whole script as one batch,
-- so a later statement in the SAME batch cannot reference a column added earlier in that
-- batch ("Invalid column name"). The dependent index/FK on [userId] live in the next
-- migration step instead.
ALTER TABLE [dbo].[teachers] ADD [userId] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[teacher_documents] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [teacherId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [url] NVARCHAR(max) NOT NULL,
    [mimeType] NVARCHAR(1000),
    [size] INT,
    [uploadedById] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [teacher_documents_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [teacher_documents_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [teacher_documents_organizationId_teacherId_idx] ON [dbo].[teacher_documents]([organizationId], [teacherId]);

-- AddForeignKey
ALTER TABLE [dbo].[teacher_documents] ADD CONSTRAINT [teacher_documents_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[teacher_documents] ADD CONSTRAINT [teacher_documents_teacherId_fkey] FOREIGN KEY ([teacherId]) REFERENCES [dbo].[teachers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
