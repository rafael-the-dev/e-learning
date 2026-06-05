BEGIN TRY

BEGIN TRAN;

-- RenameForeignKey
EXEC sp_rename 'dbo.fk_credit_applications_payment', 'credit_applications_paymentId_fkey', 'OBJECT';

-- AddForeignKey
ALTER TABLE [dbo].[payments] ADD CONSTRAINT [payments_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
