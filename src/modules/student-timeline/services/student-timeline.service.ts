import {
  findTimelineEvents,
  findTimelineEventById,
  findRecentTimelineEvents,
} from "@/modules/student-timeline/repositories/student-timeline.repository";
import type { StudentTimelineEvent, StudentTimelineFilters } from "@/modules/student-timeline/types";

export async function getStudentTimeline(
  studentId: string,
  organizationId: string,
  filters: StudentTimelineFilters = {}
): Promise<{ events: StudentTimelineEvent[]; total: number; page: number; pageSize: number }> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 30;
  const { events, total } = await findTimelineEvents(studentId, organizationId, {
    ...filters,
    page,
    pageSize,
  });
  return { events, total, page, pageSize };
}

export async function getTimelineEventById(
  id: string,
  organizationId: string
): Promise<StudentTimelineEvent | null> {
  return findTimelineEventById(id, organizationId);
}

export async function getRecentTimelineEvents(
  studentId: string,
  organizationId: string,
  limit = 5
): Promise<StudentTimelineEvent[]> {
  return findRecentTimelineEvents(studentId, organizationId, limit);
}
