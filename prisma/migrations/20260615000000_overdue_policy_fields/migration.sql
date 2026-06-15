BEGIN TRY
BEGIN TRAN;

ALTER TABLE [dbo].[organization_settings] ADD
    [enableAutomaticOverdueProcessing]              BIT          NOT NULL CONSTRAINT [DF_org_settings_enableAutomaticOverdueProcessing] DEFAULT 1,
    [overdueGraceDays]                              INT          NOT NULL CONSTRAINT [DF_org_settings_overdueGraceDays]                 DEFAULT 0,
    [markInvoiceOverdueWhenAnyInstallmentOverdue]   BIT          NOT NULL CONSTRAINT [DF_org_settings_markInvoiceOverdueWhenAny]        DEFAULT 1,
    [notifyOnOverdue]                               BIT          NOT NULL CONSTRAINT [DF_org_settings_notifyOnOverdue]                   DEFAULT 1,
    [overdueNotificationDelayDays]                  INT          NOT NULL CONSTRAINT [DF_org_settings_overdueNotificationDelayDays]      DEFAULT 0;

COMMIT TRAN;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 BEGIN ROLLBACK TRAN; END;
    THROW;
END CATCH
