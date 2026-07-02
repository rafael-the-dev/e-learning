import { getDb, type PrismaClientOrTx } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { Assessment, ListAssessmentsParams } from "@/modules/assessments/types";

const assessmentSelect = {
  id: true,
  organizationId: true,
  assessmentPolicyId: true,
  assessmentComponentId: true,
  assessmentPeriodId: true,
  academicYearId: true,
  academicTermId: true,
  classGroupId: true,
  courseId: true,
  courseLevelId: true,
  levelSubjectId: true,
  subjectId: true,
  teacherId: true,
  title: true,
  description: true,
  assessmentDate: true,
  maxScore: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  assessmentPolicy: { select: { id: true, name: true } },
  assessmentComponent: { select: { id: true, name: true, componentType: true } },
  assessmentPeriod: { select: { id: true, name: true, code: true } },
  classGroup: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  academicYear: { select: { id: true, name: true } },
  academicTerm: { select: { id: true, name: true } },
  _count: {
    select: {
      results: { where: { deletedAt: null } },
    },
  },
} as const;

function mapToAssessment(row: any): Assessment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    assessmentPolicyId: row.assessmentPolicyId,
    assessmentComponentId: row.assessmentComponentId,
    assessmentPeriodId: row.assessmentPeriodId,
    academicYearId: row.academicYearId,
    academicTermId: row.academicTermId,
    classGroupId: row.classGroupId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId,
    levelSubjectId: row.levelSubjectId,
    subjectId: row.subjectId,
    teacherId: row.teacherId,
    title: row.title,
    description: row.description,
    assessmentDate: row.assessmentDate,
    maxScore: Number(row.maxScore),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    assessmentPolicyName: row.assessmentPolicy?.name ?? null,
    componentName: row.assessmentComponent?.name ?? null,
    componentType: row.assessmentComponent?.componentType ?? null,
    periodName: row.assessmentPeriod?.name ?? null,
    periodCode: row.assessmentPeriod?.code ?? null,
    classGroupName: row.classGroup?.name ?? null,
    teacherName: row.teacher ? `${row.teacher.firstName} ${row.teacher.lastName}` : null,
    academicYearName: row.academicYear?.name ?? null,
    academicTermName: row.academicTerm?.name ?? null,
    resultsCount: row._count?.results ?? 0,
  };
}

export async function findAssessmentsByOrganization(
  organizationId: string,
  params: ListAssessmentsParams
): Promise<PaginatedResult<Assessment>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where: any = { organizationId, deletedAt: null };
  if (params.status) where.status = params.status;
  if (params.classGroupId) where.classGroupId = params.classGroupId;
  if (params.assessmentPeriodId) where.assessmentPeriodId = params.assessmentPeriodId;
  if (params.levelSubjectId) where.levelSubjectId = params.levelSubjectId;
  if (params.academicYearId) where.academicYearId = params.academicYearId;
  // Teacher scope: assessment assigned to me OR for a class group I teach. The
  // classGroup fallback covers assessments where the nullable teacherId was
  // never set. teacherId is resolved server-side — never from client input.
  if (params.teacherId) {
    where.OR = [
      { teacherId: params.teacherId },
      { classGroup: { teacherId: params.teacherId } },
    ];
  }
  if (params.search) where.title = { contains: params.search };

  const [rows, total] = await Promise.all([
    db.assessment.findMany({
      where,
      select: assessmentSelect,
      skip,
      take,
      orderBy: [{ assessmentDate: "desc" }, { createdAt: "desc" }],
    }),
    db.assessment.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToAssessment), total, params);
}

export async function findAssessmentById(
  id: string,
  organizationId: string
): Promise<Assessment | null> {
  const db = await getDb();
  const row = await db.assessment.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: assessmentSelect,
  });
  return row ? mapToAssessment(row) : null;
}

export async function createAssessment(data: {
  organizationId: string;
  assessmentPolicyId: string;
  assessmentComponentId: string;
  assessmentPeriodId: string;
  academicYearId: string;
  academicTermId?: string | null;
  classGroupId: string;
  courseId: string;
  courseLevelId: string;
  levelSubjectId: string;
  subjectId: string;
  teacherId?: string | null;
  title: string;
  description?: string | null;
  assessmentDate: Date;
  maxScore: number;
  createdBy?: string | null;
}): Promise<Assessment> {
  const db = await getDb();
  const row = await db.assessment.create({
    data: {
      organizationId: data.organizationId,
      assessmentPolicyId: data.assessmentPolicyId,
      assessmentComponentId: data.assessmentComponentId,
      assessmentPeriodId: data.assessmentPeriodId,
      academicYearId: data.academicYearId,
      academicTermId: data.academicTermId ?? null,
      classGroupId: data.classGroupId,
      courseId: data.courseId,
      courseLevelId: data.courseLevelId,
      levelSubjectId: data.levelSubjectId,
      subjectId: data.subjectId,
      teacherId: data.teacherId ?? null,
      title: data.title,
      description: data.description ?? null,
      assessmentDate: data.assessmentDate,
      maxScore: data.maxScore,
      status: "DRAFT",
      createdBy: data.createdBy ?? null,
    },
    select: assessmentSelect,
  });
  return mapToAssessment(row);
}

export async function updateAssessment(
  id: string,
  organizationId: string,
  data: Partial<{
    title: string;
    description: string | null;
    assessmentDate: Date;
    maxScore: number;
    teacherId: string | null;
    status: string;
  }>,
  client?: PrismaClientOrTx
): Promise<Assessment> {
  const db = client ?? await getDb();
  const row = await db.assessment.update({
    where: { id },
    data,
    select: assessmentSelect,
  });
  return mapToAssessment(row);
}
