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

export async function listCertificateRequests(
  filters: CertificateRequestListFilters,
  client?: PrismaClientOrTx
): Promise<CertificateRequestRecord[]> {
  const db = client ?? (await getDb());
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.studentId !== undefined) where.studentId = filters.studentId;
  if (filters.certificateType !== undefined) where.certificateType = filters.certificateType;
  if (filters.status !== undefined) where.status = filters.status;
  if (!filters.includeDeleted) where.deletedAt = null;

  const rows = await db.certificateRequest.findMany({
    where,
    select: requestSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
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
