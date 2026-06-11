import { getDb } from "@/server/db";
import type { GradeChangeLog } from "@/modules/grades/types";

const logSelect = {
  id: true,
  organizationId: true,
  studentAssessmentResultId: true,
  assessmentEventId: true,
  oldGrade: true,
  newGrade: true,
  oldStatus: true,
  newStatus: true,
  reason: true,
  changedBy: true,
  changedAt: true,
} as const;

function mapToLog(row: any): GradeChangeLog {
  return {
    id: row.id,
    organizationId: row.organizationId,
    studentAssessmentResultId: row.studentAssessmentResultId,
    assessmentEventId: row.assessmentEventId ?? null,
    oldGrade: row.oldGrade != null ? Number(row.oldGrade) : null,
    newGrade: Number(row.newGrade),
    oldStatus: row.oldStatus ?? null,
    newStatus: row.newStatus,
    reason: row.reason,
    changedBy: row.changedBy,
    changedAt: row.changedAt,
  };
}

export async function createGradeChangeLog(data: {
  organizationId: string;
  studentAssessmentResultId: string;
  assessmentEventId?: string | null;
  oldGrade: number | null;
  newGrade: number;
  oldStatus: string | null;
  newStatus: string;
  reason: string;
  changedBy: string;
}): Promise<GradeChangeLog> {
  const db = await getDb();
  const row = await db.gradeChangeLog.create({
    data: {
      organizationId: data.organizationId,
      studentAssessmentResultId: data.studentAssessmentResultId,
      assessmentEventId: data.assessmentEventId ?? null,
      oldGrade: data.oldGrade,
      newGrade: data.newGrade,
      oldStatus: data.oldStatus,
      newStatus: data.newStatus,
      reason: data.reason,
      changedBy: data.changedBy,
    },
    select: logSelect,
  });
  return mapToLog(row);
}

export async function findChangeLogsByResult(
  studentAssessmentResultId: string,
  organizationId: string
): Promise<GradeChangeLog[]> {
  const db = await getDb();
  const rows = await db.gradeChangeLog.findMany({
    where: { studentAssessmentResultId, organizationId },
    select: logSelect,
    orderBy: { changedAt: "desc" },
  });
  return rows.map(mapToLog);
}
