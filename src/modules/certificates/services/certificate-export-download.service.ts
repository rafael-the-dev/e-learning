import { AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { isStudentScopedRoles, resolveStudentScope } from "@/server/auth/student-scope";
import { CertificateExportStatus } from "@/modules/certificates/constants";
import { findCertificateExportDownloadById } from "@/modules/certificates/repositories/certificate-export.repository";
import { buildExportStorageKey } from "@/modules/certificates/export/certificate-export-storage";
import {
  certificateExportStorageReader,
  type CertificateExportStorageReader,
} from "@/modules/certificates/export/certificate-export-storage-reader";
import type { CertificateExportDownloadResult } from "@/modules/certificates/types/export";

// =============================================================================
// CERTIFICATE EXPORT DOWNLOAD SERVICE (Phase 8C) — authorize + stream, read-only
// -----------------------------------------------------------------------------
// The server-side gate for downloading a READY certificate export. It authorizes
// the caller, loads the org-scoped export+certificate metadata, enforces the READY
// state, derives the INTERNAL storage key server-side, and returns the artifact
// bytes for the route to stream. It performs NO write, reads NO Transcript / Academic
// Core / Grade / Attendance table, and never exposes the storage key or `fileUrl`.
//
// Authorization (§2), all server-side, `organizationId` from the context only:
//   • ORG_ADMIN / SUPER_ADMIN / SECRETARY — anyone holding `certificates.view` or
//     `certificates.export` may download any export IN THEIR TENANT (cross-tenant is
//     a NOT_FOUND, since the load is org-scoped).
//   • STUDENT — only their OWN certificate's export, and only with
//     `certificates.viewOwn`. `studentId` is resolved from the session
//     (Student.userId), never from input; a mismatch is denied.
//   • TEACHER / GUARDIAN — no certificate permission ⇒ denied. Guardian-scoped
//     certificate visibility is intentionally DEFERRED (documented, Phase 8C).
//
// Error mapping is expressed via typed errors the route translates: NotFoundError →
// 404 (absent / cross-tenant / deleted certificate / non-READY when not the owner),
// AuthorizationError → 403, BusinessRuleError → 409 (the owner's export is not READY),
// storage read failure → propagated (route → generic 500).
// =============================================================================

type Access = "staff" | "own";

export interface CertificateExportDownloadDeps {
  reader: CertificateExportStorageReader;
}

export class CertificateExportDownloadService {
  private readonly reader: CertificateExportStorageReader;

  constructor(deps?: Partial<CertificateExportDownloadDeps>) {
    this.reader = deps?.reader ?? certificateExportStorageReader;
  }

  async download(context: AuthContext, exportId: string): Promise<CertificateExportDownloadResult> {
    const { organizationId } = context;

    // 1. Load org-scoped metadata. Absent / cross-tenant / deleted certificate → 404.
    const record = await findCertificateExportDownloadById({ organizationId, exportId });
    if (!record) throw new NotFoundError("CertificateExport", exportId);

    // 2. Authorize (server-side; never trust an org/student id from input).
    const access = await this.authorize(context, record.certificateStudentId);

    // 3. Only a READY export is downloadable. The owner sees a not-ready OWN export as
    //    409 (it exists and is theirs, just not ready); everyone else sees 404.
    if (record.status !== CertificateExportStatus.READY) {
      if (access === "own") {
        throw new BusinessRuleError("EXPORT_NOT_READY");
      }
      throw new NotFoundError("CertificateExport", exportId);
    }

    // 4. Derive the INTERNAL storage key server-side and stream the bytes. A missing
    //    object throws out of the reader → the route maps it to a generic 500.
    const storageKey = buildExportStorageKey({
      organizationId,
      certificateId: record.certificateId,
      exportId: record.exportId,
    });
    const buffer = await this.reader.read(storageKey);

    return {
      buffer,
      contentType: "application/pdf",
      certificateNumber: record.certificateNumber ?? record.exportId,
      fileChecksum: record.fileChecksum,
    };
  }

  /** Resolve the access level or throw AuthorizationError (403). */
  private async authorize(context: AuthContext, certificateStudentId: string): Promise<Access> {
    const canStaff =
      context.ability.can(PERMISSIONS.CERTIFICATES_VIEW) ||
      context.ability.can(PERMISSIONS.CERTIFICATES_EXPORT);
    if (canStaff) return "staff";

    // Only a student-scoped caller holding `certificates.viewOwn` may proceed, and
    // only for their OWN certificate. studentId is resolved from the session.
    if (
      !isStudentScopedRoles(context.roles) ||
      !context.ability.can(PERMISSIONS.CERTIFICATES_VIEW_OWN)
    ) {
      throw new AuthorizationError();
    }

    const scope = await resolveStudentScope(context);
    if (!scope.studentId || scope.studentId !== certificateStudentId) {
      throw new AuthorizationError();
    }
    return "own";
  }
}

export const certificateExportDownloadService = new CertificateExportDownloadService();
