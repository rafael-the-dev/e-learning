BEGIN TRY

BEGIN TRAN;

-- CreateIndex: covers the main student-debt aggregation query (org + student + status filter)
CREATE NONCLUSTERED INDEX [invoices_org_student_status_idx] ON [dbo].[invoices]([organizationId], [studentId], [status]);

-- CreateIndex: covers overdue and due-date range filters
CREATE NONCLUSTERED INDEX [invoices_org_status_duedate_idx] ON [dbo].[invoices]([organizationId], [status], [dueDate]);

-- CreateIndex: covers issue-date range filters
CREATE NONCLUSTERED INDEX [invoices_org_status_issuedate_idx] ON [dbo].[invoices]([organizationId], [status], [issueDate]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
