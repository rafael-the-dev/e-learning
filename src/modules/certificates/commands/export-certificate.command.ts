import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DomainAggregateType, DomainEventType } from "@/server/events/event-types";
import type { DomainEvent } from "@/server/events/domain-event";
import { certificateOutbox } from "@/modules/certificates/outbox";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findOrganizationById } from "@/modules/organizations/repositories/organization.repository";
import {
  CertificateExportStatus,
  CertificateExportType,
  CertificateStatus,
} from "@/modules/certificates/constants";
import {
  exportCertificateSchema,
  type ExportCertificateInput,
} from "@/modules/certificates/schemas/certificate.schema";
import {
  buildQrPayload,
  buildVerificationUrl,
} from "@/modules/certificates/lib/certificate-verification-url";
import {
  readCourseName,
  readStudentFullName,
} from "@/modules/certificates/lib/certificate-snapshot";
import { findCertificateById } from "@/modules/certificates/repositories/certificate.repository";
import {
  findCertificateTemplateById,
  findDefaultActiveTemplate,
} from "@/modules/certificates/repositories/certificate-template.repository";
import { findCertificateVerificationByCertificateId } from "@/modules/certificates/repositories/certificate-verification.repository";
import {
  createCertificateExport,
  updateCertificateExportStatus,
} from "@/modules/certificates/repositories/certificate-export.repository";
import { createCertificateEvent } from "@/modules/certificates/repositories/certificate-event.repository";
import { certificatePdfRenderer } from "@/modules/certificates/export/certificate-pdf-renderer";
import { certificateExportStorage } from "@/modules/certificates/export/certificate-export-storage";
import type { CertificateRecord } from "@/modules/certificates/types/repository";
import type {
  CertificateExportResultDto,
  CertificatePdfRenderer,
  CertificateExportStorage,
  CertificateRenderDto,
  CertificateTemplateView,
} from "@/modules/certificates/types/export";

// =============================================================================
// EXPORT CERTIFICATE COMMAND (Phase 8)
// -----------------------------------------------------------------------------
// Renders an ISSUED (or SUSPENDED) certificate to a PDF artifact and tracks it in a
// `CertificateExport` row. It CONSUMES the frozen certificate snapshots — it NEVER
// reads Academic Core, the Transcript, grades, or attendance, and NEVER recomputes
// eligibility (§2). It reads only `Certificate`, `CertificateTemplate`, and
// `CertificateVerification`, plus the organization name for display.
//
// Transaction discipline (§11): the PDF is rendered and stored OUTSIDE any DB
// transaction. Flow: create the export row `PENDING` → render → store → in ONE short
// transaction flip it `READY` + append the `CertificateEvent` + write the AuditLog →
// publish the domain event AFTER commit. On render/storage failure the row is flipped
// `FAILED` and the error re-thrown; the certificate itself is never mutated — in
// particular `Certificate.checksum` is never touched (the file checksum is separate, §8).
//
// Failure hardening (Phase 8B): BOTH failure windows — render/storage AND the finalize
// transaction — flip the row to `FAILED` on a best-effort basis and ALWAYS re-throw the
// ORIGINAL error. A failure while marking `FAILED` is swallowed so it can never mask the
// true cause. A finalize failure never publishes a domain event and never mutates the
// certificate; the stored artifact may be orphaned (a cleanup job is future work).
// =============================================================================

/** Statuses whose certificate may be exported (§1). REVOKED / DRAFT / PENDING_APPROVAL
 *  / STALE are refused — a stale or non-issued certificate must not produce an artifact. */
const EXPORTABLE_STATUSES: ReadonlySet<string> = new Set([
  CertificateStatus.ISSUED,
  CertificateStatus.SUSPENDED,
]);

/** Language of the default template resolved when a certificate pins none (§3). */
const DEFAULT_TEMPLATE_LANGUAGE = "pt-PT";

export interface ExportCertificateDeps {
  renderer: CertificatePdfRenderer;
  storage: CertificateExportStorage;
  /** Injected clock; defaults to wall-clock. Only stamps `exportedAt` (not a rule). */
  now: () => Date;
  /** Public verification base URL; defaults to the environment-resolved value. */
  baseUrl?: string;
}

export class ExportCertificateCommand extends BaseCommand<
  ExportCertificateInput,
  CertificateExportResultDto
> {
  private readonly renderer: CertificatePdfRenderer;
  private readonly storage: CertificateExportStorage;
  private readonly now: () => Date;
  private readonly baseUrl?: string;

  constructor(
    input: ExportCertificateInput,
    context: ServiceContext,
    deps?: Partial<ExportCertificateDeps>
  ) {
    super(input, context);
    this.renderer = deps?.renderer ?? certificatePdfRenderer;
    this.storage = deps?.storage ?? certificateExportStorage;
    this.now = deps?.now ?? (() => new Date());
    this.baseUrl = deps?.baseUrl;
  }

  async validate(): Promise<void> {
    const parsed = exportCertificateSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CERTIFICATES_EXPORT)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<CertificateExportResultDto> {
    const { organizationId, userId } = this.context;
    const { certificateId, exportType } = exportCertificateSchema.parse(this.input);

    // Only PDF is produced this phase (API/MINISTRY are later phases).
    if (exportType !== CertificateExportType.PDF) {
      throw new BusinessRuleError(`Unsupported export type: ${exportType}.`);
    }

    // 1. Load the certificate (org-scoped → a cross-tenant id is simply NOT_FOUND).
    const certificate = await findCertificateById({ id: certificateId, organizationId });
    if (!certificate) throw new NotFoundError("Certificate", certificateId);

    // 2. Export-state guard (§1): only ISSUED or SUSPENDED, and never a stale one.
    if (!EXPORTABLE_STATUSES.has(certificate.status)) {
      throw new BusinessRuleError(
        `Only an ISSUED or SUSPENDED certificate can be exported (current status: ${certificate.status}).`
      );
    }

    // 3. Frozen issue metadata must be present — you cannot export an unnumbered /
    //    unsigned / unverifiable certificate.
    if (!certificate.certificateNumber) {
      throw new BusinessRuleError("Certificate has no certificate number.");
    }
    if (!certificate.checksum) {
      throw new BusinessRuleError("Certificate has no checksum.");
    }
    if (!certificate.verificationCode) {
      throw new BusinessRuleError("Certificate has no verification code.");
    }

    // 4. The 1:1 verification projection is the authoritative public pointer.
    const verification = await findCertificateVerificationByCertificateId(
      { organizationId, certificateId: certificate.id }
    );
    if (!verification) {
      throw new BusinessRuleError("Certificate has no verification projection.");
    }

    // 5. Resolve the template (§3): the pinned one, else the active org-default for
    //    the type + pt-PT. No template → no render.
    const template = await this.resolveTemplate(certificate);

    // 6. Build the privacy-safe render DTO (§2/§12) from FROZEN snapshots only.
    const organization = await findOrganizationById(organizationId);
    const verificationUrl = buildVerificationUrl({
      verificationCode: verification.verificationCode,
      existingUrl: certificate.verificationUrl,
      baseUrl: this.baseUrl,
    });
    const renderDto: CertificateRenderDto = {
      certificateNumber: certificate.certificateNumber,
      certificateType: certificate.certificateType,
      studentDisplayName: readStudentFullName(certificate.studentSnapshot),
      courseName: readCourseName(certificate.courseSnapshot),
      organizationName: (organization?.name as string | undefined) ?? null,
      issuedAt: certificate.issuedAt,
      expiresAt: certificate.expiresAt,
      verificationUrl,
      qrPayload: buildQrPayload(verificationUrl),
      templateData: {
        templateName: template.name,
        language: template.language,
        backgroundImageUrl: template.backgroundImageUrl,
        signatureImageUrl: template.signatureImageUrl,
        sealImageUrl: template.sealImageUrl,
      },
    };

    // 7. Create the export row PENDING — OUTSIDE any long-running transaction (§11).
    const exportRow = await createCertificateExport({
      organizationId,
      certificateId: certificate.id,
      exportType,
      status: CertificateExportStatus.PENDING,
    });

    // 8. Render + store the artifact (NO DB transaction held). On any failure, flip
    //    the row FAILED (best-effort) and re-throw the ORIGINAL error — the certificate
    //    is never mutated.
    let stored;
    try {
      const artifact = await this.renderer.render({ render: renderDto, template });
      stored = await this.storage.store({
        organizationId,
        certificateId: certificate.id,
        exportId: exportRow.id,
        exportType,
        artifact,
      });
    } catch (err) {
      await this.markFailedBestEffort(exportRow.id, organizationId);
      throw err;
    }

    // 9. Finalize atomically: READY + append-only event + audit, in ONE short tx.
    //    If the tx fails, the artifact is already stored but the row must NOT stay
    //    PENDING: flip it FAILED (best-effort) and re-throw the ORIGINAL finalize error.
    //    No domain event is published and the certificate is never mutated.
    const exportedAt = this.now();
    const db = await getDb();
    const events: DomainEvent[] = [];

    try {
      await db.$transaction(async (tx: PrismaClientOrTx) => {
        const marked = await updateCertificateExportStatus(
          {
            id: exportRow.id,
            organizationId,
            status: CertificateExportStatus.READY,
            fileUrl: stored.fileUrl,
            fileChecksum: stored.fileChecksum,
            exportedBy: userId,
            exportedAt,
          },
          tx
        );
        if (marked.count !== 1) {
          throw new BusinessRuleError("Certificate export row could not be finalized.");
        }

        await createCertificateEvent(
          {
            organizationId,
            certificateId: certificate.id,
            eventType: DomainEventType.CERTIFICATE_EXPORTED,
            previousStatus: certificate.status,
            newStatus: certificate.status, // export is not a lifecycle transition
            actorId: userId,
            reason: null,
            metadata: JSON.stringify({
              exportId: exportRow.id,
              exportType,
              fileChecksum: stored.fileChecksum,
              storageKey: stored.storageKey,
              certificateNumber: certificate.certificateNumber,
            }),
          },
          tx
        );

        await auditService.log(
          this.context,
          {
            entity: "Certificate",
            entityId: certificate.id,
            action: DomainEventType.CERTIFICATE_EXPORTED,
            oldValues: null,
            newValues: {
              exportId: exportRow.id,
              exportType,
              status: CertificateExportStatus.READY,
              fileUrl: stored.fileUrl,
              fileChecksum: stored.fileChecksum,
              exportedAt,
            },
          },
          tx
        );

        events.push({
          organizationId,
          eventType: DomainEventType.CERTIFICATE_EXPORTED,
          aggregateType: DomainAggregateType.CERTIFICATE,
          aggregateId: certificate.id,
          actorId: userId,
          payload: {
            organizationId,
            certificateId: certificate.id,
            certificateNumber: certificate.certificateNumber,
            exportId: exportRow.id,
            exportType,
            fileChecksum: stored.fileChecksum,
            actorId: userId,
            occurredAt: exportedAt,
          },
        });
      });
    } catch (err) {
      // Finalize failed and rolled back (no READY, no event/audit row). Mark the row
      // FAILED best-effort and surface the ORIGINAL error. The stored artifact may now
      // be orphaned — a cleanup job is future work (never delete it here).
      await this.markFailedBestEffort(exportRow.id, organizationId);
      throw err;
    }

    // 10. Publish the domain event ONLY after commit.
    await certificateOutbox.dispatch(events);

    return {
      exportId: exportRow.id,
      certificateId: certificate.id,
      exportType,
      status: CertificateExportStatus.READY,
      fileUrl: stored.fileUrl,
      fileChecksum: stored.fileChecksum,
      exportedAt,
    };
  }

  /** Flip the export row to FAILED without ever throwing — the caller is already
   *  unwinding on the ORIGINAL error and a FAILED-marking failure must not mask it.
   *  Swallows (does not rethrow) any error from the status update. */
  private async markFailedBestEffort(exportId: string, organizationId: string): Promise<void> {
    try {
      await updateCertificateExportStatus({
        id: exportId,
        organizationId,
        status: CertificateExportStatus.FAILED,
      });
    } catch {
      // Best-effort only: the row may stay PENDING, but the original error must win.
    }
  }

  /** Pinned template → active org-default (type + pt-PT). Missing → TEMPLATE_NOT_FOUND. */
  private async resolveTemplate(certificate: CertificateRecord): Promise<CertificateTemplateView> {
    const { organizationId } = this.context;
    const record = certificate.certificateTemplateId
      ? await findCertificateTemplateById({
          id: certificate.certificateTemplateId,
          organizationId,
        })
      : await findDefaultActiveTemplate({
          organizationId,
          certificateType: certificate.certificateType,
          language: DEFAULT_TEMPLATE_LANGUAGE,
        });

    if (!record) {
      throw new BusinessRuleError("TEMPLATE_NOT_FOUND");
    }

    return {
      templateId: record.id,
      name: record.name,
      language: record.language,
      layoutJson: record.layoutJson,
      templateHtml: record.templateHtml,
      backgroundImageUrl: record.backgroundImageUrl,
      signatureImageUrl: record.signatureImageUrl,
      sealImageUrl: record.sealImageUrl,
    };
  }
}
