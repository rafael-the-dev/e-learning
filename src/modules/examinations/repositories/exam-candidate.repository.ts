import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CountActiveCandidatesBySessionParams,
  CreateExamCandidateInput,
  ExamCandidateRecord,
  FindActiveCandidateBySessionSeatParams,
  FindActiveCandidateBySessionStudentParams,
  ListExamCandidatesFilters,
  MarkExamCandidateDisqualifiedParams,
  MarkExamCandidateWithdrawnParams,
  UpdateExamCandidateMetadataInput,
} from "@/modules/examinations/types/repository";

/** Candidate statuses that are NOT active — a WITHDRAWN/DISQUALIFIED row frees the
 *  seat and the single-active-candidate slot. Used only in `where` filters here. */
const INACTIVE_CANDIDATE_STATUSES = ["WITHDRAWN", "DISQUALIFIED"] as const;

// =============================================================================
// EXAM CANDIDATE REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for a student's registration in one exam session (linked to
// an ExamAttempt). It makes NO eligibility / registration decision — a command
// computes eligibility and sets `eligibilityStatus` / `status` / snapshot; this
// layer persists them. The single active candidate per (org, session, student)
// is a filtered-unique index in the migration. `eligibilitySnapshot` is stored
// raw (NVarChar(Max)); never parsed here. Org-scoped; soft delete sets
// `deletedAt`; NO hard delete, NO findUnique, NO update-by-id.
// =============================================================================

const candidateSelect = {
  id: true,
  organizationId: true,
  examSessionId: true,
  examAttemptId: true,
  studentId: true,
  enrollmentId: true,
  eligibilityStatus: true,
  status: true,
  assignedSeat: true,
  registeredAt: true,
  registeredById: true,
  withdrawnAt: true,
  withdrawnById: true,
  disqualifiedAt: true,
  disqualifiedById: true,
  disqualificationReason: true,
  overriddenById: true,
  overrideReason: true,
  eligibilitySnapshot: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamCandidateRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    examSessionId: row.examSessionId as string,
    examAttemptId: row.examAttemptId as string,
    studentId: row.studentId as string,
    enrollmentId: row.enrollmentId as string,
    eligibilityStatus: row.eligibilityStatus as string,
    status: row.status as string,
    assignedSeat: (row.assignedSeat as string | null) ?? null,
    registeredAt: (row.registeredAt as Date | null) ?? null,
    registeredById: (row.registeredById as string | null) ?? null,
    withdrawnAt: (row.withdrawnAt as Date | null) ?? null,
    withdrawnById: (row.withdrawnById as string | null) ?? null,
    disqualifiedAt: (row.disqualifiedAt as Date | null) ?? null,
    disqualifiedById: (row.disqualifiedById as string | null) ?? null,
    disqualificationReason: (row.disqualificationReason as string | null) ?? null,
    overriddenById: (row.overriddenById as string | null) ?? null,
    overrideReason: (row.overrideReason as string | null) ?? null,
    eligibilitySnapshot: (row.eligibilitySnapshot as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

export async function createExamCandidate(
  params: CreateExamCandidateInput,
  client?: PrismaClientOrTx
): Promise<ExamCandidateRecord> {
  const db = client ?? (await getDb());
  const row = await db.examCandidate.create({
    data: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      examAttemptId: params.examAttemptId,
      studentId: params.studentId,
      enrollmentId: params.enrollmentId,
      eligibilityStatus: params.eligibilityStatus,
      status: params.status,
      assignedSeat: params.assignedSeat ?? null,
      eligibilitySnapshot: params.eligibilitySnapshot ?? null,
      registeredAt: params.registeredAt ?? null,
      registeredById: params.registeredById ?? null,
      overriddenById: params.overriddenById ?? null,
      overrideReason: params.overrideReason ?? null,
    },
    select: candidateSelect,
  });
  return toRecord(row);
}

export interface FindExamCandidateByIdParams {
  organizationId: string;
  id: string;
}

export async function findExamCandidateById(
  params: FindExamCandidateByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamCandidateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examCandidate.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: candidateSelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindCandidateBySessionStudentParams {
  organizationId: string;
  examSessionId: string;
  studentId: string;
}

/** The live candidate for (session, student), if any — a simple lookup used by
 *  the registration command to detect a duplicate. No decision here. */
export async function findCandidateBySessionStudent(
  params: FindCandidateBySessionStudentParams,
  client?: PrismaClientOrTx
): Promise<ExamCandidateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examCandidate.findFirst({
    where: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      studentId: params.studentId,
      deletedAt: null,
    },
    select: candidateSelect,
  });
  return row ? toRecord(row) : null;
}

function buildListWhere(filters: ListExamCandidatesFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.examSessionId !== undefined) where.examSessionId = filters.examSessionId;
  if (filters.examAttemptId !== undefined) where.examAttemptId = filters.examAttemptId;
  if (filters.studentId !== undefined) where.studentId = filters.studentId;
  if (filters.enrollmentId !== undefined) where.enrollmentId = filters.enrollmentId;
  if (filters.status !== undefined) where.status = filters.status;
  if (!filters.includeDeleted) where.deletedAt = null;
  return where;
}

export async function listExamCandidates(
  filters: ListExamCandidatesFilters,
  client?: PrismaClientOrTx
): Promise<ExamCandidateRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examCandidate.findMany({
    where: buildListWhere(filters),
    select: candidateSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export async function countExamCandidates(
  filters: ListExamCandidatesFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examCandidate.count({ where: buildListWhere(filters) });
}

/** All live candidates for a session (roster read), deterministic order. */
export async function listCandidatesBySession(
  params: { organizationId: string; examSessionId: string; skip?: number; take?: number },
  client?: PrismaClientOrTx
): Promise<ExamCandidateRecord[]> {
  return listExamCandidates(
    {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      skip: params.skip,
      take: params.take,
    },
    client
  );
}

/** All live candidates linked to one attempt (re-sit history read). */
export async function listCandidatesByAttempt(
  params: { organizationId: string; examAttemptId: string; skip?: number; take?: number },
  client?: PrismaClientOrTx
): Promise<ExamCandidateRecord[]> {
  return listExamCandidates(
    {
      organizationId: params.organizationId,
      examAttemptId: params.examAttemptId,
      skip: params.skip,
      take: params.take,
    },
    client
  );
}

export interface UpdateExamCandidateMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamCandidateMetadataInput;
}

export async function updateExamCandidateMetadata(
  params: UpdateExamCandidateMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examCandidate.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { ...params.patch },
  });
  return { count: res.count };
}

export async function softDeleteExamCandidate(
  params: FindExamCandidateByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examCandidate.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}

// =============================================================================
// PHASE 5 — REGISTRATION PRIMITIVES (thin, org-scoped; no rule / decision)
// -----------------------------------------------------------------------------
// Read primitives count/find only the ACTIVE candidates (status NOT IN
// WITHDRAWN/DISQUALIFIED, not soft-deleted) that occupy a seat / the single-active
// slot — the registration command turns those reads into ALREADY_REGISTERED /
// SESSION_FULL / SEAT_UNAVAILABLE decisions (E-3a). The write primitives are
// conditional `updateMany` pinning `status = 'REGISTERED'`; the command asserts
// `count === 1`. No business rule lives here.
// =============================================================================

/** Count the candidates that still occupy the session (REGISTERED/eligibility
 *  states) — WITHDRAWN/DISQUALIFIED and soft-deleted rows are excluded. */
export async function countActiveCandidatesBySession(
  params: CountActiveCandidatesBySessionParams,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examCandidate.count({
    where: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      deletedAt: null,
      status: { notIn: [...INACTIVE_CANDIDATE_STATUSES] },
    },
  });
}

/** The active candidate for (session, student), if any — distinct from the
 *  any-live `findCandidateBySessionStudent`: a WITHDRAWN/DISQUALIFIED prior row
 *  does not count, so re-registration after withdrawal is allowed. */
export async function findActiveCandidateBySessionStudent(
  params: FindActiveCandidateBySessionStudentParams,
  client?: PrismaClientOrTx
): Promise<ExamCandidateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examCandidate.findFirst({
    where: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      studentId: params.studentId,
      deletedAt: null,
      status: { notIn: [...INACTIVE_CANDIDATE_STATUSES] },
    },
    select: candidateSelect,
  });
  return row ? toRecord(row) : null;
}

/** The active candidate holding a given seat in a session, if any. */
export async function findActiveCandidateBySessionSeat(
  params: FindActiveCandidateBySessionSeatParams,
  client?: PrismaClientOrTx
): Promise<ExamCandidateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examCandidate.findFirst({
    where: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      assignedSeat: params.assignedSeat,
      deletedAt: null,
      status: { notIn: [...INACTIVE_CANDIDATE_STATUSES] },
    },
    select: candidateSelect,
  });
  return row ? toRecord(row) : null;
}

/** Conditional REGISTERED → WITHDRAWN mark (stamps `withdrawnAt`/`withdrawnById`).
 *  Only a live REGISTERED row matches, so a double-withdraw returns `{ count: 0 }`. */
export async function markExamCandidateWithdrawn(
  params: MarkExamCandidateWithdrawnParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examCandidate.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      status: "REGISTERED",
      deletedAt: null,
    },
    data: {
      status: "WITHDRAWN",
      withdrawnAt: new Date(),
      withdrawnById: params.withdrawnById ?? null,
    },
  });
  return { count: res.count };
}

/** Conditional REGISTERED → DISQUALIFIED mark (stamps `disqualifiedAt`/
 *  `disqualifiedById`/`disqualificationReason`). Double-disqualify ⇒ `{ count: 0 }`. */
export async function markExamCandidateDisqualified(
  params: MarkExamCandidateDisqualifiedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examCandidate.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      status: "REGISTERED",
      deletedAt: null,
    },
    data: {
      status: "DISQUALIFIED",
      disqualifiedAt: new Date(),
      disqualifiedById: params.disqualifiedById ?? null,
      disqualificationReason: params.disqualificationReason,
    },
  });
  return { count: res.count };
}
