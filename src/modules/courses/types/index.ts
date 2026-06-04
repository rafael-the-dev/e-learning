// =============================================================================
// COURSES MODULE TYPES
// =============================================================================

export interface CourseCategory {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface CourseCategoryWithCount extends CourseCategory {
  coursesCount: number;
}

export interface Course {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  totalHours: number | null;
  price: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseWithCounts extends Course {
  levelsCount: number;
  subjectsCount: number;
}

export interface CourseLevel {
  id: string;
  courseId: string;
  name: string;
  code: string | null;
  description: string | null;
  order: number;
  totalHours: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  subjectsCount?: number;
  courseName?: string;
}

export interface Subject {
  id: string;
  courseLevelId: string;
  courseId: string;
  name: string;
  code: string | null;
  description: string | null;
  hoursRequired: number | null;
  order: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  levelName?: string;
  courseName?: string;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export const COURSE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const COURSE_LEVEL_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const SUBJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const COURSE_CATEGORY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  ARCHIVED: "Arquivada",
};
