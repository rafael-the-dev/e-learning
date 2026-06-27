BEGIN TRY

BEGIN TRAN;

-- AlterTable
-- Student Portal auto-provisioning policy columns. Constant defaults, so they
-- can be added in a single batch (no same-batch column reference).
ALTER TABLE [dbo].[organization_settings] ADD
    [autoCreateStudentUserOnActivation] BIT NOT NULL CONSTRAINT [organization_settings_autoCreateStudentUserOnActivation_df] DEFAULT 1,
    [sendStudentPortalInvite] BIT NOT NULL CONSTRAINT [organization_settings_sendStudentPortalInvite_df] DEFAULT 1,
    [studentPortalInviteStrategy] NVARCHAR(1000) NOT NULL CONSTRAINT [organization_settings_studentPortalInviteStrategy_df] DEFAULT 'INVITE_LINK';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
