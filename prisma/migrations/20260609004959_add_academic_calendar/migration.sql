BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[academic_years] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2 NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [academic_years_status_df] DEFAULT 'DRAFT',
    [isDefault] BIT NOT NULL CONSTRAINT [academic_years_isDefault_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_years_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [academic_years_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [academic_years_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[academic_terms] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [academicYearId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2 NOT NULL,
    [order] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [academic_terms_status_df] DEFAULT 'DRAFT',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_terms_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [academic_terms_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [academic_terms_academicYearId_order_key] UNIQUE NONCLUSTERED ([academicYearId],[order]),
    CONSTRAINT [academic_terms_academicYearId_code_key] UNIQUE NONCLUSTERED ([academicYearId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[academic_holidays] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [academicYearId] NVARCHAR(1000),
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2 NOT NULL,
    [isRecurring] BIT NOT NULL CONSTRAINT [academic_holidays_isRecurring_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [academic_holidays_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_holidays_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [academic_holidays_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[academic_events] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [academicYearId] NVARCHAR(1000),
    [academicTermId] NVARCHAR(1000),
    [title] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [eventType] NVARCHAR(1000) NOT NULL CONSTRAINT [academic_events_eventType_df] DEFAULT 'GENERAL',
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2 NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [academic_events_status_df] DEFAULT 'DRAFT',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [academic_events_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [academic_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_years_organizationId_status_idx] ON [dbo].[academic_years]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_terms_organizationId_academicYearId_idx] ON [dbo].[academic_terms]([organizationId], [academicYearId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_holidays_organizationId_academicYearId_idx] ON [dbo].[academic_holidays]([organizationId], [academicYearId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_events_organizationId_academicYearId_idx] ON [dbo].[academic_events]([organizationId], [academicYearId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [academic_events_organizationId_eventType_idx] ON [dbo].[academic_events]([organizationId], [eventType]);

-- AddForeignKey
ALTER TABLE [dbo].[academic_years] ADD CONSTRAINT [academic_years_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_terms] ADD CONSTRAINT [academic_terms_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_terms] ADD CONSTRAINT [academic_terms_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[academic_years]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_holidays] ADD CONSTRAINT [academic_holidays_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_holidays] ADD CONSTRAINT [academic_holidays_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[academic_years]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_events] ADD CONSTRAINT [academic_events_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_events] ADD CONSTRAINT [academic_events_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[academic_years]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[academic_events] ADD CONSTRAINT [academic_events_academicTermId_fkey] FOREIGN KEY ([academicTermId]) REFERENCES [dbo].[academic_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
