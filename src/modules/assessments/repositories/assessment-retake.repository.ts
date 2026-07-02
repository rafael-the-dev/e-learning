import { getDb, type PrismaClientOrTx } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { AssessmentRetake, ListAssessmentRetakesParams } from "@/modules/assessments/types";

const retakeSelect = {
  id: true,
  organizationId: true,
  originalAssessmentResultId: true,
  assessmentId: true,
  studentId: true,
  enrollmentId: true,
  attemptNumber: true,
  score: true,
  normalizedScore: true,
  status: true,
  requestedAt: true,
  approvedAt: true,
  approvedByUserId: true,
  gradedAt: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  assessment: { select: { id: true, title: true } },
} as const;

function mapToRetake(row: any): AssessmentRetake {
  return {
    id: row.id,
    organizationId: row.organizationId,
    originalAssessmentResultId: row.originalAssessmentResultId,
    assessmentId: row.assessmentId,
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    attemptNumber: row.attemptNumber,
    score: row.score !== null ? Number(row.score) : null,
    normalizedScore: row.normalizedScore !== null ? Number(row.normalizedScore) : null,
    status: row.status,
    requestedAt: row.requestedAt,
    approvedAt: row.approvedAt,
    approvedByUserId: row.approvedByUserId,
    gradedAt: row.gradedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    studentFirstName: row.student?.firstName ?? null,
    studentLastName: row.student?.lastName ?? null,
    assessmentTitle: row.assessment?.title ?? null,
  };
}

export async function findRetakesByOrganization(
  organizationId: string,
  params: ListAssessmentRetakesParams
): Promise<PaginatedResult<AssessmentRetake>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where: any = { organizationId };
  if (params.assessmentId) where.assessmentId = params.assessmentId;
  if (params.studentId) where.studentId = params.studentId;
  if (params.status) where.status = params.status;

  const [rows, total] = await Promise.all([
    db.assessmentRetake.findMany({
      where,
      select: retakeSelect,
      skip,
      take,
      orderBy: [{ requestedAt: "desc" }],
    }),
    db.assessmentRetake.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToRetake), total, params);
}

export async function findRetakesByResult(
  originalAssessmentResultId: string,
  organizationId: string
): Promise<AssessmentRetake[]> {
  const db = await getDb();
  const rows = await db.assessmentRetake.findMany({
    where: { originalAssessmentResultId, organizationId },
    select: retakeSelect,
    orderBy: [{ attemptNumber: "asc" }],
  });
  return rows.map(mapToRetake);
}

export async function findRetakeById(
  id: string,
  organizationId: string
): Promise<AssessmentRetake | null> {
  const db = await getDb();
  const row = await db.assessmentRetake.findFirst({
    where: { id, organizationId },
    select: retakeSelect,
  });
  return row ? mapToRetake(row) : null;
}

export async function countApprovedRetakesByResult(
  originalAssessmentResultId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.assessmentRetake.count({
    where: {
      originalAssessmentResultId,
      organizationId,
      status: { in: ["APPROVED", "GRADED"] },
    },
  });
}

export async function createAssessmentRetake(data: {
  organizationId: string;
  originalAssessmentResultId: string;
  assessmentId: string;
  studentId: string;
  enrollmentId?: string | null;
  attemptNumber: number;
}): Promise<AssessmentRetake> {
  const db = await getDb();
  const row = await db.assessmentRetake.create({
    data: {
      organizationId: data.organizationId,
      originalAssessmentResultId: data.originalAssessmentResultId,
      assessmentId: data.assessmentId,
      studentId: data.studentId,
      enrollmentId: data.enrollmentId ?? null,
      attemptNumber: data.attemptNumber,
      status: "REQUESTED",
    },
    select: retakeSelect,
  });
  return mapToRetake(row);
}

export async function updateAssessmentRetake(
  id: string,
  organizationId: string,
  data: Partial<{
    score: number | null;
    normalizedScore: number | null;
    status: string;
    approvedAt: Date | null;
    approvedByUserId: string | null;
    gradedAt: Date | null;
  }>,
  client?: PrismaClientOrTx
): Promise<AssessmentRetake> {
  const db = client ?? await getDb();
  const row = await db.assessmentRetake.update({
    where: { id },
    data,
    select: retakeSelect,
  });
  return mapToRetake(row);
}
