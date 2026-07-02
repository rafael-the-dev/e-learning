import { getDb, type PrismaClientOrTx } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { AssessmentResult, ListAssessmentResultsParams } from "@/modules/assessments/types";

const resultSelect = {
  id: true,
  organizationId: true,
  assessmentId: true,
  studentId: true,
  enrollmentId: true,
  score: true,
  normalizedScore: true,
  feedback: true,
  status: true,
  gradedByUserId: true,
  gradedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  student: { select: { id: true, firstName: true, lastName: true, code: true } },
} as const;

function mapToResult(row: any): AssessmentResult {
  const firstName = row.student?.firstName ?? null;
  const lastName = row.student?.lastName ?? null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    assessmentId: row.assessmentId,
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    score: row.score !== null ? Number(row.score) : null,
    normalizedScore: row.normalizedScore !== null ? Number(row.normalizedScore) : null,
    feedback: row.feedback,
    status: row.status,
    gradedByUserId: row.gradedByUserId,
    gradedAt: row.gradedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    studentFirstName: firstName,
    studentLastName: lastName,
    studentCode: row.student?.code ?? null,
    studentName: [firstName, lastName].filter(Boolean).join(" ") || null,
  };
}

export async function findResultsByAssessment(
  assessmentId: string,
  organizationId: string,
  params: ListAssessmentResultsParams = {}
): Promise<PaginatedResult<AssessmentResult>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where: any = { assessmentId, organizationId, deletedAt: null };
  if (params.status) where.status = params.status;

  const [rows, total] = await Promise.all([
    db.assessmentResult.findMany({
      where,
      select: resultSelect,
      skip,
      take,
      orderBy: [{ student: { lastName: "asc" } }],
    }),
    db.assessmentResult.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToResult), total, params);
}

export async function findAllResultsByAssessment(
  assessmentId: string,
  organizationId: string
): Promise<AssessmentResult[]> {
  const db = await getDb();
  const rows = await db.assessmentResult.findMany({
    where: { assessmentId, organizationId, deletedAt: null },
    select: resultSelect,
    orderBy: [{ student: { lastName: "asc" } }],
  });
  return rows.map(mapToResult);
}

export async function findResultsByStudent(
  studentId: string,
  organizationId: string
): Promise<AssessmentResult[]> {
  const db = await getDb();
  const rows = await db.assessmentResult.findMany({
    where: { studentId, organizationId, deletedAt: null },
    select: resultSelect,
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map(mapToResult);
}

export async function findResultById(
  id: string,
  organizationId: string
): Promise<AssessmentResult | null> {
  const db = await getDb();
  const row = await db.assessmentResult.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: resultSelect,
  });
  return row ? mapToResult(row) : null;
}

export async function findResultByAssessmentAndStudent(
  assessmentId: string,
  studentId: string,
  organizationId: string
): Promise<AssessmentResult | null> {
  const db = await getDb();
  const row = await db.assessmentResult.findFirst({
    where: { assessmentId, studentId, organizationId, deletedAt: null },
    select: resultSelect,
  });
  return row ? mapToResult(row) : null;
}

export async function createAssessmentResult(data: {
  organizationId: string;
  assessmentId: string;
  studentId: string;
  enrollmentId?: string | null;
  status?: string;
}): Promise<AssessmentResult> {
  const db = await getDb();
  const row = await db.assessmentResult.create({
    data: {
      organizationId: data.organizationId,
      assessmentId: data.assessmentId,
      studentId: data.studentId,
      enrollmentId: data.enrollmentId ?? null,
      status: data.status ?? "PENDING",
    },
    select: resultSelect,
  });
  return mapToResult(row);
}

export async function updateAssessmentResult(
  id: string,
  organizationId: string,
  data: Partial<{
    score: number | null;
    normalizedScore: number | null;
    feedback: string | null;
    status: string;
    gradedByUserId: string | null;
    gradedAt: Date | null;
  }>,
  client?: PrismaClientOrTx
): Promise<AssessmentResult> {
  const db = client ?? await getDb();
  const row = await db.assessmentResult.update({
    where: { id },
    data,
    select: resultSelect,
  });
  return mapToResult(row);
}

export async function upsertAssessmentResult(data: {
  organizationId: string;
  assessmentId: string;
  studentId: string;
  enrollmentId?: string | null;
  score: number | null;
  normalizedScore: number | null;
  feedback?: string | null;
  status: string;
  gradedByUserId?: string | null;
  gradedAt?: Date | null;
}, client?: PrismaClientOrTx): Promise<AssessmentResult> {
  const db = client ?? await getDb();
  const existing = await db.assessmentResult.findFirst({
    where: {
      assessmentId: data.assessmentId,
      studentId: data.studentId,
      organizationId: data.organizationId,
    },
  });

  if (existing) {
    const row = await db.assessmentResult.update({
      where: { id: existing.id },
      data: {
        score: data.score,
        normalizedScore: data.normalizedScore,
        feedback: data.feedback ?? null,
        status: data.status,
        gradedByUserId: data.gradedByUserId ?? null,
        gradedAt: data.gradedAt ?? null,
        deletedAt: null,
      },
      select: resultSelect,
    });
    return mapToResult(row);
  }

  const row = await db.assessmentResult.create({
    data: {
      organizationId: data.organizationId,
      assessmentId: data.assessmentId,
      studentId: data.studentId,
      enrollmentId: data.enrollmentId ?? null,
      score: data.score,
      normalizedScore: data.normalizedScore,
      feedback: data.feedback ?? null,
      status: data.status,
      gradedByUserId: data.gradedByUserId ?? null,
      gradedAt: data.gradedAt ?? null,
    },
    select: resultSelect,
  });
  return mapToResult(row);
}
