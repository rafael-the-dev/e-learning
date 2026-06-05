BEGIN TRY

BEGIN TRAN;

-- Add branchId column to enrollments if missing
IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE name = 'branchId' AND object_id = OBJECT_ID('dbo.enrollments')
)
    ALTER TABLE [dbo].[enrollments] ADD [branchId] NVARCHAR(1000);

-- Add enrollmentNumber column to enrollments if missing
IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE name = 'enrollmentNumber' AND object_id = OBJECT_ID('dbo.enrollments')
)
    ALTER TABLE [dbo].[enrollments] ADD [enrollmentNumber] NVARCHAR(1000);

-- Rename endDate -> expectedEndDate if endDate exists and expectedEndDate does not
IF EXISTS (
    SELECT * FROM sys.columns
    WHERE name = 'endDate' AND object_id = OBJECT_ID('dbo.enrollments')
)
AND NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE name = 'expectedEndDate' AND object_id = OBJECT_ID('dbo.enrollments')
)
    EXEC sp_rename 'dbo.enrollments.endDate', 'expectedEndDate', 'COLUMN';

-- Add expectedEndDate column if neither endDate nor expectedEndDate exist
IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE name = 'expectedEndDate' AND object_id = OBJECT_ID('dbo.enrollments')
)
    ALTER TABLE [dbo].[enrollments] ADD [expectedEndDate] DATETIME2;

-- Add branchId FK to enrollments if not exists
IF NOT EXISTS (
    SELECT * FROM sys.foreign_keys
    WHERE name = 'enrollments_branchId_fkey'
    AND parent_object_id = OBJECT_ID('dbo.enrollments')
)
    ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_branchId_fkey]
        FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddUniqueConstraint: enrollments [organizationId, enrollmentNumber]
IF NOT EXISTS (
    SELECT * FROM sys.indexes
    WHERE name = 'enrollments_organizationId_enrollmentNumber_key'
    AND object_id = OBJECT_ID('dbo.enrollments')
)
    ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_organizationId_enrollmentNumber_key]
        UNIQUE NONCLUSTERED ([organizationId], [enrollmentNumber]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
