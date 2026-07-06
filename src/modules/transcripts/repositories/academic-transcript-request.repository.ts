import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { buildPaginationMeta, buildSkipTake } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { TranscriptRequestRecord } from "@/modules/transcripts/types";

// =============================================================================
// ACADEMIC TRANSCRIPT REQUEST REPOSITORY (Phase 2)
//
// Requested-issuance workflow rows. Create + read + scoped status update.
// Org-scoped. NO workflow rules (approve/reject/fulfil guards) — those belong
// to commands later; here `status` is written verbatim.
// =============================================================================

const requestSelect = {
  id: true,
  organizationId: true,
  studentId: true,
  enrollmentId: true,
  courseId: true,
  requestedBy: true,
  requestType: true,
  status: true,
  reason: true,
  reviewedBy: true,
  reviewedAt: true,
  fulfilledTranscriptVersionId: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RequestRow = { [K in keyof typeof requestSelect]: unknown };

function toRequestRecord(row: RequestRow): TranscriptRequestRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    studentId: row.studentId as string,
    enrollmentId: (row.enrollmentId as string | null) ?? null,
    courseId: (row.courseId as string | null) ?? null,
    requestedBy: row.requestedBy as string,
    requestType: row.requestType as string,
    status: row.status as string,
    reason: (row.reason as string | null) ?? null,
    reviewedBy: (row.reviewedBy as string | null) ?? null,
    reviewedAt: (row.reviewedAt as Date | null) ?? null,
    fulfilledTranscriptVersionId: (row.fulfilledTranscriptVersionId as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export interface CreateTranscriptRequestParams {
  organizationId: string;
  studentId: string;
  enrollmentId?: string | null;
  courseId?: string | null;
  requestedBy: string;
  requestType: string;
  status?: string;
  reason?: string | null;
}

export async function createTranscriptRequest(
  params: CreateTranscriptRequestParams,
  client?: PrismaClientOrTx
): Promise<TranscriptRequestRecord> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscriptRequest.create({
    data: {
      organizationId: params.organizationId,
      studentId: params.studentId,
      enrollmentId: params.enrollmentId ?? null,
      courseId: params.courseId ?? null,
      requestedBy: params.requestedBy,
      requestType: params.requestType,
      status: params.status ?? "PENDING",
      reason: params.reason ?? null,
    },
    select: requestSelect,
  });
  return toRequestRecord(row);
}

export interface FindTranscriptRequestByIdParams {
  id: string;
  organizationId: string;
}

export async function findTranscriptRequestById(
  params: FindTranscriptRequestByIdParams,
  client?: PrismaClientOrTx
): Promise<TranscriptRequestRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscriptRequest.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: requestSelect,
  });
  return row ? toRequestRecord(row) : null;
}

export interface ListTranscriptRequestsParams {
  organizationId: string;
  studentId?: string;
  enrollmentId?: string;
  courseId?: string;
  status?: string;
  requestType?: string;
  page?: number;
  pageSize?: number;
}

export async function listTranscriptRequests(
  params: ListTranscriptRequestsParams,
  client?: PrismaClientOrTx
): Promise<PaginatedResult<TranscriptRequestRecord>> {
  const db = client ?? (await getDb());
  const where = {
    organizationId: params.organizationId,
    ...(params.studentId ? { studentId: params.studentId } : {}),
    ...(params.enrollmentId ? { enrollmentId: params.enrollmentId } : {}),
    ...(params.courseId ? { courseId: params.courseId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.requestType ? { requestType: params.requestType } : {}),
  };
  const { skip, take } = buildSkipTake({ page: params.page, pageSize: params.pageSize });
  const [rows, total] = await Promise.all([
    db.academicTranscriptRequest.findMany({
      where,
      select: requestSelect,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
    }),
    db.academicTranscriptRequest.count({ where }),
  ]);
  return buildPaginationMeta(rows.map(toRequestRecord), total, {
    page: params.page,
    pageSize: params.pageSize,
  });
}

export interface UpdateTranscriptRequestStatusParams {
  id: string;
  organizationId: string;
  status?: string;
  reason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  fulfilledTranscriptVersionId?: string | null;
}

export async function updateTranscriptRequestStatus(
  params: UpdateTranscriptRequestStatusParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = {};
  if ("status" in params) data.status = params.status;
  if ("reason" in params) data.reason = params.reason ?? null;
  if ("reviewedBy" in params) data.reviewedBy = params.reviewedBy ?? null;
  if ("reviewedAt" in params) data.reviewedAt = params.reviewedAt ?? null;
  if ("fulfilledTranscriptVersionId" in params)
    data.fulfilledTranscriptVersionId = params.fulfilledTranscriptVersionId ?? null;

  const res = await db.academicTranscriptRequest.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data,
  });
  return { count: res.count };
}
