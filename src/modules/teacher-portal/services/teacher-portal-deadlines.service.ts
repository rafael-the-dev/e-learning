import { findTeacherUpcomingDeadlines } from "@/modules/teacher-portal/repositories/teacher-portal.repository";
import type { TeacherDeadline } from "@/modules/teacher-portal/types";

export async function getTeacherUpcomingDeadlines(
  teacherId: string,
  organizationId: string
): Promise<TeacherDeadline[]> {
  return findTeacherUpcomingDeadlines(teacherId, organizationId);
}
