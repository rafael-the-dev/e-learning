import {
  findTeacherAttendancePendingRows,
  findTeacherAssessmentsToGradeRows,
  findTeacherResultsToPublishRows,
} from "@/modules/teacher-portal/repositories/teacher-portal.repository";
import type { TeacherPendingWork } from "@/modules/teacher-portal/types";

export async function getTeacherPendingWork(
  teacherId: string,
  organizationId: string
): Promise<TeacherPendingWork> {
  const [attendancePending, assessmentsToGrade, resultsToPublish] = await Promise.all([
    findTeacherAttendancePendingRows(teacherId, organizationId),
    findTeacherAssessmentsToGradeRows(teacherId, organizationId),
    findTeacherResultsToPublishRows(teacherId, organizationId),
  ]);

  return { attendancePending, assessmentsToGrade, resultsToPublish };
}
