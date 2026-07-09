import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamAttendanceInput,
  ExamAttendanceRecord,
  ListExamAttendanceFilters,
  UpdateExamAttendanceMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM ATTENDANCE REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for exam-day attendance, one row per candidate
// (examCandidateId is @unique). Separate from class attendance (D8) — this layer
// never touches the Attendance Engine and makes NO decision about presence rules.
// No `deletedAt` on this model → NO soft delete, NO hard delete, NO findUnique,
// NO update-by-id.
// =============================================================================

const attendanceSelect = {
  id: true,
  organizationId: true,
  examCandidateId: true,
  status: true,
  checkedInAt: true,
  markedAt: true,
  markedById: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamAttendanceRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    examCandidateId: row.examCandidateId as string,
    status: row.status as string,
    checkedInAt: (row.checkedInAt as Date | null) ?? null,
    markedAt: (row.markedAt as Date | null) ?? null,
    markedById: (row.markedById as string | null) ?? null,
    remarks: (row.remarks as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export async function createExamAttendance(
  params: CreateExamAttendanceInput,
  client?: PrismaClientOrTx
): Promise<ExamAttendanceRecord> {
  const db = client ?? (await getDb());
  const row = await db.examAttendance.create({
    data: {
      organizationId: params.organizationId,
      examCandidateId: params.examCandidateId,
      status: params.status,
      checkedInAt: params.checkedInAt ?? null,
      markedAt: params.markedAt ?? null,
      markedById: params.markedById ?? null,
      remarks: params.remarks ?? null,
    },
    select: attendanceSelect,
  });
  return toRecord(row);
}

export interface FindAttendanceByCandidateIdParams {
  organizationId: string;
  examCandidateId: string;
}

export async function findAttendanceByCandidateId(
  params: FindAttendanceByCandidateIdParams,
  client?: PrismaClientOrTx
): Promise<ExamAttendanceRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examAttendance.findFirst({
    where: { organizationId: params.organizationId, examCandidateId: params.examCandidateId },
    select: attendanceSelect,
  });
  return row ? toRecord(row) : null;
}

function buildListWhere(filters: ListExamAttendanceFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.status !== undefined) where.status = filters.status;
  return where;
}

export async function listExamAttendance(
  filters: ListExamAttendanceFilters,
  client?: PrismaClientOrTx
): Promise<ExamAttendanceRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examAttendance.findMany({
    where: buildListWhere(filters),
    select: attendanceSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export interface UpdateExamAttendanceMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamAttendanceMetadataInput;
}

export async function updateExamAttendanceMetadata(
  params: UpdateExamAttendanceMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examAttendance.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data: { ...params.patch },
  });
  return { count: res.count };
}
