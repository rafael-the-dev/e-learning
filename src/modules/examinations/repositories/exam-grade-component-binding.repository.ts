import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  ArchiveBindingParams,
  CreateExamGradeComponentBindingInput,
  ExamGradeComponentBindingRecord,
  FindActiveBindingBySessionParams,
  FindExamGradeComponentBindingByIdParams,
  ListExamGradeComponentBindingsParams,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM GRADE COMPONENT BINDING REPOSITORY (Phase 11B; ADR-014) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe, transaction-aware access for the explicit exam→grade-component
// binding. Thin persistence: NO rules, NO grade calls, NO heuristics, NO
// component/policy validation (the bind command validates before creating; the
// resolver validates before returning). `assessmentComponentId` / `createdById`
// are STRING pointers persisted verbatim. Soft delete via `deletedAt`; NO hard
// delete, NO findUnique, NO update-by-id. Org-scoped throughout.
// =============================================================================

const bindingSelect = {
  id: true,
  organizationId: true,
  examSessionId: true,
  assessmentComponentId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamGradeComponentBindingRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    examSessionId: row.examSessionId as string,
    assessmentComponentId: row.assessmentComponentId as string,
    createdById: (row.createdById as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

export async function createExamGradeComponentBinding(
  input: CreateExamGradeComponentBindingInput,
  client?: PrismaClientOrTx
): Promise<ExamGradeComponentBindingRecord> {
  const db = client ?? (await getDb());
  const row = await db.examGradeComponentBinding.create({
    data: {
      organizationId: input.organizationId,
      examSessionId: input.examSessionId,
      assessmentComponentId: input.assessmentComponentId,
      createdById: input.createdById ?? null,
    },
    select: bindingSelect,
  });
  return toRecord(row);
}

/** The single active (non-archived) binding for a session, or `null`. */
export async function findActiveBindingBySession(
  params: FindActiveBindingBySessionParams,
  client?: PrismaClientOrTx
): Promise<ExamGradeComponentBindingRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examGradeComponentBinding.findFirst({
    where: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      deletedAt: null,
    },
    select: bindingSelect,
  });
  return row ? toRecord(row) : null;
}

export async function findExamGradeComponentBindingById(
  params: FindExamGradeComponentBindingByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamGradeComponentBindingRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examGradeComponentBinding.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: bindingSelect,
  });
  return row ? toRecord(row) : null;
}

export async function listExamGradeComponentBindings(
  params: ListExamGradeComponentBindingsParams,
  client?: PrismaClientOrTx
): Promise<ExamGradeComponentBindingRecord[]> {
  const db = client ?? (await getDb());
  const where: Record<string, unknown> = { organizationId: params.organizationId };
  if (params.examSessionId !== undefined) where.examSessionId = params.examSessionId;
  const rows = await db.examGradeComponentBinding.findMany({
    where,
    select: bindingSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toRecord);
}

/** Soft delete (archive) the active binding. Conditional on `deletedAt: null` so a
 *  concurrently-archived row matches zero rows → `{ count: 0 }`; the caller asserts
 *  `count === 1`. NO hard delete. */
export async function archiveExamGradeComponentBinding(
  params: ArchiveBindingParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examGradeComponentBinding.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}
