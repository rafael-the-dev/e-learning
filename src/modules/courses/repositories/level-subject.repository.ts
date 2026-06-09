import { getDb } from "@/server/db";
import type { LevelSubject } from "@/modules/courses/types";

// =============================================================================
// LEVEL SUBJECTS REPOSITORY
// Manages the relationship between CourseLevel and Subject with contextual rules.
// All queries are tenant-scoped via organizationId.
// =============================================================================

const levelSubjectSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  courseLevelId: true,
  subjectId: true,
  order: true,
  workloadHours: true,
  theoryHours: true,
  practicalHours: true,
  minimumPassingGrade: true,
  minimumAttendancePercentage: true,
  maxAbsences: true,
  isRequired: true,
  allowRetakeExam: true,
  allowCompensation: true,
  certificateRequired: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  subject: {
    select: { name: true, code: true },
  },
  courseLevel: {
    select: { name: true },
  },
} as const;

function mapToLevelSubject(row: {
  id: string;
  organizationId: string;
  courseId: string;
  courseLevelId: string;
  subjectId: string;
  order: number;
  workloadHours: number | null;
  theoryHours: number | null;
  practicalHours: number | null;
  minimumPassingGrade: { toString(): string } | null;
  minimumAttendancePercentage: { toString(): string } | null;
  maxAbsences: number | null;
  isRequired: boolean;
  allowRetakeExam: boolean;
  allowCompensation: boolean;
  certificateRequired: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  subject?: { name: string; code: string | null };
  courseLevel?: { name: string };
}): LevelSubject {
  return {
    id: row.id,
    organizationId: row.organizationId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId,
    subjectId: row.subjectId,
    order: row.order,
    workloadHours: row.workloadHours,
    theoryHours: row.theoryHours,
    practicalHours: row.practicalHours,
    minimumPassingGrade: row.minimumPassingGrade ? row.minimumPassingGrade.toString() : null,
    minimumAttendancePercentage: row.minimumAttendancePercentage
      ? row.minimumAttendancePercentage.toString()
      : null,
    maxAbsences: row.maxAbsences,
    isRequired: row.isRequired,
    allowRetakeExam: row.allowRetakeExam,
    allowCompensation: row.allowCompensation,
    certificateRequired: row.certificateRequired,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    subjectName: row.subject?.name,
    subjectCode: row.subject?.code ?? null,
    courseLevelName: row.courseLevel?.name,
  };
}

export async function findLevelSubjectsByLevel(
  courseLevelId: string,
  organizationId: string
): Promise<LevelSubject[]> {
  const db = await getDb();
  const rows = await db.levelSubject.findMany({
    where: { courseLevelId, organizationId, deletedAt: null },
    select: levelSubjectSelect,
    orderBy: { order: "asc" },
  });
  return rows.map(mapToLevelSubject);
}

export async function findLevelSubjectById(
  id: string,
  organizationId: string
): Promise<LevelSubject | null> {
  const db = await getDb();
  const row = await db.levelSubject.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: levelSubjectSelect,
  });
  return row ? mapToLevelSubject(row) : null;
}

export async function existsLevelSubjectLink(
  courseLevelId: string,
  subjectId: string,
  organizationId: string
): Promise<boolean> {
  const db = await getDb();
  const row = await db.levelSubject.findFirst({
    where: { courseLevelId, subjectId, organizationId },
    select: { id: true },
  });
  return row !== null;
}

export async function isOrderTakenInLevel(
  courseLevelId: string,
  order: number,
  excludeId?: string
): Promise<boolean> {
  const db = await getDb();
  const row = await db.levelSubject.findFirst({
    where: {
      courseLevelId,
      order,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return row !== null;
}

export async function getNextOrderInLevel(courseLevelId: string): Promise<number> {
  const db = await getDb();
  const last = await db.levelSubject.findFirst({
    where: { courseLevelId, deletedAt: null },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return last ? last.order + 1 : 0;
}

export async function createLevelSubject(data: {
  organizationId: string;
  courseId: string;
  courseLevelId: string;
  subjectId: string;
  order: number;
  workloadHours?: number | null;
  theoryHours?: number | null;
  practicalHours?: number | null;
  minimumPassingGrade?: number | null;
  minimumAttendancePercentage?: number | null;
  maxAbsences?: number | null;
  isRequired: boolean;
  allowRetakeExam: boolean;
  allowCompensation: boolean;
  certificateRequired: boolean;
  status: string;
}): Promise<LevelSubject> {
  const db = await getDb();
  const row = await db.levelSubject.create({
    data: {
      organizationId: data.organizationId,
      courseId: data.courseId,
      courseLevelId: data.courseLevelId,
      subjectId: data.subjectId,
      order: data.order,
      workloadHours: data.workloadHours ?? null,
      theoryHours: data.theoryHours ?? null,
      practicalHours: data.practicalHours ?? null,
      minimumPassingGrade: data.minimumPassingGrade ?? null,
      minimumAttendancePercentage: data.minimumAttendancePercentage ?? null,
      maxAbsences: data.maxAbsences ?? null,
      isRequired: data.isRequired,
      allowRetakeExam: data.allowRetakeExam,
      allowCompensation: data.allowCompensation,
      certificateRequired: data.certificateRequired,
      status: data.status,
    },
    select: levelSubjectSelect,
  });
  return mapToLevelSubject(row);
}

export async function updateLevelSubject(
  id: string,
  organizationId: string,
  data: {
    order?: number;
    workloadHours?: number | null;
    theoryHours?: number | null;
    practicalHours?: number | null;
    minimumPassingGrade?: number | null;
    minimumAttendancePercentage?: number | null;
    maxAbsences?: number | null;
    isRequired?: boolean;
    allowRetakeExam?: boolean;
    allowCompensation?: boolean;
    certificateRequired?: boolean;
    status?: string;
  }
): Promise<LevelSubject> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.order !== undefined) updateData.order = data.order;
  if (data.workloadHours !== undefined) updateData.workloadHours = data.workloadHours;
  if (data.theoryHours !== undefined) updateData.theoryHours = data.theoryHours;
  if (data.practicalHours !== undefined) updateData.practicalHours = data.practicalHours;
  if (data.minimumPassingGrade !== undefined) updateData.minimumPassingGrade = data.minimumPassingGrade;
  if (data.minimumAttendancePercentage !== undefined) updateData.minimumAttendancePercentage = data.minimumAttendancePercentage;
  if (data.maxAbsences !== undefined) updateData.maxAbsences = data.maxAbsences;
  if (data.isRequired !== undefined) updateData.isRequired = data.isRequired;
  if (data.allowRetakeExam !== undefined) updateData.allowRetakeExam = data.allowRetakeExam;
  if (data.allowCompensation !== undefined) updateData.allowCompensation = data.allowCompensation;
  if (data.certificateRequired !== undefined) updateData.certificateRequired = data.certificateRequired;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.levelSubject.update({
    where: { id, organizationId },
    data: updateData,
    select: levelSubjectSelect,
  });
  return mapToLevelSubject(row);
}

export async function deleteLevelSubject(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.levelSubject.delete({ where: { id, organizationId } });
}

export async function reorderLevelSubjects(
  organizationId: string,
  items: { id: string; order: number }[]
): Promise<void> {
  const db = await getDb();
  await db.$transaction(
    items.map(({ id, order }) =>
      db.levelSubject.update({ where: { id, organizationId }, data: { order } })
    )
  );
}
