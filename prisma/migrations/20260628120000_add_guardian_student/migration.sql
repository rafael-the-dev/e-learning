BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[guardian_students] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [guardianUserId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [relationshipType] NVARCHAR(1000) NOT NULL CONSTRAINT [guardian_students_relationshipType_df] DEFAULT 'GUARDIAN',
    [isPrimary] BIT NOT NULL CONSTRAINT [guardian_students_isPrimary_df] DEFAULT 0,
    [canViewAcademic] BIT NOT NULL CONSTRAINT [guardian_students_canViewAcademic_df] DEFAULT 1,
    [canViewAttendance] BIT NOT NULL CONSTRAINT [guardian_students_canViewAttendance_df] DEFAULT 1,
    [canViewFinance] BIT NOT NULL CONSTRAINT [guardian_students_canViewFinance_df] DEFAULT 0,
    [canViewDocuments] BIT NOT NULL CONSTRAINT [guardian_students_canViewDocuments_df] DEFAULT 1,
    [canReceiveNotifications] BIT NOT NULL CONSTRAINT [guardian_students_canReceiveNotifications_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [guardian_students_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [guardian_students_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [guardian_students_organizationId_guardianUserId_idx] ON [dbo].[guardian_students]([organizationId], [guardianUserId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [guardian_students_organizationId_studentId_idx] ON [dbo].[guardian_students]([organizationId], [studentId]);

-- CreateIndex
-- Filtered unique index, NOT a plain UNIQUE constraint: enforces "one ACTIVE
-- link per (org, guardian, student)" while still allowing a soft-deleted row to
-- coexist with a fresh re-link. SQL Server treats multiple NULLs as duplicates
-- under a plain UNIQUE, so the WHERE clause is required.
CREATE UNIQUE NONCLUSTERED INDEX [guardian_students_active_link_key] ON [dbo].[guardian_students]([organizationId], [guardianUserId], [studentId]) WHERE [deletedAt] IS NULL;

-- AddForeignKey
ALTER TABLE [dbo].[guardian_students] ADD CONSTRAINT [guardian_students_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[guardian_students] ADD CONSTRAINT [guardian_students_guardianUserId_fkey] FOREIGN KEY ([guardianUserId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[guardian_students] ADD CONSTRAINT [guardian_students_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
