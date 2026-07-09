import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CertificateRequestListFilters,
  CertificateRequestRecord,
} from "@/modules/certificates/types/repository";

// =============================================================================
// CERTIFICATE REQUEST REPOSITORY (Phase 2B) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for the request workflow row. It makes NO workflow decision:
// no approval/rejection rule, no fulfilment logic — a command sets `status`,
// `reviewedBy`, `reviewedAt`, `fulfilledCertificateId` and this layer persists
// them. Org-scoped throughout; soft delete only sets `deletedAt`; no hard delete.
// =============================================================================

const requestSelect = {
  id: true,
  organizationId: true,
  studentId: true,
  transcriptVersionId: true,
  certificateType: true,
  requestedBy: true,
  status: true,
  reason: true,
  reviewedBy: true,
  reviewedAt: true,
  fulfilledCertificateId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): CertificateRequestRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    studentId: row.studentId as string,
    transcriptVersionId: (row.transcriptVersionId as string | null) ?? null,
    certificateType: row.certificateType as string,
    requestedBy: row.requestedBy as string,
    status: row.status as string,
    reason: (row.reason as string | null) ?? null,
    reviewedBy: (row.reviewedBy as string | null) ?? null,
    reviewedAt: (row.reviewedAt as Date | null) ?? null,
    fulfilledCertificateId: (row.fulfilledCertificateId as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

export interface CreateCertificateRequestParams {
  organizationId: string;
  studentId: string;
  certificateType: string;
  requestedBy: string;
  transcriptVersionId?: string | null;
  status?: string;
  reason?: string | null;
}

export async function createCertificateRequest(
  params: CreateCertificateRequestParams,
  client?: PrismaClientOrTx
): Promise<CertificateRequestRecord> {
  const db = client ?? (await getDb());
  const row = await db.certificateRequest.create({
    data: {
      organizationId: params.organizationId,
      studentId: params.studentId,
      certificateType: params.certificateType,
      requestedBy: params.requestedBy,
      transcriptVersionId: params.transcriptVersionId ?? null,
      status: params.status,
      reason: params.reason ?? null,
    },
    select: requestSelect,
  });
  return toRecord(row);
}

export interface FindCertificateRequestByIdParams {
  id: string;
  organizationId: string;
}

export async function findCertificateRequestById(
  params: FindCertificateRequestByIdParams,
  client?: PrismaClientOrTx
): Promise<CertificateRequestRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateRequest.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: requestSelect,
  });
  return row ? toRecord(row) : null;
}

function buildRequestListWhere(filters: CertificateRequestListFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.studentId !== undefined) where.studentId = filters.studentId;
  if (filters.certificateType !== undefined) where.certificateType = filters.certificateType;
  if (filters.status !== undefined) where.status = filters.status;
  if (filters.createdFrom !== undefined || filters.createdTo !== undefined) {
    const createdAt: Record<string, Date> = {};
    if (filters.createdFrom !== undefined) createdAt.gte = filters.createdFrom;
    if (filters.createdTo !== undefined) createdAt.lte = filters.createdTo;
    where.createdAt = createdAt;
  }
  if (!filters.includeDeleted) where.deletedAt = null;
  return where;
}

export async function listCertificateRequests(
  filters: CertificateRequestListFilters,
  client?: PrismaClientOrTx
): Promise<CertificateRequestRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.certificateRequest.findMany({
    where: buildRequestListWhere(filters),
    select: requestSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

/** Org-scoped total matching the same filters (Phase 12 pagination). */
export async function countCertificateRequests(
  filters: CertificateRequestListFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.certificateRequest.count({ where: buildRequestListWhere(filters) });
}

export interface FindActiveRequestParams {
  organizationId: string;
  studentId: string;
  certificateType: string;
  /** Matched EXACTLY (including `null`) — the uniqueness key is (student, type, version). */
  transcriptVersionId?: string | null;
}

/** The active request (PENDING or APPROVED) for a (student, type, transcriptVersion), if
 *  any — the duplicate-prevention lookup (Phase 12). Terminal requests (REJECTED /
 *  FULFILLED / CANCELLED) never block a new one. Org-scoped, live rows only. */
export async function findActiveRequest(
  params: FindActiveRequestParams,
  client?: PrismaClientOrTx
): Promise<CertificateRequestRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateRequest.findFirst({
    where: {
      organizationId: params.organizationId,
      studentId: params.studentId,
      certificateType: params.certificateType,
      transcriptVersionId: params.transcriptVersionId ?? null,
      status: { in: ["PENDING", "APPROVED"] },
      deletedAt: null,
    },
    select: requestSelect,
  });
  return row ? toRecord(row) : null;
}

export interface MarkRequestReviewedParams {
  id: string;
  organizationId: string;
  reviewedBy: string;
  reviewedAt: Date;
  reason?: string | null;
}

/** Conditional PENDING → APPROVED (race-safe; caller asserts `count === 1`). */
export async function markRequestApproved(
  params: MarkRequestReviewedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificateRequest.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null, status: "PENDING" },
    data: { status: "APPROVED", reviewedBy: params.reviewedBy, reviewedAt: params.reviewedAt },
  });
  return { count: res.count };
}

/** Conditional PENDING → REJECTED (stores the review reason; caller asserts `count === 1`). */
export async function markRequestRejected(
  params: MarkRequestReviewedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificateRequest.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null, status: "PENDING" },
    data: {
      status: "REJECTED",
      reviewedBy: params.reviewedBy,
      reviewedAt: params.reviewedAt,
      reason: params.reason ?? null,
    },
  });
  return { count: res.count };
}

export interface MarkRequestCancelledParams {
  id: string;
  organizationId: string;
}

/** Conditional PENDING|APPROVED → CANCELLED (terminal; caller asserts `count === 1`). The
 *  cancelling actor + time are captured in the AuditLog, not on the review columns. */
export async function markRequestCancelled(
  params: MarkRequestCancelledParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificateRequest.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      deletedAt: null,
      status: { in: ["PENDING", "APPROVED"] },
    },
    data: { status: "CANCELLED" },
  });
  return { count: res.count };
}

export interface MarkRequestFulfilledParams {
  id: string;
  organizationId: string;
  fulfilledCertificateId: string;
}

/** Conditional APPROVED → FULFILLED, pinning the generated certificate (caller asserts
 *  `count === 1`). Never a lifecycle decision — the certificate was produced by
 *  GenerateCertificateCommand before this write. */
export async function markRequestFulfilled(
  params: MarkRequestFulfilledParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificateRequest.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null, status: "APPROVED" },
    data: { status: "FULFILLED", fulfilledCertificateId: params.fulfilledCertificateId },
  });
  return { count: res.count };
}

export interface UpdateCertificateRequestStatusParams {
  id: string;
  organizationId: string;
  status?: string;
  reason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  fulfilledCertificateId?: string | null;
}

export async function updateCertificateRequestStatus(
  params: UpdateCertificateRequestStatusParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = {};
  if ("status" in params) data.status = params.status;
  if ("reason" in params) data.reason = params.reason ?? null;
  if ("reviewedBy" in params) data.reviewedBy = params.reviewedBy ?? null;
  if ("reviewedAt" in params) data.reviewedAt = params.reviewedAt ?? null;
  if ("fulfilledCertificateId" in params) data.fulfilledCertificateId = params.fulfilledCertificateId ?? null;

  const res = await db.certificateRequest.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data,
  });
  return { count: res.count };
}

export async function softDeleteCertificateRequest(
  params: FindCertificateRequestByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificateRequest.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}

// ─── Operational read helpers (Phase 14) — READ ONLY, org-scoped ──────────────

/** Live-request count grouped by `status` (§8 `countRequests`). ONE scan of live
 *  rows (`deletedAt = null`), reduced in memory. Returns a `{ status: count }` map. */
export async function countRequestsByStatus(
  params: { organizationId: string },
  client?: PrismaClientOrTx
): Promise<Record<string, number>> {
  const db = client ?? (await getDb());
  const rows = await db.certificateRequest.findMany({
    where: { organizationId: params.organizationId, deletedAt: null },
    select: { status: true },
  });
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const status = r.status as string;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

/** The `createdAt` timestamps of live requests created since `since` (§7 metrics
 *  `request` source). ONE scan; the metrics service buckets in memory. */
export async function listRequestCreatedTimestamps(
  params: { organizationId: string; since: Date },
  client?: PrismaClientOrTx
): Promise<Date[]> {
  const db = client ?? (await getDb());
  const rows = await db.certificateRequest.findMany({
    where: { organizationId: params.organizationId, deletedAt: null, createdAt: { gte: params.since } },
    select: { createdAt: true },
  });
  return rows.map((r) => r.createdAt as Date);
}
