BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[subject_assessment_policies] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [subjectId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(max),
    [calculationMethod] NVARCHAR(1000) NOT NULL CONSTRAINT [subject_assessment_policies_calculationMethod_df] DEFAULT 'WEIGHTED_AVERAGE',
    [roundingMethod] NVARCHAR(1000) NOT NULL CONSTRAINT [subject_assessment_policies_roundingMethod_df] DEFAULT 'NONE',
    [minimumPassingGrade] DECIMAL(5,2) NOT NULL,
    [allowRecovery] BIT NOT NULL CONSTRAINT [subject_assessment_policies_allowRecovery_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [subject_assessment_policies_status_df] DEFAULT 'DRAFT',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [subject_assessment_policies_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [subject_assessment_policies_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[subject_assessment_components] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [assessmentPolicyId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL CONSTRAINT [subject_assessment_components_type_df] DEFAULT 'TEST',
    [weight] DECIMAL(5,2) NOT NULL,
    [maxGrade] DECIMAL(5,2) NOT NULL,
    [order] INT NOT NULL CONSTRAINT [subject_assessment_components_order_df] DEFAULT 0,
    [isRequired] BIT NOT NULL CONSTRAINT [subject_assessment_components_isRequired_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [subject_assessment_components_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [subject_assessment_components_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [subject_assessment_components_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[student_assessment_results] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [subjectId] NVARCHAR(1000) NOT NULL,
    [assessmentComponentId] NVARCHAR(1000) NOT NULL,
    [grade] DECIMAL(5,2) NOT NULL,
    [maxGrade] DECIMAL(5,2) NOT NULL,
    [normalizedGrade] DECIMAL(5,2) NOT NULL,
    [notes] NVARCHAR(max),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [student_assessment_results_status_df] DEFAULT 'DRAFT',
    [gradedBy] NVARCHAR(1000),
    [gradedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [student_assessment_results_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [student_assessment_results_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [student_assessment_results_enrollmentId_assessmentComponentId_key] UNIQUE NONCLUSTERED ([enrollmentId],[assessmentComponentId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [subject_assessment_policies_organizationId_subjectId_status_idx] ON [dbo].[subject_assessment_policies]([organizationId], [subjectId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [subject_assessment_components_organizationId_assessmentPolicyId_status_idx] ON [dbo].[subject_assessment_components]([organizationId], [assessmentPolicyId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_assessment_results_organizationId_studentId_idx] ON [dbo].[student_assessment_results]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_assessment_results_organizationId_subjectId_idx] ON [dbo].[student_assessment_results]([organizationId], [subjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [student_assessment_results_organizationId_enrollmentId_idx] ON [dbo].[student_assessment_results]([organizationId], [enrollmentId]);

-- AddForeignKey
ALTER TABLE [dbo].[subject_assessment_policies] ADD CONSTRAINT [subject_assessment_policies_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[subject_assessment_policies] ADD CONSTRAINT [subject_assessment_policies_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [dbo].[subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[subject_assessment_components] ADD CONSTRAINT [subject_assessment_components_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[subject_assessment_components] ADD CONSTRAINT [subject_assessment_components_assessmentPolicyId_fkey] FOREIGN KEY ([assessmentPolicyId]) REFERENCES [dbo].[subject_assessment_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_assessment_results] ADD CONSTRAINT [student_assessment_results_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_assessment_results] ADD CONSTRAINT [student_assessment_results_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_assessment_results] ADD CONSTRAINT [student_assessment_results_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_assessment_results] ADD CONSTRAINT [student_assessment_results_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [dbo].[subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[student_assessment_results] ADD CONSTRAINT [student_assessment_results_assessmentComponentId_fkey] FOREIGN KEY ([assessmentComponentId]) REFERENCES [dbo].[subject_assessment_components]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
