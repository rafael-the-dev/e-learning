/*
  Warnings:

  - Added the required column `academicYearId` to the `class_groups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `academicYearId` to the `enrollments` table without a default value. This is not possible if the table is not empty.

*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable class_groups: add as nullable first to handle existing rows
ALTER TABLE [dbo].[class_groups] ADD [academicTermId] NVARCHAR(1000),
[academicYearId] NVARCHAR(1000);

-- AlterTable enrollments: add as nullable first to handle existing rows
ALTER TABLE [dbo].[enrollments] ADD [academicTermId] NVARCHAR(1000),
[academicYearId] NVARCHAR(1000);

-- AddForeignKey
ALTER TABLE [dbo].[class_groups] ADD CONSTRAINT [class_groups_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[academic_years]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[class_groups] ADD CONSTRAINT [class_groups_academicTermId_fkey] FOREIGN KEY ([academicTermId]) REFERENCES [dbo].[academic_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[academic_years]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_academicTermId_fkey] FOREIGN KEY ([academicTermId]) REFERENCES [dbo].[academic_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

-- Backfill existing class_groups rows (dynamic SQL avoids compile-time column-not-found error)
EXEC('
UPDATE [dbo].[class_groups]
SET [academicYearId] = (
    SELECT TOP 1 [id]
    FROM [dbo].[academic_years] ay
    WHERE ay.[organizationId] = [dbo].[class_groups].[organizationId]
      AND ay.[deletedAt] IS NULL
      AND ay.[status] = ''ACTIVE''
    ORDER BY ay.[startDate] DESC
)
WHERE [academicYearId] IS NULL;

UPDATE [dbo].[class_groups]
SET [academicYearId] = (
    SELECT TOP 1 [id]
    FROM [dbo].[academic_years] ay
    WHERE ay.[organizationId] = [dbo].[class_groups].[organizationId]
      AND ay.[deletedAt] IS NULL
    ORDER BY ay.[startDate] DESC
)
WHERE [academicYearId] IS NULL;
')

-- Backfill existing enrollments rows (dynamic SQL avoids compile-time column-not-found error)
EXEC('
UPDATE [dbo].[enrollments]
SET [academicYearId] = (
    SELECT TOP 1 [id]
    FROM [dbo].[academic_years] ay
    WHERE ay.[organizationId] = [dbo].[enrollments].[organizationId]
      AND ay.[deletedAt] IS NULL
      AND ay.[status] = ''ACTIVE''
    ORDER BY ay.[startDate] DESC
)
WHERE [academicYearId] IS NULL;

UPDATE [dbo].[enrollments]
SET [academicYearId] = (
    SELECT TOP 1 [id]
    FROM [dbo].[academic_years] ay
    WHERE ay.[organizationId] = [dbo].[enrollments].[organizationId]
      AND ay.[deletedAt] IS NULL
    ORDER BY ay.[startDate] DESC
)
WHERE [academicYearId] IS NULL;
')

-- Make NOT NULL (outside transaction, after backfill is complete)
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[class_groups] ALTER COLUMN [academicYearId] NVARCHAR(1000) NOT NULL;
ALTER TABLE [dbo].[enrollments] ALTER COLUMN [academicYearId] NVARCHAR(1000) NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
