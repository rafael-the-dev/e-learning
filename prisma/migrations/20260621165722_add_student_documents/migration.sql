BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[student_documents] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [documentType] NVARCHAR(1000) NOT NULL,
    [fileName] NVARCHAR(1000) NOT NULL,
    [fileUrl] NVARCHAR(max) NOT NULL,
    [fileSize] INT,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_documents_status_df] DEFAULT 'PENDING',
    [notes] NVARCHAR(max),
    [uploadedBy] NVARCHAR(1000),
    [verifiedBy] NVARCHAR(1000),
    [verifiedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_documents_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [student_documents_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_documents_organizationId_studentId_idx] ON [dbo].[student_documents]([organizationId], [studentId]);

-- AddForeignKey
ALTER TABLE [dbo].[student_documents] ADD CONSTRAINT [student_documents_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_documents] ADD CONSTRAINT [student_documents_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- RenameIndex
EXEC SP_RENAME N'dbo.student_wallet_transactions.swt_org_type_createdat_idx', N'student_wallet_transactions_organizationId_type_createdAt_idx', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.student_wallet_transactions.swt_wallet_createdat_idx', N'student_wallet_transactions_studentWalletId_createdAt_idx', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.students.students_org_branch_idx', N'students_organizationId_branchId_idx', N'INDEX';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
