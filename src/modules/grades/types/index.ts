// =============================================================================
// GRADE ENGINE — TYPES
// Unified with Assessment Engine: AssessmentPolicy / AssessmentComponent are
// the canonical models. This module re-exports them and extends with grade-
// specific constants for the calculation service and result model.
// =============================================================================

// Re-export canonical policy / component types from Assessment Engine
export type { AssessmentPolicy, AssessmentComponent } from "@/modules/assessments/types";
export {
  ASSESSMENT_COMPONENT_TYPE,
  ASSESSMENT_COMPONENT_TYPE_LABELS,
  ASSESSMENT_COMPONENT_STATUS,
  ASSESSMENT_POLICY_STATUS,
  ASSESSMENT_POLICY_STATUS_LABELS,
  ASSESSMENT_CALCULATION_METHOD,
  ASSESSMENT_ROUNDING_METHOD,
} from "@/modules/assessments/types";

// ─── Calculation method labels (used by grade UI forms) ───────────────────────

export const GRADE_CALCULATION_METHOD = {
  WEIGHTED_AVERAGE: "WEIGHTED_AVERAGE",
  SIMPLE_AVERAGE: "SIMPLE_AVERAGE",
} as const;
export type GradeCalculationMethod = (typeof GRADE_CALCULATION_METHOD)[keyof typeof GRADE_CALCULATION_METHOD];

export const GRADE_ROUNDING_METHOD = {
  NONE: "NONE",
  ROUND: "ROUND",
  FLOOR: "FLOOR",
  CEIL: "CEIL",
} as const;
export type GradeRoundingMethod = (typeof GRADE_ROUNDING_METHOD)[keyof typeof GRADE_ROUNDING_METHOD];

export const GRADE_CALCULATION_METHOD_LABELS: Record<string, string> = {
  WEIGHTED_AVERAGE: "Média Ponderada",
  SIMPLE_AVERAGE: "Média Simples",
};

export const GRADE_ROUNDING_METHOD_LABELS: Record<string, string> = {
  NONE: "Sem Arredondamento",
  ROUND: "Arredondamento Normal",
  FLOOR: "Arredondamento para Baixo",
  CEIL: "Arredondamento para Cima",
};

// ─── Source type ──────────────────────────────────────────────────────────────

export const SOURCE_TYPE = {
  CONTINUOUS: "CONTINUOUS",
  SCHEDULED_EVENT: "SCHEDULED_EVENT",
  RECOVERY: "RECOVERY",
} as const;
export type SourceType = (typeof SOURCE_TYPE)[keyof typeof SOURCE_TYPE];

// ─── Student Assessment Result ────────────────────────────────────────────────

export const STUDENT_RESULT_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  GRADED: "GRADED",
  CANCELLED: "CANCELLED",
} as const;
export type StudentResultStatus = (typeof STUDENT_RESULT_STATUS)[keyof typeof STUDENT_RESULT_STATUS];

export interface StudentAssessmentResult {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  levelSubjectId: string;
  subjectId: string;
  assessmentComponentId: string;
  assessmentEventId: string | null;
  sourceType: string;
  grade: number;
  maxGrade: number;
  normalizedGrade: number;
  notes: string | null;
  status: string;
  gradedBy: string | null;
  gradedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // joined
  studentFirstName?: string | null;
  studentLastName?: string | null;
  studentCode?: string | null;
  studentName?: string | null;
  componentName?: string | null;
  componentType?: string | null;
  subjectName?: string | null;
  gradedByName?: string | null;
}

// ─── Grade Change Log ─────────────────────────────────────────────────────────

export const GRADE_CHANGE_SOURCE = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  CANCEL: "CANCEL",
  INVALIDATE: "INVALIDATE",
  RECOVERY: "RECOVERY",
  BULK: "BULK",
  // Examination Engine integration (Phase 11B / ADR-014): a canonical grade write
  // originating from an official PUBLISHED exam result. Additive — all existing
  // sources are preserved and unchanged.
  EXAMINATION: "EXAMINATION",
} as const;
export type GradeChangeSource = (typeof GRADE_CHANGE_SOURCE)[keyof typeof GRADE_CHANGE_SOURCE];

export interface GradeChangeLog {
  id: string;
  organizationId: string;
  studentAssessmentResultId: string;
  assessmentEventId: string | null;
  oldGrade: number | null;
  newGrade: number;
  oldNormalizedGrade: number | null;
  newNormalizedGrade: number | null;
  oldStatus: string | null;
  newStatus: string;
  source: string | null;
  reason: string;
  changedBy: string;
  changedAt: Date;
}

// ─── List params ──────────────────────────────────────────────────────────────

export interface ListStudentAssessmentResultsParams {
  page?: number;
  pageSize?: number;
  enrollmentId?: string;
  studentId?: string;
  subjectId?: string;
  levelSubjectId?: string;
  assessmentComponentId?: string;
  status?: string;
}

// ─── Display labels ───────────────────────────────────────────────────────────

export const STUDENT_RESULT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetido",
  GRADED: "Classificado",
  CANCELLED: "Cancelado",
};

export const GRADE_COMPONENT_TYPE_LABELS: Record<string, string> = {
  TEST: "Teste",
  QUIZ: "Questionário",
  EXAM: "Exame",
  ASSIGNMENT: "Trabalho",
  PROJECT: "Projeto",
  ORAL: "Oral",
  PRACTICAL: "Prático",
  PARTICIPATION: "Participação",
  FINAL_EXAM: "Exame Final",
  RECOVERY: "Recuperação",
  OTHER: "Outro",
};

export const GRADE_COMPONENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

// Keep legacy aliases used by existing UI components
export const SUBJECT_POLICY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const GRADE_COMPONENT_TYPE = {
  TEST: "TEST",
  QUIZ: "QUIZ",
  EXAM: "EXAM",
  ASSIGNMENT: "ASSIGNMENT",
  PROJECT: "PROJECT",
  ORAL: "ORAL",
  PRACTICAL: "PRACTICAL",
  PARTICIPATION: "PARTICIPATION",
  FINAL_EXAM: "FINAL_EXAM",
  RECOVERY: "RECOVERY",
  OTHER: "OTHER",
} as const;

// Legacy type aliases pointing to canonical types
export type SubjectAssessmentPolicy = import("@/modules/assessments/types").AssessmentPolicy;
export type SubjectAssessmentComponent = import("@/modules/assessments/types").AssessmentComponent;
