import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { resolveStudentScope } from "@/server/auth/student-scope";
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
import type {
  CertificateListResult,
  CertificateStudentListFilters,
  StudentCertificateDetailDto,
} from "@/modules/certificates/types/portal";
import { READONLY_CAPS, toListItemDto, toStudentDetailDto } from "./certificate-portal.mapper";

// =============================================================================
// CERTIFICATE STUDENT READ SERVICE (Phase 10) — own-scope, READ-ONLY
// -----------------------------------------------------------------------------
// The read model for the STUDENT certificate portal. It only ever returns the
// authenticated student's OWN certificates: `studentId` is resolved server-side
// from the session (Student.userId via resolveStudentScope), NEVER from input, and
// a detail read for another student's certificate is a not-found. It requires
// `certificates.viewOwn`. It produces the REDACTED student DTOs (no audit/events,
// no checksums, no transcript pointer, no finance reference). No writes, no
// eligibility, no Academic Core / Transcript read.
// =============================================================================

const DEFAULT_PAGE_SIZE = CERTIFICATE_LIST_DEFAULT_PAGE_SIZE;
const MAX_PAGE_SIZE = CERTIFICATE_LIST_MAX_PAGE_SIZE;

/** Resolve the caller's OWN studentId or throw. Requires `certificates.viewOwn` AND
 *  a student-scoped session linked to a Student profile. */
async function resolveOwnStudentId(context: AuthContext): Promise<string> {
  if (!context.ability.can(PERMISSIONS.CERTIFICATES_VIEW_OWN)) {
    throw new AuthorizationError();
  }
  const scope = await resolveStudentScope(context);
  if (!scope.isStudentScoped || !scope.studentId) {
    throw new AuthorizationError();
  }
  return scope.studentId;
}

export class CertificateStudentReadService {
  async list(
    context: AuthContext,
    filters: CertificateStudentListFilters = {}
  ): Promise<CertificateListResult> {
    const studentId = await resolveOwnStudentId(context);
    const { organizationId } = context;

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

    // Same own-scoped filter for the page read and the total count.
    const scopedFilters = {
      organizationId,
      studentId, // own scope — never from input
      certificateType: filters.certificateType,
      status: filters.status,
    };
    const [rows, total] = await Promise.all([
      listCertificates({ ...scopedFilters, skip: (page - 1) * pageSize, take: pageSize }),
      countCertificates(scopedFilters),
    ]);

    const ids = rows.map((r) => r.id);
    const [verifications, readyIds] = await Promise.all([
      listVerificationsByCertificateIds({ organizationId, certificateIds: ids }),
      listCertificateIdsWithReadyExport({ organizationId, certificateIds: ids }),
    ]);
    const publicStatusById = new Map(verifications.map((v) => [v.certificateId, v.publicStatus]));
    const readySet = new Set(readyIds);

    const items = rows.map((cert) =>
      toListItemDto(cert, {
        publicStatus: publicStatusById.get(cert.id) ?? null,
        hasReadyExport: readySet.has(cert.id),
        caps: READONLY_CAPS,
      })
    );

    // `total` is the full own-scoped count (so pagination past the first page works).
    return { items, total, page, pageSize };
  }

  async getDetail(
    context: AuthContext,
    certificateId: string
  ): Promise<StudentCertificateDetailDto | null> {
    const studentId = await resolveOwnStudentId(context);
    const record = await findCertificateDetailById({
      id: certificateId,
      organizationId: context.organizationId,
    });
    // Not found OR not owned by this student → indistinguishable not-found (no leak).
    if (!record || record.studentId !== studentId) return null;
    return toStudentDetailDto(record);
  }
}

export const certificateStudentReadService = new CertificateStudentReadService();
