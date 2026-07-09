import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  CERTIFICATE_LIST_DEFAULT_PAGE_SIZE,
  CERTIFICATE_LIST_MAX_PAGE_SIZE,
} from "@/modules/certificates/constants";
import {
  countCertificates,
  findCertificateDetailById,
  listCertificates,
} from "@/modules/certificates/repositories/certificate.repository";
import { listVerificationsByCertificateIds } from "@/modules/certificates/repositories/certificate-verification.repository";
import { listCertificateIdsWithReadyExport } from "@/modules/certificates/repositories/certificate-export.repository";
import type { CertificateListFilters } from "@/modules/certificates/types/repository";
import type {
  AdminCertificateDetailDto,
  CertificateAdminListFilters,
  CertificateListResult,
} from "@/modules/certificates/types/portal";
import {
  toAdminDetailDto,
  toListItemDto,
  type CertificateActionCaps,
} from "./certificate-portal.mapper";

// =============================================================================
// CERTIFICATE ADMIN READ SERVICE (Phase 10) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// The read model for the admin / secretary certificate portal. It lists + details
// certificates IN THE CALLER'S TENANT, deriving `allowedActions` from the caller's
// certificate permissions. It makes NO business decision (no eligibility, no
// lifecycle) and NEVER reads Academic Core / Transcript / Grade / Attendance — all
// display data comes from the certificate's own frozen columns/snapshots. Writes
// happen only through the commands the routes invoke, never here.
// =============================================================================

const DEFAULT_PAGE_SIZE = CERTIFICATE_LIST_DEFAULT_PAGE_SIZE;
const MAX_PAGE_SIZE = CERTIFICATE_LIST_MAX_PAGE_SIZE;

/** Resolve the caller's action capabilities from RBAC (restore reuses `suspend`). */
function resolveCaps(context: AuthContext): CertificateActionCaps {
  return {
    canIssue: context.ability.can(PERMISSIONS.CERTIFICATES_ISSUE),
    canRevoke: context.ability.can(PERMISSIONS.CERTIFICATES_REVOKE),
    canSuspend: context.ability.can(PERMISSIONS.CERTIFICATES_SUSPEND),
    canRestore: context.ability.can(PERMISSIONS.CERTIFICATES_SUSPEND),
    canExport: context.ability.can(PERMISSIONS.CERTIFICATES_EXPORT),
    canView: true,
  };
}

export class CertificateAdminReadService {
  /** Require `certificates.view` in the caller's active org. */
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.CERTIFICATES_VIEW)) {
      throw new AuthorizationError();
    }
  }

  async list(
    context: AuthContext,
    filters: CertificateAdminListFilters = {}
  ): Promise<CertificateListResult> {
    this.assertCanView(context);
    const { organizationId } = context;

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

    const repoFilters: CertificateListFilters = {
      organizationId,
      studentId: filters.studentId,
      courseId: filters.courseId,
      certificateType: filters.certificateType,
      status: filters.status,
      issuedFrom: filters.issuedFrom,
      issuedTo: filters.issuedTo,
      search: filters.search,
    };

    const [rows, total] = await Promise.all([
      listCertificates({ ...repoFilters, skip: (page - 1) * pageSize, take: pageSize }),
      countCertificates(repoFilters),
    ]);

    // Batch the projection + READY-export lookups (no N+1).
    const ids = rows.map((r) => r.id);
    const [verifications, readyIds] = await Promise.all([
      listVerificationsByCertificateIds({ organizationId, certificateIds: ids }),
      listCertificateIdsWithReadyExport({ organizationId, certificateIds: ids }),
    ]);
    const publicStatusById = new Map(verifications.map((v) => [v.certificateId, v.publicStatus]));
    const readySet = new Set(readyIds);
    const caps = resolveCaps(context);

    const items = rows.map((cert) =>
      toListItemDto(cert, {
        publicStatus: publicStatusById.get(cert.id) ?? null,
        hasReadyExport: readySet.has(cert.id),
        caps,
      })
    );

    return { items, total, page, pageSize };
  }

  async getDetail(
    context: AuthContext,
    certificateId: string
  ): Promise<AdminCertificateDetailDto | null> {
    this.assertCanView(context);
    const record = await findCertificateDetailById({
      id: certificateId,
      organizationId: context.organizationId,
    });
    if (!record) return null;
    return toAdminDetailDto(record, resolveCaps(context));
  }
}

export const certificateAdminReadService = new CertificateAdminReadService();
