BEGIN TRY

BEGIN TRAN;

-- DropForeignKey (safe: only drop if exists)
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'subjects_courseLevelId_fkey' AND parent_object_id = OBJECT_ID('dbo.subjects'))
    ALTER TABLE [dbo].[subjects] DROP CONSTRAINT [subjects_courseLevelId_fkey];

-- DropDefaultConstraints before dropping columns (safe)
IF EXISTS (SELECT * FROM sys.default_constraints WHERE name = 'subjects_order_df' AND parent_object_id = OBJECT_ID('dbo.subjects'))
    ALTER TABLE [dbo].[subjects] DROP CONSTRAINT [subjects_order_df];
IF EXISTS (SELECT * FROM sys.default_constraints WHERE name = 'subjects_isActive_df' AND parent_object_id = OBJECT_ID('dbo.subjects'))
    ALTER TABLE [dbo].[subjects] DROP CONSTRAINT [subjects_isActive_df];

-- DropColumns (only if they exist)
IF COL_LENGTH('dbo.subjects', 'courseLevelId') IS NOT NULL
    ALTER TABLE [dbo].[subjects] DROP COLUMN [courseLevelId];
IF COL_LENGTH('dbo.subjects', 'hoursRequired') IS NOT NULL
    ALTER TABLE [dbo].[subjects] DROP COLUMN [hoursRequired];
IF COL_LENGTH('dbo.subjects', 'order') IS NOT NULL
    ALTER TABLE [dbo].[subjects] DROP COLUMN [order];
IF COL_LENGTH('dbo.subjects', 'isActive') IS NOT NULL
    ALTER TABLE [dbo].[subjects] DROP COLUMN [isActive];

-- AlterColumn: description NVARCHAR(1000) -> NVARCHAR(max)
ALTER TABLE [dbo].[subjects] ALTER COLUMN [description] NVARCHAR(max);

-- AddColumn: organizationId (add with temp default to handle existing rows, then drop default)
IF COL_LENGTH('dbo.subjects', 'organizationId') IS NULL BEGIN
    ALTER TABLE [dbo].[subjects] ADD [organizationId] NVARCHAR(1000) NOT NULL CONSTRAINT [subjects_organizationId_tmp_df] DEFAULT '';
    ALTER TABLE [dbo].[subjects] DROP CONSTRAINT [subjects_organizationId_tmp_df];
END

-- AddColumn: deletedAt
IF COL_LENGTH('dbo.subjects', 'deletedAt') IS NULL
    ALTER TABLE [dbo].[subjects] ADD [deletedAt] DATETIME2;

-- AddUniqueConstraint: (organizationId, code)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'subjects_organizationId_code_key' AND object_id = OBJECT_ID('dbo.subjects'))
    ALTER TABLE [dbo].[subjects] ADD CONSTRAINT [subjects_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId], [code]);

-- AddForeignKey: subjects.organizationId -> organizations.id
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'subjects_organizationId_fkey' AND parent_object_id = OBJECT_ID('dbo.subjects'))
    ALTER TABLE [dbo].[subjects] ADD CONSTRAINT [subjects_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateTable: level_subjects (only if not exists)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'level_subjects' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE [dbo].[level_subjects] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000) NOT NULL,
    [courseLevelId] NVARCHAR(1000) NOT NULL,
    [subjectId] NVARCHAR(1000) NOT NULL,
    [order] INT NOT NULL CONSTRAINT [level_subjects_order_df] DEFAULT 0,
    [workloadHours] INT,
    [minimumPassingGrade] DECIMAL(5,2),
    [isRequired] BIT NOT NULL CONSTRAINT [level_subjects_isRequired_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [level_subjects_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [level_subjects_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [level_subjects_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [level_subjects_courseLevelId_subjectId_key] UNIQUE NONCLUSTERED ([courseLevelId],[subjectId])
);

-- AddForeignKeys for level_subjects
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'level_subjects_organizationId_fkey' AND parent_object_id = OBJECT_ID('dbo.level_subjects'))
    ALTER TABLE [dbo].[level_subjects] ADD CONSTRAINT [level_subjects_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'level_subjects_courseId_fkey' AND parent_object_id = OBJECT_ID('dbo.level_subjects'))
    ALTER TABLE [dbo].[level_subjects] ADD CONSTRAINT [level_subjects_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'level_subjects_courseLevelId_fkey' AND parent_object_id = OBJECT_ID('dbo.level_subjects'))
    ALTER TABLE [dbo].[level_subjects] ADD CONSTRAINT [level_subjects_courseLevelId_fkey] FOREIGN KEY ([courseLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'level_subjects_subjectId_fkey' AND parent_object_id = OBJECT_ID('dbo.level_subjects'))
    ALTER TABLE [dbo].[level_subjects] ADD CONSTRAINT [level_subjects_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [dbo].[subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
