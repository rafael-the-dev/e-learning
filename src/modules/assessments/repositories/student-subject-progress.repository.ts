import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { StudentSubjectProgress, ListStudentSubjectProgressParams } from "@/modules/assessments/types";

const progressSelect = {
  id: true,
  organizationId: true,
  studentId: true,
  enrollmentId: true,
  levelSubjectId: true,
  finalGrade: true,
  attendancePercentage: true,
  status: true,
  progressReason: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { firstName: true, lastName: true } },
  levelSubject: {
    select: {
      subject: { select: { name: true } },
      courseLevel: { select: { name: true } },
      minimumPassingGrade: true,
      minimumAttendancePercentage: true,
    },
  },
} as const;

function mapToProgress(row: any): StudentSubjectProgress {
  const firstName = row.student?.firstName ?? null;
  const lastName = row.student?.lastName ?? null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    levelSubjectId: row.levelSubjectId,
    finalGrade: row.finalGrade !== null ? Number(row.finalGrade) : null,
    attendancePercentage:
      row.attendancePercentage !== null ? Number(row.attendancePercentage) : null,
    status: row.status,
    progressReason: row.progressReason,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    studentName: [firstName, lastName].filter(Boolean).join(" ") || null,
    subjectName: row.levelSubject?.subject?.name ?? null,
    courseLevelName: row.levelSubject?.courseLevel?.name ?? null,
    minimumPassingGrade: row.levelSubject?.minimumPassingGrade != null
      ? Number(row.levelSubject.minimumPassingGrade)
      : null,
    minimumAttendancePercentage: row.levelSubject?.minimumAttendancePercentage != null
      ? Number(row.levelSubject.minimumAttendancePercentage)
      : null,
  };
}

export async function findProgressByOrganization(
  organizationId: string,
  params: ListStudentSubjectProgressParams
): Promise<PaginatedResult<StudentSubjectProgress>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where: any = { organizationId };
  if (params.studentId) where.studentId = params.studentId;
  if (params.enrollmentId) where.enrollmentId = params.enrollmentId;
  if (params.levelSubjectId) where.levelSubjectId = params.levelSubjectId;
  if (params.status) where.status = params.status;
  if (params.search) {
    where.student = {
      OR: [
        { firstName: { contains: params.search } },
        { lastName: { contains: params.search } },
      ],
    };
  }

  const [rows, total] = await Promise.all([
    db.studentSubjectProgress.findMany({
      where,
      select: progressSelect,
      skip,
      take,
      orderBy: [{ updatedAt: "desc" }],
    }),
    db.studentSubjectProgress.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToProgress), total, params);
}

export async function findProgressByEnrollment(
  enrollmentId: string,
  organizationId: string
): Promise<StudentSubjectProgress[]> {
  const db = await getDb();
  const rows = await db.studentSubjectProgress.findMany({
    where: { enrollmentId, organizationId },
    select: progressSelect,
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map(mapToProgress);
}

export async function findProgressByEnrollmentAndLevelSubject(
  enrollmentId: string,
  levelSubjectId: string,
  organizationId: string
): Promise<StudentSubjectProgress | null> {
  const db = await getDb();
  const row = await db.studentSubjectProgress.findFirst({
    where: { enrollmentId, levelSubjectId, organizationId },
    select: progressSelect,
  });
  return row ? mapToProgress(row) : null;
}

export async function upsertStudentSubjectProgress(data: {
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  finalGrade: number | null;
  attendancePercentage: number | null;
  status: string;
  progressReason: string | null;
  completedAt: Date | null;
}): Promise<StudentSubjectProgress> {
  const db = await getDb();
  const row = await db.studentSubjectProgress.upsert({
    where: {
      enrollmentId_levelSubjectId: {
        enrollmentId: data.enrollmentId,
        levelSubjectId: data.levelSubjectId,
      },
    },
    create: {
      organizationId: data.organizationId,
      studentId: data.studentId,
      enrollmentId: data.enrollmentId,
      levelSubjectId: data.levelSubjectId,
      finalGrade: data.finalGrade,
      attendancePercentage: data.attendancePercentage,
      status: data.status,
      progressReason: data.progressReason,
      completedAt: data.completedAt,
    },
    update: {
      finalGrade: data.finalGrade,
      attendancePercentage: data.attendancePercentage,
      status: data.status,
      progressReason: data.progressReason,
      completedAt: data.completedAt,
    },
    select: progressSelect,
  });
  return mapToProgress(row);
}
