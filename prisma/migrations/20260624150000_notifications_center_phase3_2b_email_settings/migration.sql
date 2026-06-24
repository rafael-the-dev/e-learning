BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[notification_email_settings] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [providerType] NVARCHAR(1000) NOT NULL CONSTRAINT [notification_email_settings_providerType_df] DEFAULT 'SMTP',
    [isEnabled] BIT NOT NULL CONSTRAINT [notification_email_settings_isEnabled_df] DEFAULT 0,
    [fromName] NVARCHAR(1000) NOT NULL,
    [fromEmail] NVARCHAR(1000) NOT NULL,
    [replyTo] NVARCHAR(1000),
    [smtpHost] NVARCHAR(1000),
    [smtpPort] INT,
    [smtpUsername] NVARCHAR(1000),
    [smtpPasswordEncrypted] NVARCHAR(max),
    [smtpSecure] BIT NOT NULL CONSTRAINT [notification_email_settings_smtpSecure_df] DEFAULT 1,
    [graphTenantId] NVARCHAR(1000),
    [graphClientId] NVARCHAR(1000),
    [graphClientSecretEncrypted] NVARCHAR(max),
    [lastTestedAt] DATETIME2,
    [lastTestStatus] NVARCHAR(1000),
    [lastTestError] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [notification_email_settings_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [notification_email_settings_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [notification_email_settings_organizationId_key] ON [dbo].[notification_email_settings]([organizationId]);

-- AddForeignKey
ALTER TABLE [dbo].[notification_email_settings] ADD CONSTRAINT [notification_email_settings_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
