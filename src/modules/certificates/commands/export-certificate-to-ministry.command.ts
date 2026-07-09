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
  exportCertificateToMinistrySchema,
  type ExportCertificateToMinistryInput,
} from "@/modules/certificates/schemas/certificate.schema";
import { buildVerificationUrl } from "@/modules/certificates/lib/certificate-verification-url";
import { findCertificateById } from "@/modules/certificates/repositories/certificate.repository";
import { findCertificateVerificationByCertificateId } from "@/modules/certificates/repositories/certificate-verification.repository";
import {
  createCertificateExport,
  updateCertificateExportStatus,
} from "@/modules/certificates/repositories/certificate-export.repository";
import { createCertificateEvent } from "@/modules/certificates/repositories/certificate-event.repository";
import { buildCertificateMinistryPayload } from "@/modules/certificates/export/certificate-ministry-payload";
import { formatMinistryPayload } from "@/modules/certificates/export/certificate-ministry-formatters";
import { certificateMinistryStorage } from "@/modules/certificates/export/certificate-ministry-storage";
import { certificateMinistryTransport } from "@/modules/certificates/export/certificate-ministry-transport";
import type {
  CertificateMinistryExportResultDto,
  CertificateMinistrySourceDto,
  CertificateMinistryStorage,
  CertificateMinistryTransport,
} from "@/modules/certificates/types/ministry";

// =============================================================================
// EXPORT CERTIFICATE TO MINISTRY COMMAND (Phase 11)
// -----------------------------------------------------------------------------
// Serializes an ISSUED certificate's FROZEN, privacy-minimized snapshot to a ministry
// artifact (JSON/CSV/XML) and submits it through a transport adapter, tracking it in a
// `CertificateExport` row with `exportType = MINISTRY`. It CONSUMES the frozen snapshots
// only — it NEVER reads Academic Core, the Transcript, grades, or attendance, NEVER
// recomputes eligibility, and NEVER mutates the certificate lifecycle (§2). It reads only
// `Certificate` + `CertificateVerification` (+ the organization name for display).
//
// Transaction discipline (mirrors Phase 8/8B): the payload is built, formatted, stored and
// transported OUTSIDE any DB transaction. Flow: create the export row PENDING → build →
// format → store + submit → in ONE short transaction flip it READY + append the
// `CertificateEvent` + write the AuditLog → publish the domain event AFTER commit. BOTH
// failure windows (build/format/store/transport AND finalize) flip the row FAILED on a
// best-effort basis and ALWAYS re-throw the ORIGINAL error; the certificate is never
// mutated and no domain event is published on failure.
//
// Ministry export is a SEPARATE type from PDF export (§1) — it does not touch the PDF
// renderer or the PDF storage key.
// =============================================================================

/** Only an ISSUED certificate may be ministry-exported (§2). SUSPENDED/REVOKED/STALE/
 *  DRAFT/PENDING_APPROVAL are refused — a suspended/annulled/non-issued record must not
 *  be submitted to a ministry as valid. */
const MINISTRY_EXPORTABLE_STATUS = CertificateStatus.ISSUED;

export interface ExportCertificateToMinistryDeps {
  transport: CertificateMinistryTransport;
  storage: CertificateMinistryStorage;
  /** Injected clock; defaults to wall-clock. Only stamps `exportedAt`/`submittedAt`. */
  now: () => Date;
  /** Public verification base URL; defaults to the environment-resolved value. */
  baseUrl?: string;
}

function parseSnapshot(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Full holder name from the frozen student snapshot (fullName, else first+last). */
function readFullName(studentSnapshot: string): string | null {
  const parsed = parseSnapshot(studentSnapshot);
  const full = typeof parsed.fullName === "string" ? parsed.fullName.trim() : "";
  if (full) return full;
  const composed = [parsed.firstName, parsed.lastName]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" ")
    .trim();
  return composed || null;
}

function readCourseName(courseSnapshot: string | null): string | null {
  if (!courseSnapshot) return null;
  const parsed = parseSnapshot(courseSnapshot);
  return typeof parsed.courseName === "string" ? parsed.courseName : null;
}

export class ExportCertificateToMinistryCommand extends BaseCommand<
  ExportCertificateToMinistryInput,
  CertificateMinistryExportResultDto
> {
  private readonly transport: CertificateMinistryTransport;
  private readonly storage: CertificateMinistryStorage;
  private readonly now: () => Date;
  private readonly baseUrl?: string;

  constructor(
    input: ExportCertificateToMinistryInput,
    context: ServiceContext,
    deps?: Partial<ExportCertificateToMinistryDeps>
  ) {
    super(input, context);
    this.transport = deps?.transport ?? certificateMinistryTransport;
    this.storage = deps?.storage ?? certificateMinistryStorage;
    this.now = deps?.now ?? (() => new Date());
    this.baseUrl = deps?.baseUrl;
  }

  async validate(): Promise<void> {
    const parsed = exportCertificateToMinistrySchema.safeParse(this.input);
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

  async execute(): Promise<CertificateMinistryExportResultDto> {
    const { organizationId, userId } = this.context;
    const { certificateId, format } = exportCertificateToMinistrySchema.parse(this.input);

    // 1. Load the certificate (org-scoped → a cross-tenant id is simply NOT_FOUND).
    const certificate = await findCertificateById({ id: certificateId, organizationId });
    if (!certificate) throw new NotFoundError("Certificate", certificateId);

    // 2. Export-state guard (§2): ONLY an ISSUED certificate may be ministry-exported.
    if (certificate.status !== MINISTRY_EXPORTABLE_STATUS) {
      throw new BusinessRuleError(
        `Only an ISSUED certificate can be exported to a ministry (current status: ${certificate.status}).`
      );
    }

    // 3. Frozen issue metadata must be present — you cannot submit an unnumbered /
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
    const verification = await findCertificateVerificationByCertificateId({
      organizationId,
      certificateId: certificate.id,
    });
    if (!verification) {
      throw new BusinessRuleError("Certificate has no verification projection.");
    }

    // 5. Assemble the MINIMIZED source (§3/§11) from FROZEN certificate fields only.
    const organization = await findOrganizationById(organizationId);
    const verificationUrl = buildVerificationUrl({
      verificationCode: verification.verificationCode,
      existingUrl: certificate.verificationUrl,
      baseUrl: this.baseUrl,
    });
    const source: CertificateMinistrySourceDto = {
      certificateNumber: certificate.certificateNumber,
      certificateType: certificate.certificateType,
      studentName: readFullName(certificate.studentSnapshot),
      courseName: readCourseName(certificate.courseSnapshot),
      organizationName: (organization?.name as string | undefined) ?? null,
      issuedAt: certificate.issuedAt,
      expiresAt: certificate.expiresAt,
      verificationCode: verification.verificationCode,
      verificationUrl,
      certificateChecksum: certificate.checksum,
      status: certificate.status,
    };
    // NOTE: the QR payload (a public pointer to `verificationUrl`) is intentionally NOT
    // part of the ministry payload — `verificationUrl` itself already travels.

    // 6. Create the export row PENDING — OUTSIDE any long-running transaction.
    const exportRow = await createCertificateExport({
      organizationId,
      certificateId: certificate.id,
      exportType: CertificateExportType.MINISTRY,
      status: CertificateExportStatus.PENDING,
    });

    // 7. Build (pure) → format (pure) → store + submit (NO DB transaction held). On any
    //    failure, flip the row FAILED (best-effort) and re-throw the ORIGINAL error.
    const exportedAt = this.now();
    let stored;
    let transportResult;
    try {
      const payload = buildCertificateMinistryPayload(source);
      const artifact = formatMinistryPayload(payload, format);
      stored = await this.storage.store({
        organizationId,
        certificateId: certificate.id,
        exportId: exportRow.id,
        format,
        artifact,
      });
      transportResult = await this.transport.submit(artifact, {
        certificateId: certificate.id,
        certificateNumber: certificate.certificateNumber,
        format,
        payloadChecksum: stored.fileChecksum,
        submittedAt: exportedAt,
      });
    } catch (err) {
      await this.markFailedBestEffort(exportRow.id, organizationId);
      throw err;
    }

    // 8. Finalize atomically: READY + append-only event + audit, in ONE short tx.
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
          throw new BusinessRuleError("Certificate ministry export row could not be finalized.");
        }

        const eventMetadata = {
          exportId: exportRow.id,
          exportType: CertificateExportType.MINISTRY,
          format,
          externalReference: transportResult.externalReference,
          payloadChecksum: stored.fileChecksum,
          certificateNumber: certificate.certificateNumber,
          certificateType: certificate.certificateType,
        };

        await createCertificateEvent(
          {
            organizationId,
            certificateId: certificate.id,
            eventType: DomainEventType.CERTIFICATE_EXPORTED,
            previousStatus: certificate.status,
            newStatus: certificate.status, // export is not a lifecycle transition
            actorId: userId,
            reason: null,
            metadata: JSON.stringify(eventMetadata),
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
              exportType: CertificateExportType.MINISTRY,
              format,
              status: CertificateExportStatus.READY,
              externalReference: transportResult.externalReference,
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
            certificateType: certificate.certificateType,
            exportId: exportRow.id,
            exportType: CertificateExportType.MINISTRY,
            format,
            externalReference: transportResult.externalReference,
            payloadChecksum: stored.fileChecksum,
            actorId: userId,
            occurredAt: exportedAt,
          },
        });
      });
    } catch (err) {
      await this.markFailedBestEffort(exportRow.id, organizationId);
      throw err;
    }

    // 9. Publish the domain event ONLY after commit.
    await certificateOutbox.dispatch(events);

    return {
      exportId: exportRow.id,
      certificateId: certificate.id,
      exportType: CertificateExportType.MINISTRY,
      format,
      status: CertificateExportStatus.READY,
      externalReference: transportResult.externalReference,
      fileChecksum: stored.fileChecksum,
      exportedAt,
    };
  }

  /** Flip the export row to FAILED without ever throwing — the caller is already
   *  unwinding on the ORIGINAL error and a FAILED-marking failure must not mask it. */
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
}
