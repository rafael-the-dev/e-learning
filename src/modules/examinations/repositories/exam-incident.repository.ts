import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamIncidentInput,
  ExamIncidentRecord,
  ListExamIncidentsFilters,
  UpdateExamIncidentMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM INCIDENT REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for exam-day incident reports (optionally tied to one
// candidate). `description` is NVarChar(Max) and stored raw. Makes NO decision —
// a command records the incident. No `deletedAt` → NO soft delete, NO hard
// delete, NO findUnique, NO update-by-id.
// =============================================================================

const incidentSelect = {
  id: true,
  organizationId: true,
  examSessionId: true,
  examCandidateId: true,
  type: true,
  severity: true,
  description: true,
  actionTaken: true,
  reportedById: true,
  reportedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamIncidentRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    examSessionId: row.examSessionId as string,
    examCandidateId: (row.examCandidateId as string | null) ?? null,
    type: row.type as string,
    severity: row.severity as string,
    description: row.description as string,
    actionTaken: (row.actionTaken as string | null) ?? null,
    reportedById: (row.reportedById as string | null) ?? null,
    reportedAt: row.reportedAt as Date,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export async function createExamIncident(
  params: CreateExamIncidentInput,
  client?: PrismaClientOrTx
): Promise<ExamIncidentRecord> {
  const db = client ?? (await getDb());
  const row = await db.examIncident.create({
    data: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      type: params.type,
      severity: params.severity,
      description: params.description,
      examCandidateId: params.examCandidateId ?? null,
      actionTaken: params.actionTaken ?? null,
      reportedById: params.reportedById ?? null,
      reportedAt: params.reportedAt,
    },
    select: incidentSelect,
  });
  return toRecord(row);
}

export interface FindExamIncidentByIdParams {
  organizationId: string;
  id: string;
}

export async function findExamIncidentById(
  params: FindExamIncidentByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamIncidentRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examIncident.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: incidentSelect,
  });
  return row ? toRecord(row) : null;
}

function buildListWhere(filters: ListExamIncidentsFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.examSessionId !== undefined) where.examSessionId = filters.examSessionId;
  if (filters.examCandidateId !== undefined) where.examCandidateId = filters.examCandidateId;
  if (filters.severity !== undefined) where.severity = filters.severity;
  return where;
}

export async function listExamIncidents(
  filters: ListExamIncidentsFilters,
  client?: PrismaClientOrTx
): Promise<ExamIncidentRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examIncident.findMany({
    where: buildListWhere(filters),
    select: incidentSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export async function countExamIncidents(
  filters: ListExamIncidentsFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examIncident.count({ where: buildListWhere(filters) });
}

export interface UpdateExamIncidentMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamIncidentMetadataInput;
}

export async function updateExamIncidentMetadata(
  params: UpdateExamIncidentMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examIncident.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data: { ...params.patch },
  });
  return { count: res.count };
}
