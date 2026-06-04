BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[organizations] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [address] NVARCHAR(1000),
    [logoUrl] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_status_df] DEFAULT 'TRIAL',
    [plan] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_plan_df] DEFAULT 'FREE',
    [timezone] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_timezone_df] DEFAULT 'UTC',
    [locale] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_locale_df] DEFAULT 'en',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [organizations_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [organizations_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [organizations_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[branches] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000),
    [address] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [isDefault] BIT NOT NULL CONSTRAINT [branches_isDefault_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [branches_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [branches_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [branches_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[organization_settings] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [currencyCode] NVARCHAR(1000) NOT NULL CONSTRAINT [organization_settings_currencyCode_df] DEFAULT 'MZN',
    [currencySymbol] NVARCHAR(1000) NOT NULL CONSTRAINT [organization_settings_currencySymbol_df] DEFAULT 'MT',
    [dateFormat] NVARCHAR(1000) NOT NULL CONSTRAINT [organization_settings_dateFormat_df] DEFAULT 'DD/MM/YYYY',
    [taxRate] DECIMAL(5,2),
    [taxName] NVARCHAR(1000),
    [invoicePrefix] NVARCHAR(1000) NOT NULL CONSTRAINT [organization_settings_invoicePrefix_df] DEFAULT 'INV',
    [receiptPrefix] NVARCHAR(1000) NOT NULL CONSTRAINT [organization_settings_receiptPrefix_df] DEFAULT 'REC',
    [allowLatePayments] BIT NOT NULL CONSTRAINT [organization_settings_allowLatePayments_df] DEFAULT 1,
    [gracePeriodDays] INT NOT NULL CONSTRAINT [organization_settings_gracePeriodDays_df] DEFAULT 7,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [organization_settings_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [organization_settings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [organization_settings_organizationId_key] UNIQUE NONCLUSTERED ([organizationId])
);

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [avatarUrl] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [passwordHash] NVARCHAR(1000),
    [emailVerified] DATETIME2,
    [isActive] BIT NOT NULL CONSTRAINT [users_isActive_df] DEFAULT 1,
    [lastLoginAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[accounts] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [provider] NVARCHAR(1000) NOT NULL,
    [providerAccountId] NVARCHAR(1000) NOT NULL,
    [refresh_token] NVARCHAR(max),
    [access_token] NVARCHAR(max),
    [expires_at] INT,
    [token_type] NVARCHAR(1000),
    [scope] NVARCHAR(1000),
    [id_token] NVARCHAR(max),
    [session_state] NVARCHAR(1000),
    CONSTRAINT [accounts_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [accounts_provider_providerAccountId_key] UNIQUE NONCLUSTERED ([provider],[providerAccountId])
);

-- CreateTable
CREATE TABLE [dbo].[sessions] (
    [id] NVARCHAR(1000) NOT NULL,
    [sessionToken] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [expires] DATETIME2 NOT NULL,
    CONSTRAINT [sessions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sessions_sessionToken_key] UNIQUE NONCLUSTERED ([sessionToken])
);

-- CreateTable
CREATE TABLE [dbo].[verification_tokens] (
    [identifier] NVARCHAR(1000) NOT NULL,
    [token] NVARCHAR(1000) NOT NULL,
    [expires] DATETIME2 NOT NULL,
    CONSTRAINT [verification_tokens_token_key] UNIQUE NONCLUSTERED ([token]),
    CONSTRAINT [verification_tokens_identifier_token_key] UNIQUE NONCLUSTERED ([identifier],[token])
);

-- CreateTable
CREATE TABLE [dbo].[user_organizations] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [isOwner] BIT NOT NULL CONSTRAINT [user_organizations_isOwner_df] DEFAULT 0,
    [joinedAt] DATETIME2 NOT NULL CONSTRAINT [user_organizations_joinedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_organizations_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [user_organizations_userId_organizationId_key] UNIQUE NONCLUSTERED ([userId],[organizationId])
);

-- CreateTable
CREATE TABLE [dbo].[roles] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000),
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [isSystem] BIT NOT NULL CONSTRAINT [roles_isSystem_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [roles_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [roles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [roles_organizationId_name_key] UNIQUE NONCLUSTERED ([organizationId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[permissions] (
    [id] NVARCHAR(1000) NOT NULL,
    [module] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [permissions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [permissions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [permissions_module_action_key] UNIQUE NONCLUSTERED ([module],[action])
);

-- CreateTable
CREATE TABLE [dbo].[role_permissions] (
    [id] NVARCHAR(1000) NOT NULL,
    [roleId] NVARCHAR(1000) NOT NULL,
    [permissionId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [role_permissions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [role_permissions_roleId_permissionId_key] UNIQUE NONCLUSTERED ([roleId],[permissionId])
);

-- CreateTable
CREATE TABLE [dbo].[user_roles] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [roleId] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [assignedAt] DATETIME2 NOT NULL CONSTRAINT [user_roles_assignedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [assignedBy] NVARCHAR(1000),
    CONSTRAINT [user_roles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [user_roles_userId_roleId_organizationId_key] UNIQUE NONCLUSTERED ([userId],[roleId],[organizationId])
);

-- CreateTable
CREATE TABLE [dbo].[students] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [code] NVARCHAR(1000),
    [firstName] NVARCHAR(1000) NOT NULL,
    [lastName] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [dateOfBirth] DATETIME2,
    [gender] NVARCHAR(1000),
    [address] NVARCHAR(1000),
    [photoUrl] NVARCHAR(1000),
    [idType] NVARCHAR(1000),
    [idNumber] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [students_status_df] DEFAULT 'PENDING',
    [notes] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [students_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [students_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[teachers] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [code] NVARCHAR(1000),
    [firstName] NVARCHAR(1000) NOT NULL,
    [lastName] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [dateOfBirth] DATETIME2,
    [gender] NVARCHAR(1000),
    [address] NVARCHAR(1000),
    [photoUrl] NVARCHAR(1000),
    [idType] NVARCHAR(1000),
    [idNumber] NVARCHAR(1000),
    [licenseNumber] NVARCHAR(1000),
    [specialization] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [teachers_status_df] DEFAULT 'ACTIVE',
    [notes] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [teachers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [teachers_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[course_categories] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [course_categories_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [course_categories_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [course_categories_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [course_categories_organizationId_name_key] UNIQUE NONCLUSTERED ([organizationId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[courses] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [categoryId] NVARCHAR(1000),
    [name] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000),
    [description] NVARCHAR(max),
    [durationWeeks] INT,
    [totalHours] INT,
    [price] DECIMAL(10,2),
    [isActive] BIT NOT NULL CONSTRAINT [courses_isActive_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [courses_status_df] DEFAULT 'DRAFT',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [courses_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [courses_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[course_levels] (
    [id] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000),
    [description] NVARCHAR(1000),
    [order] INT NOT NULL CONSTRAINT [course_levels_order_df] DEFAULT 0,
    [durationWeeks] INT,
    [totalHours] INT,
    [isActive] BIT NOT NULL CONSTRAINT [course_levels_isActive_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [course_levels_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [course_levels_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [course_levels_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[subjects] (
    [id] NVARCHAR(1000) NOT NULL,
    [courseLevelId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000),
    [description] NVARCHAR(1000),
    [hoursRequired] INT,
    [order] INT NOT NULL CONSTRAINT [subjects_order_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [subjects_isActive_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [subjects_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [subjects_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [subjects_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[teacher_subjects] (
    [id] NVARCHAR(1000) NOT NULL,
    [teacherId] NVARCHAR(1000) NOT NULL,
    [subjectId] NVARCHAR(1000) NOT NULL,
    [assignedAt] DATETIME2 NOT NULL CONSTRAINT [teacher_subjects_assignedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [teacher_subjects_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [teacher_subjects_teacherId_subjectId_key] UNIQUE NONCLUSTERED ([teacherId],[subjectId])
);

-- CreateTable
CREATE TABLE [dbo].[class_groups] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [courseId] NVARCHAR(1000) NOT NULL,
    [courseLevelId] NVARCHAR(1000),
    [teacherId] NVARCHAR(1000),
    [name] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000),
    [capacity] INT NOT NULL CONSTRAINT [class_groups_capacity_df] DEFAULT 30,
    [currentCount] INT NOT NULL CONSTRAINT [class_groups_currentCount_df] DEFAULT 0,
    [startDate] DATETIME2,
    [endDate] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [class_groups_status_df] DEFAULT 'FORMING',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [class_groups_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [class_groups_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[class_schedules] (
    [id] NVARCHAR(1000) NOT NULL,
    [classGroupId] NVARCHAR(1000) NOT NULL,
    [dayOfWeek] INT NOT NULL,
    [startTime] NVARCHAR(1000) NOT NULL,
    [endTime] NVARCHAR(1000) NOT NULL,
    [room] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [class_schedules_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [class_schedules_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[enrollments] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000) NOT NULL,
    [courseLevelId] NVARCHAR(1000),
    [classGroupId] NVARCHAR(1000),
    [enrollmentDate] DATETIME2 NOT NULL CONSTRAINT [enrollments_enrollmentDate_df] DEFAULT CURRENT_TIMESTAMP,
    [startDate] DATETIME2,
    [endDate] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [enrollments_status_df] DEFAULT 'DRAFT',
    [notes] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [enrollments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [enrollments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[enrollment_status_history] (
    [id] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000) NOT NULL,
    [fromStatus] NVARCHAR(1000),
    [toStatus] NVARCHAR(1000) NOT NULL,
    [reason] NVARCHAR(1000),
    [changedBy] NVARCHAR(1000),
    [changedAt] DATETIME2 NOT NULL CONSTRAINT [enrollment_status_history_changedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [enrollment_status_history_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[attendance_records] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [classGroupId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [subjectId] NVARCHAR(1000),
    [date] DATETIME2 NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [attendance_records_status_df] DEFAULT 'ABSENT',
    [justification] NVARCHAR(1000),
    [markedBy] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [attendance_records_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [attendance_records_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [attendance_records_classGroupId_studentId_date_subjectId_key] UNIQUE NONCLUSTERED ([classGroupId],[studentId],[date],[subjectId])
);

-- CreateTable
CREATE TABLE [dbo].[vehicles] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [plate] NVARCHAR(1000) NOT NULL,
    [brand] NVARCHAR(1000),
    [model] NVARCHAR(1000),
    [year] INT,
    [color] NVARCHAR(1000),
    [category] NVARCHAR(1000),
    [transmission] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [vehicles_status_df] DEFAULT 'ACTIVE',
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [vehicles_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [vehicles_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[practical_lessons] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [teacherId] NVARCHAR(1000),
    [vehicleId] NVARCHAR(1000),
    [date] DATETIME2 NOT NULL,
    [startTime] NVARCHAR(1000) NOT NULL,
    [endTime] NVARCHAR(1000) NOT NULL,
    [durationMinutes] INT,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [practical_lessons_status_df] DEFAULT 'SCHEDULED',
    [evaluation] NVARCHAR(max),
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [practical_lessons_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [practical_lessons_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[invoices] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000),
    [enrollmentId] NVARCHAR(1000),
    [number] NVARCHAR(1000) NOT NULL,
    [issueDate] DATETIME2 NOT NULL CONSTRAINT [invoices_issueDate_df] DEFAULT CURRENT_TIMESTAMP,
    [dueDate] DATETIME2,
    [subtotal] DECIMAL(10,2) NOT NULL,
    [taxAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [invoices_taxAmount_df] DEFAULT 0,
    [discount] DECIMAL(10,2) NOT NULL CONSTRAINT [invoices_discount_df] DEFAULT 0,
    [total] DECIMAL(10,2) NOT NULL,
    [paidAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [invoices_paidAmount_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [invoices_status_df] DEFAULT 'PENDING',
    [notes] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [invoices_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    CONSTRAINT [invoices_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [invoices_number_key] UNIQUE NONCLUSTERED ([number])
);

-- CreateTable
CREATE TABLE [dbo].[invoice_items] (
    [id] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000) NOT NULL,
    [quantity] DECIMAL(10,2) NOT NULL CONSTRAINT [invoice_items_quantity_df] DEFAULT 1,
    [unitPrice] DECIMAL(10,2) NOT NULL,
    [discount] DECIMAL(10,2) NOT NULL CONSTRAINT [invoice_items_discount_df] DEFAULT 0,
    [total] DECIMAL(10,2) NOT NULL,
    [order] INT NOT NULL CONSTRAINT [invoice_items_order_df] DEFAULT 0,
    CONSTRAINT [invoice_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[payment_plans] (
    [id] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [totalAmount] DECIMAL(10,2) NOT NULL,
    [installments] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [payment_plans_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [payment_plans_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [payment_plans_invoiceId_key] UNIQUE NONCLUSTERED ([invoiceId])
);

-- CreateTable
CREATE TABLE [dbo].[installments] (
    [id] NVARCHAR(1000) NOT NULL,
    [paymentPlanId] NVARCHAR(1000) NOT NULL,
    [number] INT NOT NULL,
    [dueDate] DATETIME2 NOT NULL,
    [amount] DECIMAL(10,2) NOT NULL,
    [paidAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [installments_paidAmount_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [installments_status_df] DEFAULT 'PENDING',
    [paidAt] DATETIME2,
    CONSTRAINT [installments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[payments] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000),
    [invoiceId] NVARCHAR(1000),
    [installmentId] NVARCHAR(1000),
    [amount] DECIMAL(10,2) NOT NULL,
    [method] NVARCHAR(1000) NOT NULL CONSTRAINT [payments_method_df] DEFAULT 'CASH',
    [reference] NVARCHAR(1000),
    [paymentDate] DATETIME2 NOT NULL CONSTRAINT [payments_paymentDate_df] DEFAULT CURRENT_TIMESTAMP,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [payments_status_df] DEFAULT 'CONFIRMED',
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [payments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [createdBy] NVARCHAR(1000),
    CONSTRAINT [payments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[receipts] (
    [id] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [paymentId] NVARCHAR(1000) NOT NULL,
    [number] NVARCHAR(1000) NOT NULL,
    [issuedAt] DATETIME2 NOT NULL CONSTRAINT [receipts_issuedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [issuedBy] NVARCHAR(1000),
    CONSTRAINT [receipts_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [receipts_paymentId_key] UNIQUE NONCLUSTERED ([paymentId]),
    CONSTRAINT [receipts_number_key] UNIQUE NONCLUSTERED ([number])
);

-- CreateTable
CREATE TABLE [dbo].[notifications] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000),
    [type] NVARCHAR(1000) NOT NULL,
    [channel] NVARCHAR(1000) NOT NULL CONSTRAINT [notifications_channel_df] DEFAULT 'IN_APP',
    [title] NVARCHAR(1000) NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [data] NVARCHAR(max),
    [isRead] BIT NOT NULL CONSTRAINT [notifications_isRead_df] DEFAULT 0,
    [readAt] DATETIME2,
    [sentAt] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [notifications_status_df] DEFAULT 'PENDING',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [notifications_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [notifications_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000),
    [actorId] NVARCHAR(1000),
    [entity] NVARCHAR(1000) NOT NULL,
    [entityId] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [oldValues] NVARCHAR(max),
    [newValues] NVARCHAR(max),
    [ipAddress] NVARCHAR(1000),
    [userAgent] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [audit_logs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_organizationId_entity_entityId_idx] ON [dbo].[audit_logs]([organizationId], [entity], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_organizationId_actorId_idx] ON [dbo].[audit_logs]([organizationId], [actorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_createdAt_idx] ON [dbo].[audit_logs]([createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[branches] ADD CONSTRAINT [branches_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[organization_settings] ADD CONSTRAINT [organization_settings_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[accounts] ADD CONSTRAINT [accounts_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[sessions] ADD CONSTRAINT [sessions_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[user_organizations] ADD CONSTRAINT [user_organizations_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_organizations] ADD CONSTRAINT [user_organizations_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[roles] ADD CONSTRAINT [roles_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[roles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_permissionId_fkey] FOREIGN KEY ([permissionId]) REFERENCES [dbo].[permissions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[roles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[students] ADD CONSTRAINT [students_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[students] ADD CONSTRAINT [students_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[teachers] ADD CONSTRAINT [teachers_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[teachers] ADD CONSTRAINT [teachers_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[course_categories] ADD CONSTRAINT [course_categories_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[courses] ADD CONSTRAINT [courses_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[courses] ADD CONSTRAINT [courses_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[course_categories]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[course_levels] ADD CONSTRAINT [course_levels_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[subjects] ADD CONSTRAINT [subjects_courseLevelId_fkey] FOREIGN KEY ([courseLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[teacher_subjects] ADD CONSTRAINT [teacher_subjects_teacherId_fkey] FOREIGN KEY ([teacherId]) REFERENCES [dbo].[teachers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[teacher_subjects] ADD CONSTRAINT [teacher_subjects_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [dbo].[subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[class_groups] ADD CONSTRAINT [class_groups_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[class_groups] ADD CONSTRAINT [class_groups_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[class_groups] ADD CONSTRAINT [class_groups_courseLevelId_fkey] FOREIGN KEY ([courseLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[class_groups] ADD CONSTRAINT [class_groups_teacherId_fkey] FOREIGN KEY ([teacherId]) REFERENCES [dbo].[teachers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[class_schedules] ADD CONSTRAINT [class_schedules_classGroupId_fkey] FOREIGN KEY ([classGroupId]) REFERENCES [dbo].[class_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_courseLevelId_fkey] FOREIGN KEY ([courseLevelId]) REFERENCES [dbo].[course_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[enrollments] ADD CONSTRAINT [enrollments_classGroupId_fkey] FOREIGN KEY ([classGroupId]) REFERENCES [dbo].[class_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[enrollment_status_history] ADD CONSTRAINT [enrollment_status_history_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_records] ADD CONSTRAINT [attendance_records_classGroupId_fkey] FOREIGN KEY ([classGroupId]) REFERENCES [dbo].[class_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_records] ADD CONSTRAINT [attendance_records_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attendance_records] ADD CONSTRAINT [attendance_records_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [dbo].[subjects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[vehicles] ADD CONSTRAINT [vehicles_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[vehicles] ADD CONSTRAINT [vehicles_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[practical_lessons] ADD CONSTRAINT [practical_lessons_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[practical_lessons] ADD CONSTRAINT [practical_lessons_teacherId_fkey] FOREIGN KEY ([teacherId]) REFERENCES [dbo].[teachers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[practical_lessons] ADD CONSTRAINT [practical_lessons_vehicleId_fkey] FOREIGN KEY ([vehicleId]) REFERENCES [dbo].[vehicles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invoices] ADD CONSTRAINT [invoices_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invoices] ADD CONSTRAINT [invoices_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invoices] ADD CONSTRAINT [invoices_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invoice_items] ADD CONSTRAINT [invoice_items_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[payment_plans] ADD CONSTRAINT [payment_plans_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[installments] ADD CONSTRAINT [installments_paymentPlanId_fkey] FOREIGN KEY ([paymentPlanId]) REFERENCES [dbo].[payment_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_installmentId_fkey] FOREIGN KEY ([installmentId]) REFERENCES [dbo].[installments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receipts] ADD CONSTRAINT [receipts_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receipts] ADD CONSTRAINT [receipts_paymentId_fkey] FOREIGN KEY ([paymentId]) REFERENCES [dbo].[payments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actorId_fkey] FOREIGN KEY ([actorId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
