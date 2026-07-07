-- Certificate Engine — Phase 1: entity data model
--
-- Purely additive: creates the 7 certificate entity tables (policies, templates,
-- certificates, events, exports, verifications, requests). No existing table or
-- behaviour changes. CertificateNumberCounter already exists from Phase 0 and is
-- NOT touched here.
--
-- All FKs use ON DELETE NO ACTION ON UPDATE NO ACTION. The transcript reference is
-- a POINTER: certificates.transcriptVersionId (and certificate_requests
-- .transcriptVersionId) is a plain column with NO foreign key, so a certificate
-- survives supersession/deletion of the transcript version and never follows
-- transcript updates. transcriptNumber/transcriptChecksum are copied columns.
--
-- Five UNIQUE indexes are FILTERED (partial) and therefore MIGRATION-ONLY —
-- Prisma cannot express partial/filtered unique indexes, so they are NOT declared
-- with @@unique in schema.prisma. Introspection may report drift for them; that is
-- EXPECTED and intentional:
--   1. certificate_policies_org_default_active_key — at most one ACTIVE org-default
--      policy per (organizationId, certificateType) among live rows with no course
--      override (courseId IS NULL AND status='ACTIVE' AND deletedAt IS NULL).
--   2. certificate_templates_org_default_active_key — at most one ACTIVE org-default
--      template per (organizationId, certificateType, language) among live rows with
--      no course override.
--   3. certificates_org_certificate_number_key — one certificate number per
--      (organizationId, certificateNumber) among live, numbered rows
--      (certificateNumber IS NOT NULL AND deletedAt IS NULL).
--   4. certificates_verification_code_key — globally unique verification code among
--      live rows with a code (verificationCode IS NOT NULL AND deletedAt IS NULL).
--      The public lookup key has no tenant context, so it is org-agnostic.
--   5. certificates_active_per_transcript_type_key — at most one ACTIVE certificate
--      per (organizationId, transcriptVersionId, certificateType); "active" excludes
--      REVOKED and STALE so a reissue after revoke/stale is allowed. (SQL Server
--      filtered predicates cannot use IN, so the active set is expressed as
--      status <> 'REVOKED' AND status <> 'STALE'.)

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[certificate_policies] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [certificateType] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000),
    [requiresIssuedTranscript] BIT NOT NULL CONSTRAINT [certificate_policies_requiresIssuedTranscript_df] DEFAULT 1,
    [requiresCourseCompleted] BIT NOT NULL CONSTRAINT [certificate_policies_requiresCourseCompleted_df] DEFAULT 1,
    [requiresNoPendingSubjects] BIT NOT NULL CONSTRAINT [certificate_policies_requiresNoPendingSubjects_df] DEFAULT 1,
    [requiresFinancialClearance] BIT NOT NULL CONSTRAINT [certificate_policies_requiresFinancialClearance_df] DEFAULT 0,
    [requiresManualApproval] BIT NOT NULL CONSTRAINT [certificate_policies_requiresManualApproval_df] DEFAULT 0,
    [autoIssueOnTranscriptIssued] BIT NOT NULL CONSTRAINT [certificate_policies_autoIssueOnTranscriptIssued_df] DEFAULT 0,
    [staleAction] NVARCHAR(1000) NOT NULL CONSTRAINT [certificate_policies_staleAction_df] DEFAULT 'MARK_STALE',
    [validityMonths] INT,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [certificate_policies_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [certificate_policies_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [certificate_policies_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[certificate_templates] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [certificateType] NVARCHAR(1000) NOT NULL,
    [courseId] NVARCHAR(1000),
    [language] NVARCHAR(1000) NOT NULL CONSTRAINT [certificate_templates_language_df] DEFAULT 'pt',
    [layoutJson] NVARCHAR(max) NOT NULL,
    [templateHtml] NVARCHAR(max),
    [backgroundImageUrl] NVARCHAR(1000),
    [signatureImageUrl] NVARCHAR(1000),
    [sealImageUrl] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [certificate_templates_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [certificate_templates_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [certificate_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[certificates] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [enrollmentId] NVARCHAR(1000),
    [courseId] NVARCHAR(1000),
    [transcriptVersionId] NVARCHAR(1000) NOT NULL,
    [transcriptNumber] NVARCHAR(1000) NOT NULL,
    [transcriptChecksum] NVARCHAR(1000) NOT NULL,
    [certificatePolicyId] NVARCHAR(1000),
    [certificateTemplateId] NVARCHAR(1000),
    [certificateNumber] NVARCHAR(1000),
    [certificateType] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [certificates_status_df] DEFAULT 'DRAFT',
    [studentSnapshot] NVARCHAR(max) NOT NULL,
    [courseSnapshot] NVARCHAR(max),
    [issueBasisSnapshot] NVARCHAR(max) NOT NULL,
    [financialClearanceStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [certificates_financialClearanceStatus_df] DEFAULT 'NOT_REQUIRED',
    [financialClearanceCheckedAt] DATETIME2,
    [financialClearanceReference] NVARCHAR(1000),
    [verificationCode] NVARCHAR(1000),
    [verificationUrl] NVARCHAR(1000),
    [checksum] NVARCHAR(1000),
    [issuedAt] DATETIME2,
    [issuedBy] NVARCHAR(1000),
    [revokedAt] DATETIME2,
    [revokedBy] NVARCHAR(1000),
    [revokeReason] NVARCHAR(max),
    [suspendedAt] DATETIME2,
    [suspendedBy] NVARCHAR(1000),
    [suspendReason] NVARCHAR(max),
    [staleDetectedAt] DATETIME2,
    [staleReason] NVARCHAR(1000),
    [expiresAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [certificates_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [certificates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[certificate_events] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [certificateId] NVARCHAR(1000) NOT NULL,
    [eventType] NVARCHAR(1000) NOT NULL,
    [previousStatus] NVARCHAR(1000),
    [newStatus] NVARCHAR(1000),
    [actorId] NVARCHAR(1000),
    [reason] NVARCHAR(max),
    [metadata] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [certificate_events_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [certificate_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[certificate_exports] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [certificateId] NVARCHAR(1000) NOT NULL,
    [exportType] NVARCHAR(1000) NOT NULL,
    [fileUrl] NVARCHAR(1000),
    [fileChecksum] NVARCHAR(1000),
    [exportedBy] NVARCHAR(1000),
    [exportedAt] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [certificate_exports_status_df] DEFAULT 'PENDING',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [certificate_exports_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [certificate_exports_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[certificate_verifications] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [certificateId] NVARCHAR(1000) NOT NULL,
    [verificationCode] NVARCHAR(1000) NOT NULL,
    [publicStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [certificate_verifications_publicStatus_df] DEFAULT 'VALID',
    [verificationCount] INT NOT NULL CONSTRAINT [certificate_verifications_verificationCount_df] DEFAULT 0,
    [lastVerifiedAt] DATETIME2,
    [expiresAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [certificate_verifications_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [certificate_verifications_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [certificate_verifications_certificateId_key] UNIQUE NONCLUSTERED ([certificateId]),
    CONSTRAINT [certificate_verifications_verificationCode_key] UNIQUE NONCLUSTERED ([verificationCode])
);

-- CreateTable
CREATE TABLE [dbo].[certificate_requests] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [studentId] NVARCHAR(1000) NOT NULL,
    [transcriptVersionId] NVARCHAR(1000),
    [certificateType] NVARCHAR(1000) NOT NULL,
    [requestedBy] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [certificate_requests_status_df] DEFAULT 'PENDING',
    [reason] NVARCHAR(max),
    [reviewedBy] NVARCHAR(1000),
    [reviewedAt] DATETIME2,
    [fulfilledCertificateId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [certificate_requests_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [certificate_requests_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_policies_organizationId_certificateType_idx] ON [dbo].[certificate_policies]([organizationId], [certificateType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_policies_organizationId_courseId_idx] ON [dbo].[certificate_policies]([organizationId], [courseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_policies_organizationId_status_idx] ON [dbo].[certificate_policies]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_policies_organizationId_deletedAt_idx] ON [dbo].[certificate_policies]([organizationId], [deletedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_templates_organizationId_certificateType_idx] ON [dbo].[certificate_templates]([organizationId], [certificateType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_templates_organizationId_courseId_idx] ON [dbo].[certificate_templates]([organizationId], [courseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_templates_organizationId_status_idx] ON [dbo].[certificate_templates]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_templates_organizationId_deletedAt_idx] ON [dbo].[certificate_templates]([organizationId], [deletedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificates_organizationId_studentId_idx] ON [dbo].[certificates]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificates_organizationId_enrollmentId_idx] ON [dbo].[certificates]([organizationId], [enrollmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificates_organizationId_courseId_idx] ON [dbo].[certificates]([organizationId], [courseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificates_organizationId_transcriptVersionId_idx] ON [dbo].[certificates]([organizationId], [transcriptVersionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificates_organizationId_certificateType_idx] ON [dbo].[certificates]([organizationId], [certificateType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificates_organizationId_status_idx] ON [dbo].[certificates]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificates_organizationId_issuedAt_idx] ON [dbo].[certificates]([organizationId], [issuedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificates_organizationId_deletedAt_idx] ON [dbo].[certificates]([organizationId], [deletedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_events_organizationId_certificateId_idx] ON [dbo].[certificate_events]([organizationId], [certificateId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_events_organizationId_eventType_idx] ON [dbo].[certificate_events]([organizationId], [eventType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_events_organizationId_createdAt_idx] ON [dbo].[certificate_events]([organizationId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_exports_organizationId_certificateId_idx] ON [dbo].[certificate_exports]([organizationId], [certificateId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_exports_organizationId_exportType_idx] ON [dbo].[certificate_exports]([organizationId], [exportType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_exports_organizationId_status_idx] ON [dbo].[certificate_exports]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_exports_organizationId_exportedAt_idx] ON [dbo].[certificate_exports]([organizationId], [exportedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_verifications_organizationId_publicStatus_idx] ON [dbo].[certificate_verifications]([organizationId], [publicStatus]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_verifications_organizationId_lastVerifiedAt_idx] ON [dbo].[certificate_verifications]([organizationId], [lastVerifiedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_requests_organizationId_studentId_idx] ON [dbo].[certificate_requests]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_requests_organizationId_transcriptVersionId_idx] ON [dbo].[certificate_requests]([organizationId], [transcriptVersionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_requests_organizationId_certificateType_idx] ON [dbo].[certificate_requests]([organizationId], [certificateType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_requests_organizationId_status_idx] ON [dbo].[certificate_requests]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_requests_organizationId_createdAt_idx] ON [dbo].[certificate_requests]([organizationId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certificate_requests_organizationId_deletedAt_idx] ON [dbo].[certificate_requests]([organizationId], [deletedAt]);

-- AddForeignKey
ALTER TABLE [dbo].[certificate_policies] ADD CONSTRAINT [certificate_policies_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_policies] ADD CONSTRAINT [certificate_policies_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_templates] ADD CONSTRAINT [certificate_templates_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_templates] ADD CONSTRAINT [certificate_templates_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificates] ADD CONSTRAINT [certificates_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificates] ADD CONSTRAINT [certificates_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificates] ADD CONSTRAINT [certificates_enrollmentId_fkey] FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificates] ADD CONSTRAINT [certificates_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[courses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificates] ADD CONSTRAINT [certificates_certificatePolicyId_fkey] FOREIGN KEY ([certificatePolicyId]) REFERENCES [dbo].[certificate_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificates] ADD CONSTRAINT [certificates_certificateTemplateId_fkey] FOREIGN KEY ([certificateTemplateId]) REFERENCES [dbo].[certificate_templates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_events] ADD CONSTRAINT [certificate_events_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_events] ADD CONSTRAINT [certificate_events_certificateId_fkey] FOREIGN KEY ([certificateId]) REFERENCES [dbo].[certificates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_exports] ADD CONSTRAINT [certificate_exports_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_exports] ADD CONSTRAINT [certificate_exports_certificateId_fkey] FOREIGN KEY ([certificateId]) REFERENCES [dbo].[certificates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_verifications] ADD CONSTRAINT [certificate_verifications_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_verifications] ADD CONSTRAINT [certificate_verifications_certificateId_fkey] FOREIGN KEY ([certificateId]) REFERENCES [dbo].[certificates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_requests] ADD CONSTRAINT [certificate_requests_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_requests] ADD CONSTRAINT [certificate_requests_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[students]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_requests] ADD CONSTRAINT [certificate_requests_fulfilledCertificateId_fkey] FOREIGN KEY ([fulfilledCertificateId]) REFERENCES [dbo].[certificates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- One ACTIVE org-default policy per (organizationId, certificateType) with no course override.
CREATE UNIQUE NONCLUSTERED INDEX [certificate_policies_org_default_active_key] ON [dbo].[certificate_policies]([organizationId], [certificateType]) WHERE [courseId] IS NULL AND [status] = 'ACTIVE' AND [deletedAt] IS NULL;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- One ACTIVE org-default template per (organizationId, certificateType, language) with no course override.
CREATE UNIQUE NONCLUSTERED INDEX [certificate_templates_org_default_active_key] ON [dbo].[certificate_templates]([organizationId], [certificateType], [language]) WHERE [courseId] IS NULL AND [status] = 'ACTIVE' AND [deletedAt] IS NULL;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- One certificate number per (organizationId, certificateNumber) among live, numbered rows.
CREATE UNIQUE NONCLUSTERED INDEX [certificates_org_certificate_number_key] ON [dbo].[certificates]([organizationId], [certificateNumber]) WHERE [certificateNumber] IS NOT NULL AND [deletedAt] IS NULL;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- Globally unique verification code among live rows with a code (public key, org-agnostic).
CREATE UNIQUE NONCLUSTERED INDEX [certificates_verification_code_key] ON [dbo].[certificates]([verificationCode]) WHERE [verificationCode] IS NOT NULL AND [deletedAt] IS NULL;

-- CreateIndex (filtered UNIQUE — migration-only; not expressible via Prisma @@unique)
-- At most one ACTIVE certificate per (organizationId, transcriptVersionId, certificateType).
-- "Active" excludes REVOKED and STALE so a reissue after revoke/stale is allowed.
CREATE UNIQUE NONCLUSTERED INDEX [certificates_active_per_transcript_type_key] ON [dbo].[certificates]([organizationId], [transcriptVersionId], [certificateType]) WHERE [status] <> 'REVOKED' AND [status] <> 'STALE' AND [deletedAt] IS NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
