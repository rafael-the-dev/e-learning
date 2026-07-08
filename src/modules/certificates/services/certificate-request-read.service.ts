import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { resolveStudentScope } from "@/server/auth/student-scope";
import { CertificateRequestStatus } from "@/modules/certificates/constants";
import {
  countCertificateRequests,
  listCertificateRequests,
} from "@/modules/certificates/repositories/certificate-request.repository";
import type { CertificateRequestListFilters } from "@/modules/certificates/types/repository";
import type { CertificateRequestRecord } from "@/modules/certificates/types/repository";
import type {
  CertificateRequestAdminListFilters,
  CertificateRequestAllowedActions,
  CertificateRequestListItemDto,
  CertificateRequestListResult,
  CertificateRequestStudentListFilters,
} from "@/modules/certificates/types/portal";

// =============================================================================
// CERTIFICATE REQUEST READ SERVICES (Phase 12) — READ-ONLY
// -----------------------------------------------------------------------------
// The read models for the certificate-request workflow: an ADMIN/secretary list
// (org-scoped, filtered, paginated) and a STUDENT list (own requests only). They
// compute `allowedActions` server-side and expose NO audit metadata. No business
// decision, no eligibility, no Academic Core / Transcript read, no writes.
// =============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** The caller's request-workflow capabilities (per row for `isRequester`). */
export interface RequestActionCaps {
  /** Staff review capability (`certificates.generate`). */
  canReview: boolean;
  /** The caller created this request. */
  isRequester: boolean;
  /** The caller holds `certificates.request` (requester-cancel gate). */
  canRequest: boolean;
}

/** Compute the per-request action flags server-side (permissions + status). Pure. */
export function computeRequestAllowedActions(
  status: string,
  transcriptVersionId: string | null,
  caps: RequestActionCaps
): CertificateRequestAllowedActions {
  const isPending = status === CertificateRequestStatus.PENDING;
  const isApproved = status === CertificateRequestStatus.APPROVED;
  return {
    canApprove: caps.canReview && isPending,
    canReject: caps.canReview && isPending,
    canFulfill: caps.canReview && isApproved && Boolean(transcriptVersionId),
    canCancel:
      (caps.canReview && (isPending || isApproved)) ||
      (caps.isRequester && caps.canRequest && isPending),
  };
}

function toListItemDto(
  request: CertificateRequestRecord,
  caps: RequestActionCaps
): CertificateRequestListItemDto {
  return {
    requestId: request.id,
    studentId: request.studentId,
    certificateType: request.certificateType,
    status: request.status,
    transcriptVersionId: request.transcriptVersionId,
    reason: request.reason,
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
    fulfilledCertificateId: request.fulfilledCertificateId,
    allowedActions: computeRequestAllowedActions(request.status, request.transcriptVersionId, caps),
  };
}

function clampPage(filters: { page?: number; pageSize?: number }): { page: number; pageSize: number } {
  return {
    page: Math.max(1, filters.page ?? 1),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE)),
  };
}

export class CertificateRequestAdminReadService {
  async list(
    context: AuthContext,
    filters: CertificateRequestAdminListFilters = {}
  ): Promise<CertificateRequestListResult> {
    if (!context.ability.can(PERMISSIONS.CERTIFICATES_VIEW)) {
      throw new AuthorizationError();
    }
    const { organizationId, userId } = context;
    const { page, pageSize } = clampPage(filters);

    const repoFilters: CertificateRequestListFilters = {
      organizationId,
      status: filters.status,
      studentId: filters.studentId,
      certificateType: filters.certificateType,
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
    };

    const [rows, total] = await Promise.all([
      listCertificateRequests({ ...repoFilters, skip: (page - 1) * pageSize, take: pageSize }),
      countCertificateRequests(repoFilters),
    ]);

    const canReview = context.ability.can(PERMISSIONS.CERTIFICATES_GENERATE);
    const canRequest = context.ability.can(PERMISSIONS.CERTIFICATES_REQUEST);
    const items = rows.map((r) =>
      toListItemDto(r, { canReview, isRequester: r.requestedBy === userId, canRequest })
    );

    return { items, total, page, pageSize };
  }
}

export class CertificateRequestStudentReadService {
  async list(
    context: AuthContext,
    filters: CertificateRequestStudentListFilters = {}
  ): Promise<CertificateRequestListResult> {
    if (!context.ability.can(PERMISSIONS.CERTIFICATES_REQUEST)) {
      throw new AuthorizationError();
    }
    const scope = await resolveStudentScope(context);
    if (!scope.isStudentScoped || !scope.studentId) {
      throw new AuthorizationError();
    }
    const { organizationId } = context;
    const studentId = scope.studentId; // own scope — never from input
    const { page, pageSize } = clampPage(filters);

    const repoFilters: CertificateRequestListFilters = {
      organizationId,
      studentId,
      status: filters.status,
      certificateType: filters.certificateType,
    };

    const [rows, total] = await Promise.all([
      listCertificateRequests({ ...repoFilters, skip: (page - 1) * pageSize, take: pageSize }),
      countCertificateRequests(repoFilters),
    ]);

    // A student is the requester of their own requests; only PENDING is cancellable.
    const items = rows.map((r) =>
      toListItemDto(r, { canReview: false, isRequester: true, canRequest: true })
    );

    return { items, total, page, pageSize };
  }
}

export const certificateRequestAdminReadService = new CertificateRequestAdminReadService();
export const certificateRequestStudentReadService = new CertificateRequestStudentReadService();
