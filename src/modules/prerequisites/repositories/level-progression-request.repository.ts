"use server";

import { getDb } from "@/server/db";
import type { PaginatedResult } from "@/shared/types/common";

// =============================================================================
// LEVEL PROGRESSION REQUEST REPOSITORY
// Only layer that touches Prisma for the manual-approval queue. Every query is
// scoped by organizationId — the queue never crosses tenants.
// =============================================================================

export interface ListProgressionRequestsFilter {
  decision?: string;
  courseId?: string;
  fromLevelId?: string;
  /** Inclusive lower bound on requestedAt (ISO date). */
  requestedFrom?: Date;
  /** Inclusive upper bound on requestedAt (ISO date). */
  requestedTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface ProgressionRequestListItem {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  courseName: string;
  fromLevelName: string;
  toLevelName: string;
  progressionMode: string | null;
  decision: string;
  reason: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  reviewedByName: string | null;
}

const listSelect = {
  id: true,
  enrollmentId: true,
  studentId: true,
  decision: true,
  reason: true,
  requestedAt: true,
  reviewedAt: true,
  reviewedBy: true,
  student: { select: { firstName: true, lastName: true, code: true } },
  course: { select: { name: true } },
  fromLevel: { select: { name: true } },
  toLevel: { select: { name: true } },
  policy: { select: { progressionMode: true } },
} as const;

function studentName(student: { firstName: string | null; lastName: string | null }): string {
  return [student.firstName, student.lastName].filter(Boolean).join(" ").trim();
}

// reviewedBy is a plain user id (no FK relation on the model). Resolve display
// names in a single batched lookup rather than joining.
async function resolveReviewerNames(
  db: Awaited<ReturnType<typeof getDb>>,
  reviewerIds: (string | null)[]
): Promise<Map<string, string>> {
  const ids = [...new Set(reviewerIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

export async function listProgressionRequests(
  organizationId: string,
  filter: ListProgressionRequestsFilter = {}
): Promise<PaginatedResult<ProgressionRequestListItem>> {
  const db = await getDb();
  const page = filter.page && filter.page > 0 ? filter.page : 1;
  const pageSize = filter.pageSize && filter.pageSize > 0 ? filter.pageSize : 20;

  const where = {
    organizationId,
    ...(filter.decision ? { decision: filter.decision } : {}),
    ...(filter.courseId ? { courseId: filter.courseId } : {}),
    ...(filter.fromLevelId ? { fromLevelId: filter.fromLevelId } : {}),
    ...(filter.requestedFrom || filter.requestedTo
      ? {
          requestedAt: {
            ...(filter.requestedFrom ? { gte: filter.requestedFrom } : {}),
            ...(filter.requestedTo ? { lte: filter.requestedTo } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.levelProgressionRequest.findMany({
      where,
      select: listSelect,
      // Pending first, then most recently requested.
      orderBy: [{ decision: "asc" }, { requestedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.levelProgressionRequest.count({ where }),
  ]);

  const reviewerNames = await resolveReviewerNames(db, rows.map((r) => r.reviewedBy));

  const data: ProgressionRequestListItem[] = rows.map((r) => ({
    id: r.id,
    enrollmentId: r.enrollmentId,
    studentId: r.studentId,
    studentName: studentName(r.student),
    studentCode: r.student.code,
    courseName: r.course.name,
    fromLevelName: r.fromLevel.name,
    toLevelName: r.toLevel.name,
    progressionMode: r.policy?.progressionMode ?? null,
    decision: r.decision,
    reason: r.reason,
    requestedAt: r.requestedAt,
    reviewedAt: r.reviewedAt,
    reviewedByName: r.reviewedBy ? reviewerNames.get(r.reviewedBy) ?? null : null,
  }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export interface ProgressionRequestDetail extends ProgressionRequestListItem {
  organizationId: string;
  courseId: string;
  policyId: string | null;
  fromLevelId: string;
  toLevelId: string;
  reviewNotes: string | null;
  enrollmentStatus: string;
  enrollmentCurrentLevelId: string | null;
}

export async function findProgressionRequestById(
  id: string,
  organizationId: string
): Promise<ProgressionRequestDetail | null> {
  const db = await getDb();
  const r = await db.levelProgressionRequest.findFirst({
    where: { id, organizationId },
    select: {
      ...listSelect,
      organizationId: true,
      courseId: true,
      policyId: true,
      fromLevelId: true,
      toLevelId: true,
      reviewNotes: true,
      enrollment: { select: { status: true, currentLevelId: true } },
    },
  });
  if (!r) return null;

  const reviewerNames = await resolveReviewerNames(db, [r.reviewedBy]);

  return {
    id: r.id,
    organizationId: r.organizationId,
    enrollmentId: r.enrollmentId,
    studentId: r.studentId,
    courseId: r.courseId,
    policyId: r.policyId,
    fromLevelId: r.fromLevelId,
    toLevelId: r.toLevelId,
    studentName: studentName(r.student),
    studentCode: r.student.code,
    courseName: r.course.name,
    fromLevelName: r.fromLevel.name,
    toLevelName: r.toLevel.name,
    progressionMode: r.policy?.progressionMode ?? null,
    decision: r.decision,
    reason: r.reason,
    reviewNotes: r.reviewNotes,
    requestedAt: r.requestedAt,
    reviewedAt: r.reviewedAt,
    reviewedByName: r.reviewedBy ? reviewerNames.get(r.reviewedBy) ?? null : null,
    enrollmentStatus: r.enrollment.status,
    enrollmentCurrentLevelId: r.enrollment.currentLevelId,
  };
}

/**
 * Duplicate-request guard: returns the id of an existing PENDING request for the
 * same enrollment + transition, or null. The manual-approval queue must never
 * hold two open requests for the same (enrollment, fromLevel, toLevel).
 */
export async function findPendingRequestId(
  organizationId: string,
  enrollmentId: string,
  fromLevelId: string,
  toLevelId: string
): Promise<string | null> {
  const db = await getDb();
  const existing = await db.levelProgressionRequest.findFirst({
    where: { organizationId, enrollmentId, fromLevelId, toLevelId, decision: "PENDING" },
    select: { id: true },
  });
  return existing?.id ?? null;
}

/**
 * Idempotent creation: if a PENDING request already exists for this transition,
 * returns it (created=false) instead of inserting a duplicate.
 */
export async function ensurePendingProgressionRequest(params: {
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  policyId: string | null;
  fromLevelId: string;
  toLevelId: string;
  reason: string | null;
}): Promise<{ id: string; created: boolean }> {
  const db = await getDb();
  const existingId = await findPendingRequestId(
    params.organizationId,
    params.enrollmentId,
    params.fromLevelId,
    params.toLevelId
  );
  if (existingId) return { id: existingId, created: false };

  const created = await db.levelProgressionRequest.create({
    data: {
      organizationId: params.organizationId,
      enrollmentId: params.enrollmentId,
      studentId: params.studentId,
      courseId: params.courseId,
      policyId: params.policyId,
      fromLevelId: params.fromLevelId,
      toLevelId: params.toLevelId,
      decision: "PENDING",
      reason: params.reason,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

/**
 * Distinct courses that currently have progression requests — used to build
 * the course filter dropdown without pulling the full course catalog.
 */
export async function findRequestCourseOptions(
  organizationId: string
): Promise<{ id: string; name: string }[]> {
  const db = await getDb();
  const rows = await db.levelProgressionRequest.findMany({
    where: { organizationId },
    select: { courseId: true, course: { select: { name: true } } },
    distinct: ["courseId"],
    orderBy: { course: { name: "asc" } },
  });
  return rows.map((r) => ({ id: r.courseId, name: r.course.name }));
}

/**
 * Distinct origin levels across existing requests — used to build the level
 * filter dropdown.
 */
export async function findRequestLevelOptions(
  organizationId: string
): Promise<{ id: string; name: string }[]> {
  const db = await getDb();
  const rows = await db.levelProgressionRequest.findMany({
    where: { organizationId },
    select: { fromLevelId: true, fromLevel: { select: { name: true } } },
    distinct: ["fromLevelId"],
    orderBy: { fromLevel: { name: "asc" } },
  });
  return rows.map((r) => ({ id: r.fromLevelId, name: r.fromLevel.name }));
}
