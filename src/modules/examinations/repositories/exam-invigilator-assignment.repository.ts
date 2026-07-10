import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamInvigilatorAssignmentInput,
  ExamInvigilatorAssignmentRecord,
  FindAssignmentBySessionTeacherParams,
  FindAssignmentBySessionUserParams,
  ListExamInvigilatorAssignmentsFilters,
  UpdateExamInvigilatorAssignmentMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM INVIGILATOR ASSIGNMENT REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for staffing an exam session. `teacherId` / `userId` are
// plain String pointers (deliberately NOT relations). Makes NO staffing decision.
// No `deletedAt` → NO soft delete, NO hard delete, NO findUnique, NO
// update-by-id. Filtered-unique (org, session, teacherId) and (org, session,
// userId) are migration-only.
// =============================================================================

const assignmentSelect = {
  id: true,
  organizationId: true,
  examSessionId: true,
  teacherId: true,
  userId: true,
  role: true,
  assignedAt: true,
  assignedById: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamInvigilatorAssignmentRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    examSessionId: row.examSessionId as string,
    teacherId: (row.teacherId as string | null) ?? null,
    userId: (row.userId as string | null) ?? null,
    role: row.role as string,
    assignedAt: row.assignedAt as Date,
    assignedById: (row.assignedById as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export async function createInvigilatorAssignment(
  params: CreateExamInvigilatorAssignmentInput,
  client?: PrismaClientOrTx
): Promise<ExamInvigilatorAssignmentRecord> {
  const db = client ?? (await getDb());
  const row = await db.examInvigilatorAssignment.create({
    data: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      role: params.role,
      teacherId: params.teacherId ?? null,
      userId: params.userId ?? null,
      assignedAt: params.assignedAt,
      assignedById: params.assignedById ?? null,
    },
    select: assignmentSelect,
  });
  return toRecord(row);
}

export interface FindInvigilatorAssignmentByIdParams {
  organizationId: string;
  id: string;
}

export async function findInvigilatorAssignmentById(
  params: FindInvigilatorAssignmentByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamInvigilatorAssignmentRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examInvigilatorAssignment.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: assignmentSelect,
  });
  return row ? toRecord(row) : null;
}

function buildListWhere(
  filters: ListExamInvigilatorAssignmentsFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.teacherId !== undefined) where.teacherId = filters.teacherId;
  if (filters.userId !== undefined) where.userId = filters.userId;
  return where;
}

export async function listInvigilatorAssignments(
  filters: ListExamInvigilatorAssignmentsFilters,
  client?: PrismaClientOrTx
): Promise<ExamInvigilatorAssignmentRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examInvigilatorAssignment.findMany({
    where: buildListWhere(filters),
    select: assignmentSelect,
    orderBy: [{ assignedAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export interface AssignmentsBySessionParams {
  organizationId: string;
  examSessionId: string;
}

/** All invigilator rows for a session, deterministic order. */
export async function listAssignmentsBySession(
  params: AssignmentsBySessionParams,
  client?: PrismaClientOrTx
): Promise<ExamInvigilatorAssignmentRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examInvigilatorAssignment.findMany({
    where: { organizationId: params.organizationId, examSessionId: params.examSessionId },
    select: assignmentSelect,
    orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toRecord);
}

// ─── PHASE 4 — duplicate-assignment lookups (READ-ONLY) ───────────────────────

/** The existing assignment for this session + teacher, if any — the duplicate
 *  guard read. Org-scoped, no decision (the command rejects a duplicate). */
export async function findAssignmentBySessionTeacher(
  params: FindAssignmentBySessionTeacherParams,
  client?: PrismaClientOrTx
): Promise<ExamInvigilatorAssignmentRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examInvigilatorAssignment.findFirst({
    where: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      teacherId: params.teacherId,
    },
    select: assignmentSelect,
  });
  return row ? toRecord(row) : null;
}

/** The existing assignment for this session + user, if any — the duplicate guard
 *  read. Org-scoped, no decision. */
export async function findAssignmentBySessionUser(
  params: FindAssignmentBySessionUserParams,
  client?: PrismaClientOrTx
): Promise<ExamInvigilatorAssignmentRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examInvigilatorAssignment.findFirst({
    where: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      userId: params.userId,
    },
    select: assignmentSelect,
  });
  return row ? toRecord(row) : null;
}

export interface UpdateInvigilatorAssignmentMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamInvigilatorAssignmentMetadataInput;
}

export async function updateInvigilatorAssignmentMetadata(
  params: UpdateInvigilatorAssignmentMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examInvigilatorAssignment.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data: { ...params.patch },
  });
  return { count: res.count };
}
