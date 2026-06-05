BEGIN TRY

BEGIN TRAN;

-- DropForeignKey: class_schedules.classGroupId
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'class_schedules_classGroupId_fkey' AND parent_object_id = OBJECT_ID('dbo.class_schedules'))
    ALTER TABLE [dbo].[class_schedules] DROP CONSTRAINT [class_schedules_classGroupId_fkey];

-- DropTable: class_schedules
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'class_schedules' AND schema_id = SCHEMA_ID('dbo'))
    DROP TABLE [dbo].[class_schedules];

-- CreateTable: schedule_periods
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'schedule_periods' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE [dbo].[schedule_periods] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [schedule_periods_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [schedule_periods_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [schedule_periods_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [schedule_periods_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId], [code])
);

-- CreateTable: schedule_slots
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'schedule_slots' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE [dbo].[schedule_slots] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [schedulePeriodId] NVARCHAR(1000) NOT NULL,
    [dayOfWeek] NVARCHAR(1000) NOT NULL,
    [startTime] NVARCHAR(1000) NOT NULL,
    [endTime] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [schedule_slots_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [schedule_slots_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [schedule_slots_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [schedule_slots_schedulePeriodId_dayOfWeek_startTime_endTime_key] UNIQUE NONCLUSTERED ([schedulePeriodId], [dayOfWeek], [startTime], [endTime])
);

-- CreateTable: class_group_schedules
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'class_group_schedules' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE [dbo].[class_group_schedules] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [classGroupId] NVARCHAR(1000) NOT NULL,
    [scheduleSlotId] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [class_group_schedules_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [class_group_schedules_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [class_group_schedules_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [class_group_schedules_classGroupId_scheduleSlotId_key] UNIQUE NONCLUSTERED ([classGroupId], [scheduleSlotId])
);

-- AddForeignKeys: schedule_periods
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'schedule_periods_organizationId_fkey' AND parent_object_id = OBJECT_ID('dbo.schedule_periods'))
    ALTER TABLE [dbo].[schedule_periods] ADD CONSTRAINT [schedule_periods_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKeys: schedule_slots
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'schedule_slots_organizationId_fkey' AND parent_object_id = OBJECT_ID('dbo.schedule_slots'))
    ALTER TABLE [dbo].[schedule_slots] ADD CONSTRAINT [schedule_slots_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'schedule_slots_schedulePeriodId_fkey' AND parent_object_id = OBJECT_ID('dbo.schedule_slots'))
    ALTER TABLE [dbo].[schedule_slots] ADD CONSTRAINT [schedule_slots_schedulePeriodId_fkey] FOREIGN KEY ([schedulePeriodId]) REFERENCES [dbo].[schedule_periods]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKeys: class_group_schedules
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'class_group_schedules_organizationId_fkey' AND parent_object_id = OBJECT_ID('dbo.class_group_schedules'))
    ALTER TABLE [dbo].[class_group_schedules] ADD CONSTRAINT [class_group_schedules_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'class_group_schedules_classGroupId_fkey' AND parent_object_id = OBJECT_ID('dbo.class_group_schedules'))
    ALTER TABLE [dbo].[class_group_schedules] ADD CONSTRAINT [class_group_schedules_classGroupId_fkey] FOREIGN KEY ([classGroupId]) REFERENCES [dbo].[class_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'class_group_schedules_scheduleSlotId_fkey' AND parent_object_id = OBJECT_ID('dbo.class_group_schedules'))
    ALTER TABLE [dbo].[class_group_schedules] ADD CONSTRAINT [class_group_schedules_scheduleSlotId_fkey] FOREIGN KEY ([scheduleSlotId]) REFERENCES [dbo].[schedule_slots]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
