BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[classrooms] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [classroomType] NVARCHAR(1000) NOT NULL CONSTRAINT [classrooms_classroomType_df] DEFAULT 'STANDARD_ROOM',
    [capacity] INT NOT NULL CONSTRAINT [classrooms_capacity_df] DEFAULT 1,
    [location] NVARCHAR(1000),
    [floor] NVARCHAR(1000),
    [meetingProvider] NVARCHAR(1000),
    [meetingUrl] NVARCHAR(max),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [classrooms_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [classrooms_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [classrooms_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[classroom_features] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [classroomId] NVARCHAR(1000) NOT NULL,
    [feature] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [classroom_features_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [classroom_features_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [classroom_features_classroomId_feature_key] UNIQUE NONCLUSTERED ([classroomId],[feature])
);

-- CreateTable
CREATE TABLE [dbo].[classroom_resources] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [classroomId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL CONSTRAINT [classroom_resources_quantity_df] DEFAULT 0,
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [classroom_resources_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [classroom_resources_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [classroom_resources_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[classroom_maintenances] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [classroomId] NVARCHAR(1000) NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2 NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [classroom_maintenances_status_df] DEFAULT 'SCHEDULED',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [classroom_maintenances_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [classroom_maintenances_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[classroom_bookings] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [classroomId] NVARCHAR(1000) NOT NULL,
    [classGroupId] NVARCHAR(1000),
    [scheduleSlotId] NVARCHAR(1000),
    [academicYearId] NVARCHAR(1000) NOT NULL,
    [academicTermId] NVARCHAR(1000),
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2 NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [classroom_bookings_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [classroom_bookings_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [classroom_bookings_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [classrooms_organizationId_branchId_code_idx] ON [dbo].[classrooms]([organizationId], [branchId], [code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [classrooms_organizationId_status_idx] ON [dbo].[classrooms]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [classroom_maintenances_organizationId_classroomId_status_idx] ON [dbo].[classroom_maintenances]([organizationId], [classroomId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [classroom_bookings_organizationId_classroomId_status_idx] ON [dbo].[classroom_bookings]([organizationId], [classroomId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [classroom_bookings_organizationId_academicYearId_idx] ON [dbo].[classroom_bookings]([organizationId], [academicYearId]);

-- AddForeignKey
ALTER TABLE [dbo].[classrooms] ADD CONSTRAINT [classrooms_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classrooms] ADD CONSTRAINT [classrooms_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_features] ADD CONSTRAINT [classroom_features_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_features] ADD CONSTRAINT [classroom_features_classroomId_fkey] FOREIGN KEY ([classroomId]) REFERENCES [dbo].[classrooms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_resources] ADD CONSTRAINT [classroom_resources_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_resources] ADD CONSTRAINT [classroom_resources_classroomId_fkey] FOREIGN KEY ([classroomId]) REFERENCES [dbo].[classrooms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_maintenances] ADD CONSTRAINT [classroom_maintenances_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_maintenances] ADD CONSTRAINT [classroom_maintenances_classroomId_fkey] FOREIGN KEY ([classroomId]) REFERENCES [dbo].[classrooms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_bookings] ADD CONSTRAINT [classroom_bookings_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_bookings] ADD CONSTRAINT [classroom_bookings_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_bookings] ADD CONSTRAINT [classroom_bookings_classroomId_fkey] FOREIGN KEY ([classroomId]) REFERENCES [dbo].[classrooms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_bookings] ADD CONSTRAINT [classroom_bookings_classGroupId_fkey] FOREIGN KEY ([classGroupId]) REFERENCES [dbo].[class_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_bookings] ADD CONSTRAINT [classroom_bookings_scheduleSlotId_fkey] FOREIGN KEY ([scheduleSlotId]) REFERENCES [dbo].[schedule_slots]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_bookings] ADD CONSTRAINT [classroom_bookings_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[academic_years]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[classroom_bookings] ADD CONSTRAINT [classroom_bookings_academicTermId_fkey] FOREIGN KEY ([academicTermId]) REFERENCES [dbo].[academic_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
