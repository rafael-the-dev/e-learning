import { getDb, type PrismaClientOrTx } from "@/server/db";
import type {
  StudentAssessmentResult,
  ListStudentAssessmentResultsParams,
} from "@/modules/grades/types";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";

const resultSelect = {
  id: true,
  organizationId: true,
  enrollmentId: true,
  studentId: true,
  levelSubjectId: true,
  subjectId: true,
  assessmentComponentId: true,
  assessmentEventId: true,
  sourceType: true,
  grade: true,
  maxGrade: true,
  normalizedGrade: true,
  notes: true,
  status: true,
  gradedBy: true,
  gradedAt: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { id: true, firstName: true, lastName: true, code: true } },
  assessmentComponent: { select: { id: true, name: true, componentType: true } },
  subject: { select: { id: true, name: true } },
} as const;

function mapToResult(row: any): StudentAssessmentResult {
  return {
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    levelSubjectId: row.levelSubjectId,
    subjectId: row.subjectId,
    assessmentComponentId: row.assessmentComponentId,
    assessmentEventId: row.assessmentEventId ?? null,
    sourceType: row.sourceType,
    grade: Number(row.grade),
    maxGrade: Number(row.maxGrade),
    normalizedGrade: Number(row.normalizedGrade),
    notes: row.notes ?? null,
    status: row.status,
    gradedBy: row.gradedBy ?? null,
    gradedAt: row.gradedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    studentFirstName: row.student?.firstName ?? null,
    studentLastName: row.student?.lastName ?? null,
    studentCode: row.student?.code ?? null,
    studentName: row.student
      ? [row.student.firstName, row.student.lastName].filter(Boolean).join(" ")
      : null,
    componentName: row.assessmentComponent?.name ?? null,
    componentType: row.assessmentComponent?.componentType ?? null,
    subjectName: row.subject?.name ?? null,
  };
}

export async function findStudentAssessmentResults(
  organizationId: string,
  params: ListStudentAssessmentResultsParams = {}
): Promise<PaginatedResult<StudentAssessmentResult>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where: any = { organizationId };
  if (params.enrollmentId) where.enrollmentId = params.enrollmentId;
  if (params.studentId) where.studentId = params.studentId;
  if (params.subjectId) where.subjectId = params.subjectId;
  if (params.levelSubjectId) where.levelSubjectId = params.levelSubjectId;
  if (params.assessmentComponentId) where.assessmentComponentId = params.assessmentComponentId;
  if (params.status) where.status = params.status;

  const [rows, total] = await Promise.all([
    db.studentAssessmentResult.findMany({
      where,
      select: resultSelect,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.studentAssessmentResult.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToResult), total, params);
}

export async function findResultsByEnrollmentAndLevelSubject(
  enrollmentId: string,
  levelSubjectId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentAssessmentResult[]> {
  const db = client ?? await getDb();
  const rows = await db.studentAssessmentResult.findMany({
    where: {
      enrollmentId,
      levelSubjectId,
      organizationId,
      status: { not: "CANCELLED" },
    },
    select: resultSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapToResult);
}

export async function findResultsByEnrollmentAndSubject(
  enrollmentId: string,
  subjectId: string,
  organizationId: string
): Promise<StudentAssessmentResult[]> {
  const db = await getDb();
  const rows = await db.studentAssessmentResult.findMany({
    where: {
      enrollmentId,
      subjectId,
      organizationId,
      status: { not: "CANCELLED" },
    },
    select: resultSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapToResult);
}

export async function findResultById(
  id: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentAssessmentResult | null> {
  const db = client ?? await getDb();
  const row = await db.studentAssessmentResult.findFirst({
    where: { id, organizationId },
    select: resultSelect,
  });
  return row ? mapToResult(row) : null;
}

export async function findResultsByAssessmentEvent(
  assessmentEventId: string,
  organizationId: string
): Promise<StudentAssessmentResult[]> {
  const db = await getDb();
  const rows = await db.studentAssessmentResult.findMany({
    where: {
      assessmentEventId,
      organizationId,
      status: { not: "CANCELLED" },
    },
    select: resultSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapToResult);
}

export async function findResultByEnrollmentAndComponent(
  enrollmentId: string,
  assessmentComponentId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentAssessmentResult | null> {
  const db = client ?? await getDb();
  const row = await db.studentAssessmentResult.findFirst({
    where: { enrollmentId, assessmentComponentId, organizationId },
    select: resultSelect,
  });
  return row ? mapToResult(row) : null;
}

export async function upsertStudentAssessmentResult(data: {
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  levelSubjectId: string;
  subjectId: string;
  assessmentComponentId: string;
  assessmentEventId?: string | null;
  sourceType?: string;
  grade: number;
  maxGrade: number;
  normalizedGrade: number;
  notes?: string | null;
  status: string;
  gradedBy?: string | null;
  gradedAt?: Date | null;
}, client?: PrismaClientOrTx): Promise<StudentAssessmentResult> {
  const db = client ?? await getDb();

  const existing = await db.studentAssessmentResult.findUnique({
    where: {
      enrollmentId_assessmentComponentId: {
        enrollmentId: data.enrollmentId,
        assessmentComponentId: data.assessmentComponentId,
      },
    },
  });

  if (existing) {
    const row = await db.studentAssessmentResult.update({
      where: { id: existing.id },
      data: {
        grade: data.grade,
        maxGrade: data.maxGrade,
        normalizedGrade: data.normalizedGrade,
        notes: data.notes,
        status: data.status,
        gradedBy: data.gradedBy,
        gradedAt: data.gradedAt,
        ...(data.assessmentEventId !== undefined ? { assessmentEventId: data.assessmentEventId } : {}),
        ...(data.sourceType ? { sourceType: data.sourceType } : {}),
        updatedAt: new Date(),
      },
      select: resultSelect,
    });
    return mapToResult(row);
  }

  const row = await db.studentAssessmentResult.create({
    data: {
      organizationId: data.organizationId,
      enrollmentId: data.enrollmentId,
      studentId: data.studentId,
      levelSubjectId: data.levelSubjectId,
      subjectId: data.subjectId,
      assessmentComponentId: data.assessmentComponentId,
      assessmentEventId: data.assessmentEventId ?? null,
      sourceType: data.sourceType ?? "CONTINUOUS",
      grade: data.grade,
      maxGrade: data.maxGrade,
      normalizedGrade: data.normalizedGrade,
      notes: data.notes ?? null,
      status: data.status,
      gradedBy: data.gradedBy ?? null,
      gradedAt: data.gradedAt ?? null,
    },
    select: resultSelect,
  });
  return mapToResult(row);
}

export async function updateStudentAssessmentResult(
  id: string,
  organizationId: string,
  data: Partial<{
    grade: number;
    maxGrade: number;
    normalizedGrade: number;
    notes: string | null;
    status: string;
    gradedBy: string | null;
    gradedAt: Date | null;
  }>,
  client?: PrismaClientOrTx
): Promise<StudentAssessmentResult> {
  const db = client ?? await getDb();
  const row = await db.studentAssessmentResult.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
    select: resultSelect,
  });
  return mapToResult(row);
}
