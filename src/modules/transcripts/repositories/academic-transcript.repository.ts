import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { buildPaginationMeta, buildSkipTake } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type {
  TranscriptRootRecord,
  TranscriptRootDetailRecord,
} from "@/modules/transcripts/types";
import { versionSelect, toVersionRecord } from "./academic-transcript-version.repository";

// =============================================================================
// ACADEMIC TRANSCRIPT REPOSITORY — root aggregate (Phase 2)
//
// Thin, org-scoped data access. NO business rules: no issue/supersede/revoke
// logic, no snapshot building, no checksum, no events, no audit. Every read
// filters on `organizationId`; every write is scoped by `{ id, organizationId }`
// (via `updateMany`) so a caller can never touch another tenant's row by id.
// =============================================================================

export const transcriptSelect = {
  id: true,
  organizationId: true,
  studentId: true,
  enrollmentId: true,
  courseId: true,
  transcriptType: true,
  scopeCourseLevelId: true,
  scopeAcademicTermId: true,
  scopeLevelSubjectId: true,
  transcriptNumber: true,
  status: true,
  currentVersionId: true,
  needsRegeneration: true,
  staleReason: true,
  staleDetectedAt: true,
  issuedAt: true,
  issuedBy: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type TranscriptRow = {
  [K in keyof typeof transcriptSelect]: unknown;
};

function toRootRecord(row: TranscriptRow): TranscriptRootRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    studentId: row.studentId as string,
    enrollmentId: (row.enrollmentId as string | null) ?? null,
    courseId: (row.courseId as string | null) ?? null,
    transcriptType: row.transcriptType as string,
    scopeCourseLevelId: (row.scopeCourseLevelId as string | null) ?? null,
    scopeAcademicTermId: (row.scopeAcademicTermId as string | null) ?? null,
    scopeLevelSubjectId: (row.scopeLevelSubjectId as string | null) ?? null,
    transcriptNumber: (row.transcriptNumber as string | null) ?? null,
    status: row.status as string,
    currentVersionId: (row.currentVersionId as string | null) ?? null,
    needsRegeneration: row.needsRegeneration as boolean,
    staleReason: (row.staleReason as string | null) ?? null,
    staleDetectedAt: (row.staleDetectedAt as Date | null) ?? null,
    issuedAt: (row.issuedAt as Date | null) ?? null,
    issuedBy: (row.issuedBy as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────

export interface FindTranscriptByIdParams {
  id: string;
  organizationId: string;
}

export async function findTranscriptById(
  params: FindTranscriptByIdParams,
  client?: PrismaClientOrTx
): Promise<TranscriptRootRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscript.findFirst({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    select: transcriptSelect,
  });
  return row ? toRootRecord(row) : null;
}

export async function findTranscriptDetailById(
  params: FindTranscriptByIdParams,
  client?: PrismaClientOrTx
): Promise<TranscriptRootDetailRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscript.findFirst({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    select: { ...transcriptSelect, currentVersion: { select: versionSelect } },
  });
  if (!row) return null;
  const { currentVersion, ...rest } = row as TranscriptRow & { currentVersion: unknown };
  return {
    ...toRootRecord(rest),
    currentVersion: currentVersion
      ? toVersionRecord(currentVersion as Parameters<typeof toVersionRecord>[0])
      : null,
  };
}

export interface FindTranscriptByScopeParams {
  organizationId: string;
  studentId: string;
  transcriptType: string;
  enrollmentId?: string | null;
  courseId?: string | null;
  scopeCourseLevelId?: string | null;
  scopeAcademicTermId?: string | null;
  scopeLevelSubjectId?: string | null;
}

/** Resolve the (at most one live) root for a given scope. Only the scope keys
 *  that are provided are used in the WHERE — callers pass the discriminators
 *  relevant to the transcriptType. */
export async function findTranscriptByScope(
  params: FindTranscriptByScopeParams,
  client?: PrismaClientOrTx
): Promise<TranscriptRootRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscript.findFirst({
    where: {
      organizationId: params.organizationId,
      studentId: params.studentId,
      transcriptType: params.transcriptType,
      ...("enrollmentId" in params ? { enrollmentId: params.enrollmentId ?? null } : {}),
      ...("courseId" in params ? { courseId: params.courseId ?? null } : {}),
      ...("scopeCourseLevelId" in params
        ? { scopeCourseLevelId: params.scopeCourseLevelId ?? null }
        : {}),
      ...("scopeAcademicTermId" in params
        ? { scopeAcademicTermId: params.scopeAcademicTermId ?? null }
        : {}),
      ...("scopeLevelSubjectId" in params
        ? { scopeLevelSubjectId: params.scopeLevelSubjectId ?? null }
        : {}),
      deletedAt: null,
    },
    select: transcriptSelect,
    orderBy: { createdAt: "desc" },
  });
  return row ? toRootRecord(row) : null;
}

export interface ListTranscriptsParams {
  organizationId: string;
  studentId?: string;
  enrollmentId?: string;
  courseId?: string;
  transcriptType?: string;
  status?: string;
  needsRegeneration?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listTranscripts(
  params: ListTranscriptsParams,
  client?: PrismaClientOrTx
): Promise<PaginatedResult<TranscriptRootRecord>> {
  const db = client ?? (await getDb());
  const where = {
    organizationId: params.organizationId,
    deletedAt: null,
    ...(params.studentId ? { studentId: params.studentId } : {}),
    ...(params.enrollmentId ? { enrollmentId: params.enrollmentId } : {}),
    ...(params.courseId ? { courseId: params.courseId } : {}),
    ...(params.transcriptType ? { transcriptType: params.transcriptType } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.needsRegeneration !== undefined
      ? { needsRegeneration: params.needsRegeneration }
      : {}),
  };
  const { skip, take } = buildSkipTake({ page: params.page, pageSize: params.pageSize });
  const [rows, total] = await Promise.all([
    db.academicTranscript.findMany({
      where,
      select: transcriptSelect,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
    }),
    db.academicTranscript.count({ where }),
  ]);
  return buildPaginationMeta(rows.map(toRootRecord), total, {
    page: params.page,
    pageSize: params.pageSize,
  });
}

// ─── Writes (metadata only) ──────────────────────────────────────────────────

export interface CreateTranscriptParams {
  organizationId: string;
  studentId: string;
  enrollmentId?: string | null;
  courseId?: string | null;
  transcriptType: string;
  scopeCourseLevelId?: string | null;
  scopeAcademicTermId?: string | null;
  scopeLevelSubjectId?: string | null;
  transcriptNumber?: string | null;
  status: string;
}

export async function createTranscript(
  params: CreateTranscriptParams,
  client?: PrismaClientOrTx
): Promise<TranscriptRootRecord> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscript.create({
    data: {
      organizationId: params.organizationId,
      studentId: params.studentId,
      enrollmentId: params.enrollmentId ?? null,
      courseId: params.courseId ?? null,
      transcriptType: params.transcriptType,
      scopeCourseLevelId: params.scopeCourseLevelId ?? null,
      scopeAcademicTermId: params.scopeAcademicTermId ?? null,
      scopeLevelSubjectId: params.scopeLevelSubjectId ?? null,
      transcriptNumber: params.transcriptNumber ?? null,
      status: params.status,
    },
    select: transcriptSelect,
  });
  return toRootRecord(row);
}

export interface UpdateTranscriptMetadataParams {
  id: string;
  organizationId: string;
  status?: string;
  currentVersionId?: string | null;
  transcriptNumber?: string | null;
  needsRegeneration?: boolean;
  staleReason?: string | null;
  staleDetectedAt?: Date | null;
  issuedAt?: Date | null;
  issuedBy?: string | null;
  /** Optimistic-concurrency guards — added to the WHERE, never written. When a
   *  guard is present the update applies only if the row still matches it, so a
   *  concurrent transaction that already changed the column loses the race
   *  (`count` 0). Used by the issue command to ensure a transcript number is
   *  never overwritten once assigned, and by the revoke command to guard the
   *  root-status flip (all-versions-revoked) against a concurrent transition. */
  expectCurrentVersionId?: string | null;
  expectTranscriptNumberNull?: boolean;
  expectStatus?: string;
}

/** Scoped metadata update. Uses `updateMany` so the `organizationId` is part of
 *  the WHERE — an id from another tenant matches 0 rows. Optional `expect*`
 *  guards add the expected current value to the WHERE (optimistic concurrency).
 *  Returns the affected row count (never updates by id alone). */
export async function updateTranscriptMetadata(
  params: UpdateTranscriptMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = {};
  if ("status" in params) data.status = params.status;
  if ("currentVersionId" in params) data.currentVersionId = params.currentVersionId ?? null;
  if ("transcriptNumber" in params) data.transcriptNumber = params.transcriptNumber ?? null;
  if ("needsRegeneration" in params) data.needsRegeneration = params.needsRegeneration;
  if ("staleReason" in params) data.staleReason = params.staleReason ?? null;
  if ("staleDetectedAt" in params) data.staleDetectedAt = params.staleDetectedAt ?? null;
  if ("issuedAt" in params) data.issuedAt = params.issuedAt ?? null;
  if ("issuedBy" in params) data.issuedBy = params.issuedBy ?? null;

  const where: Record<string, unknown> = {
    id: params.id,
    organizationId: params.organizationId,
  };
  if ("expectCurrentVersionId" in params) {
    where.currentVersionId = params.expectCurrentVersionId ?? null;
  }
  if (params.expectTranscriptNumberNull) {
    where.transcriptNumber = null;
  }
  if ("expectStatus" in params) {
    where.status = params.expectStatus;
  }

  const res = await db.academicTranscript.updateMany({ where, data });
  return { count: res.count };
}

export interface MarkTranscriptStaleParams {
  id: string;
  organizationId: string;
  staleReason: string;
  staleDetectedAt: Date;
}

export async function markTranscriptStale(
  params: MarkTranscriptStaleParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.academicTranscript.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data: {
      needsRegeneration: true,
      staleReason: params.staleReason,
      staleDetectedAt: params.staleDetectedAt,
    },
  });
  return { count: res.count };
}

export async function clearTranscriptStale(
  params: FindTranscriptByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.academicTranscript.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data: { needsRegeneration: false, staleReason: null, staleDetectedAt: null },
  });
  return { count: res.count };
}

/** Soft-delete a root — repository-level guard restricts this to `DRAFT` roots
 *  (a status filter in the WHERE, not business validation). Issued/superseded
 *  roots and their versions are never deleted. */
export async function softDeleteDraftTranscript(
  params: FindTranscriptByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.academicTranscript.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      status: "DRAFT",
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}
