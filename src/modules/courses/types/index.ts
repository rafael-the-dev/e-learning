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
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface LevelSubject {
  id: string;
  organizationId: string;
  courseId: string;
  courseLevelId: string;
  subjectId: string;
  order: number;
  workloadHours: number | null;
  theoryHours: number | null;
  practicalHours: number | null;
  minimumPassingGrade: string | null;
  minimumAttendancePercentage: string | null;
  maxAbsences: number | null;
  isRequired: boolean;
  allowRetakeExam: boolean;
  allowCompensation: boolean;
  certificateRequired: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  subjectName?: string;
  subjectCode?: string | null;
  courseLevelName?: string;
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

export const LEVEL_SUBJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const COURSE_CATEGORY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  ARCHIVED: "Arquivada",
};
