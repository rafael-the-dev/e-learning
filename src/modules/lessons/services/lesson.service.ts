import { NotFoundError } from "@/shared/lib/command";
import {
  findLessonsByOrganization,
  findLessonByIdInOrganization,
  findAllPublishedLessons,
  countLessonsByOrganization,
  countPublishedLessons,
  type ListLessonsParams,
} from "@/modules/lessons/repositories/lesson.repository";
import {
  findAttachmentsByLesson,
} from "@/modules/lessons/repositories/lesson-attachment.repository";
import {
  findSubjectLessonsBySubject,
  findSubjectsByLesson,
} from "@/modules/lessons/repositories/subject-lesson.repository";
import type {
  Lesson,
  LessonAttachment,
  SubjectLesson,
} from "@/modules/lessons/types";
import type { PaginatedResult } from "@/shared/types/common";

export async function getLessonsByOrganization(
  organizationId: string,
  params: ListLessonsParams
): Promise<PaginatedResult<Lesson>> {
  return findLessonsByOrganization(organizationId, params);
}

export async function getLessonById(
  id: string,
  organizationId: string
): Promise<Lesson> {
  const lesson = await findLessonByIdInOrganization(id, organizationId);
  if (!lesson) throw new NotFoundError("Lição", id);
  return lesson;
}

export async function getPublishedLessons(organizationId: string): Promise<Lesson[]> {
  return findAllPublishedLessons(organizationId);
}

export async function getLessonAttachments(
  lessonId: string,
  organizationId: string
): Promise<LessonAttachment[]> {
  return findAttachmentsByLesson(lessonId, organizationId);
}

export async function getSubjectLessons(
  subjectId: string,
  organizationId: string
): Promise<SubjectLesson[]> {
  return findSubjectLessonsBySubject(subjectId, organizationId);
}

export async function getLessonSubjects(
  lessonId: string,
  organizationId: string
): Promise<{ subjectId: string; subjectName: string }[]> {
  return findSubjectsByLesson(lessonId, organizationId);
}

export async function getLessonsStats(
  organizationId: string
): Promise<{ total: number; published: number }> {
  const [total, published] = await Promise.all([
    countLessonsByOrganization(organizationId),
    countPublishedLessons(organizationId),
  ]);
  return { total, published };
}
