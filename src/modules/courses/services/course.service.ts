import {
  findCoursesByOrganization,
  findCourseByIdInOrganization,
  findCourseWithCounts,
  countCoursesByStatus,
  type ListCoursesParams,
} from "@/modules/courses/repositories/course.repository";
import {
  findLevelsByCourse,
  findLevelByIdInOrganization,
} from "@/modules/courses/repositories/level.repository";
import {
  findSubjectsByCourse,
  findSubjectsByLevel,
  findSubjectByIdInOrganization,
} from "@/modules/courses/repositories/subject.repository";
import {
  findCategoriesByOrganization,
  findActiveCategoriesByOrganization,
  findCategoryByIdInOrganization,
  findCategoriesWithCountsByOrganization,
} from "@/modules/courses/repositories/category.repository";
import { NotFoundError } from "@/shared/lib/command";

// =============================================================================
// COURSES SERVICE
// Read-only wrappers — authorization happens in Commands.
// =============================================================================

export async function getCoursesByOrganization(
  organizationId: string,
  params: ListCoursesParams
) {
  return findCoursesByOrganization(organizationId, params);
}

export async function getCourseById(id: string, organizationId: string) {
  const course = await findCourseByIdInOrganization(id, organizationId);
  if (!course) throw new NotFoundError("Curso", id);
  return course;
}

export async function getCourseWithCounts(id: string, organizationId: string) {
  const course = await findCourseWithCounts(id, organizationId);
  if (!course) throw new NotFoundError("Curso", id);
  return course;
}

export async function getCourseStats(organizationId: string) {
  return countCoursesByStatus(organizationId);
}

export async function getLevelsByCourse(
  courseId: string,
  organizationId: string
) {
  return findLevelsByCourse(courseId, organizationId);
}

export async function getLevelById(id: string, organizationId: string) {
  const level = await findLevelByIdInOrganization(id, organizationId);
  if (!level) throw new NotFoundError("Nível", id);
  return level;
}

export async function getSubjectsByCourse(
  courseId: string,
  organizationId: string
) {
  return findSubjectsByCourse(courseId, organizationId);
}

export async function getSubjectsByLevel(
  levelId: string,
  organizationId: string
) {
  return findSubjectsByLevel(levelId, organizationId);
}

export async function getSubjectById(id: string, organizationId: string) {
  const subject = await findSubjectByIdInOrganization(id, organizationId);
  if (!subject) throw new NotFoundError("Disciplina", id);
  return subject;
}

// ─── Category reads ───────────────────────────────────────────────────────────

export async function getCategoriesByOrganization(organizationId: string) {
  return findCategoriesByOrganization(organizationId);
}

export async function getActiveCategoriesByOrganization(organizationId: string) {
  return findActiveCategoriesByOrganization(organizationId);
}

export async function getCategoryById(id: string, organizationId: string) {
  const category = await findCategoryByIdInOrganization(id, organizationId);
  if (!category) throw new NotFoundError("Categoria", id);
  return category;
}

export async function getCategoriesWithCounts(organizationId: string) {
  return findCategoriesWithCountsByOrganization(organizationId);
}
