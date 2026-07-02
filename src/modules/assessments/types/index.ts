// =============================================================================
// ASSESSMENT ENGINE — TYPES
// =============================================================================

// ─── Assessment Policy ────────────────────────────────────────────────────────

export const ASSESSMENT_CALCULATION_METHOD = {
  WEIGHTED_AVERAGE: "WEIGHTED_AVERAGE",
  SIMPLE_AVERAGE: "SIMPLE_AVERAGE",
} as const;
export type AssessmentCalculationMethod = (typeof ASSESSMENT_CALCULATION_METHOD)[keyof typeof ASSESSMENT_CALCULATION_METHOD];

export const ASSESSMENT_ROUNDING_METHOD = {
  NONE: "NONE",
  NEAREST_INTEGER: "NEAREST_INTEGER",
  ONE_DECIMAL: "ONE_DECIMAL",
  TWO_DECIMALS: "TWO_DECIMALS",
} as const;
export type AssessmentRoundingMethod = (typeof ASSESSMENT_ROUNDING_METHOD)[keyof typeof ASSESSMENT_ROUNDING_METHOD];

export const ASSESSMENT_POLICY_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type AssessmentPolicyStatus = (typeof ASSESSMENT_POLICY_STATUS)[keyof typeof ASSESSMENT_POLICY_STATUS];

export interface AssessmentPolicy {
  id: string;
  organizationId: string;
  levelSubjectId: string;
  name: string;
  description: string | null;
  calculationMethod: string;
  roundingMethod: string;
  minimumPassingGrade: number;
  allowRetake: boolean;
  maxRetakes: number;
  allowRecovery: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  levelSubjectName?: string | null;
  subjectName?: string | null;
  courseLevelName?: string | null;
  componentsCount?: number;
}

// ─── Assessment Component ─────────────────────────────────────────────────────

export const ASSESSMENT_COMPONENT_TYPE = {
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
export type AssessmentComponentType = (typeof ASSESSMENT_COMPONENT_TYPE)[keyof typeof ASSESSMENT_COMPONENT_TYPE];

export const ASSESSMENT_COMPONENT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type AssessmentComponentStatus = (typeof ASSESSMENT_COMPONENT_STATUS)[keyof typeof ASSESSMENT_COMPONENT_STATUS];

export interface AssessmentComponent {
  id: string;
  organizationId: string;
  assessmentPolicyId: string;
  name: string;
  componentType: string;
  weight: number;
  maxGrade: number;
  order: number;
  isRequired: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ─── Assessment Period ────────────────────────────────────────────────────────

export const ASSESSMENT_PERIOD_STATUS = {
  UPCOMING: "UPCOMING",
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type AssessmentPeriodStatus = (typeof ASSESSMENT_PERIOD_STATUS)[keyof typeof ASSESSMENT_PERIOD_STATUS];

export interface AssessmentPeriod {
  id: string;
  organizationId: string;
  academicYearId: string;
  academicTermId: string | null;
  name: string;
  code: string;
  startDate: Date;
  endDate: Date;
  order: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  academicYearName?: string | null;
  academicTermName?: string | null;
}

// ─── Assessment ───────────────────────────────────────────────────────────────

export const ASSESSMENT_STATUS = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  OPEN: "OPEN",
  GRADED: "GRADED",
  CANCELLED: "CANCELLED",
  ARCHIVED: "ARCHIVED",
} as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUS)[keyof typeof ASSESSMENT_STATUS];

export interface Assessment {
  id: string;
  organizationId: string;
  assessmentPolicyId: string;
  assessmentComponentId: string;
  assessmentPeriodId: string;
  academicYearId: string;
  academicTermId: string | null;
  classGroupId: string;
  courseId: string;
  courseLevelId: string;
  levelSubjectId: string;
  subjectId: string;
  teacherId: string | null;
  title: string;
  description: string | null;
  assessmentDate: Date;
  maxScore: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  // joined
  assessmentPolicyName?: string | null;
  componentName?: string | null;
  componentType?: string | null;
  periodName?: string | null;
  periodCode?: string | null;
  classGroupName?: string | null;
  teacherName?: string | null;
  academicYearName?: string | null;
  academicTermName?: string | null;
  resultsCount?: number;
  gradedCount?: number;
}

// ─── Assessment Result ────────────────────────────────────────────────────────

export const ASSESSMENT_RESULT_STATUS = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  GRADED: "GRADED",
  MISSING: "MISSING",
  EXCUSED: "EXCUSED",
  INVALIDATED: "INVALIDATED",
} as const;
export type AssessmentResultStatus = (typeof ASSESSMENT_RESULT_STATUS)[keyof typeof ASSESSMENT_RESULT_STATUS];

export interface AssessmentResult {
  id: string;
  organizationId: string;
  assessmentId: string;
  studentId: string;
  enrollmentId: string | null;
  score: number | null;
  normalizedScore: number | null;
  feedback: string | null;
  status: string;
  gradedByUserId: string | null;
  gradedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // joined
  studentFirstName?: string | null;
  studentLastName?: string | null;
  studentCode?: string | null;
  studentName?: string | null;
  gradedByName?: string | null;
}

// ─── Assessment Publication ───────────────────────────────────────────────────

export const ASSESSMENT_PUBLICATION_STATUS = {
  DRAFT: "DRAFT",
  READY: "READY",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type AssessmentPublicationStatus = (typeof ASSESSMENT_PUBLICATION_STATUS)[keyof typeof ASSESSMENT_PUBLICATION_STATUS];

export interface AssessmentPublication {
  id: string;
  organizationId: string;
  assessmentId: string;
  publicationStatus: string;
  publishedAt: Date | null;
  publishedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Student Subject Progress ─────────────────────────────────────────────────

export const STUDENT_SUBJECT_PROGRESS_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  PASSED: "PASSED",
  FAILED: "FAILED",
  // Failed the normal evaluation but recovery is allowed and not yet resolved.
  // NON-TERMINAL: no completedAt, keeps level/course unresolved. See the Recovery
  // Lifecycle in docs/grade-engine.md.
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
  INCOMPLETE: "INCOMPLETE",
  BLOCKED: "BLOCKED",
} as const;
export type StudentSubjectProgressStatus = (typeof STUDENT_SUBJECT_PROGRESS_STATUS)[keyof typeof STUDENT_SUBJECT_PROGRESS_STATUS];

export interface StudentSubjectProgress {
  id: string;
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  finalGrade: number | null;
  attendancePercentage: number | null;
  status: string;
  progressReason: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // joined
  studentName?: string | null;
  subjectName?: string | null;
  courseLevelName?: string | null;
  minimumPassingGrade?: number | null;
  minimumAttendancePercentage?: number | null;
}

// ─── Assessment Retake ────────────────────────────────────────────────────────

export const ASSESSMENT_RETAKE_STATUS = {
  REQUESTED: "REQUESTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  GRADED: "GRADED",
} as const;
export type AssessmentRetakeStatus = (typeof ASSESSMENT_RETAKE_STATUS)[keyof typeof ASSESSMENT_RETAKE_STATUS];

export interface AssessmentRetake {
  id: string;
  organizationId: string;
  originalAssessmentResultId: string;
  assessmentId: string;
  studentId: string;
  enrollmentId: string | null;
  attemptNumber: number;
  score: number | null;
  normalizedScore: number | null;
  status: string;
  requestedAt: Date;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  gradedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // joined
  studentFirstName?: string | null;
  studentLastName?: string | null;
  assessmentTitle?: string | null;
}

// ─── List params ──────────────────────────────────────────────────────────────

export interface ListAssessmentPoliciesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  levelSubjectId?: string;
  status?: string;
}

export interface ListAssessmentPeriodsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  academicYearId?: string;
  academicTermId?: string;
  status?: string;
}

export interface ListAssessmentsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  classGroupId?: string;
  assessmentPeriodId?: string;
  levelSubjectId?: string;
  status?: string;
  academicYearId?: string;
  teacherId?: string;
}

export interface ListAssessmentResultsParams {
  page?: number;
  pageSize?: number;
  assessmentId?: string;
  studentId?: string;
  status?: string;
}

export interface ListStudentSubjectProgressParams {
  page?: number;
  pageSize?: number;
  search?: string;
  studentId?: string;
  enrollmentId?: string;
  levelSubjectId?: string;
  status?: string;
}

export interface ListAssessmentRetakesParams {
  page?: number;
  pageSize?: number;
  assessmentId?: string;
  studentId?: string;
  status?: string;
}

// ─── Display labels ───────────────────────────────────────────────────────────

export const ASSESSMENT_POLICY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const ASSESSMENT_PERIOD_STATUS_LABELS: Record<string, string> = {
  UPCOMING: "Futuro",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const ASSESSMENT_COMPONENT_TYPE_LABELS: Record<string, string> = {
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

export const ASSESSMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendado",
  OPEN: "Aberto",
  GRADED: "Classificado",
  CANCELLED: "Cancelado",
  ARCHIVED: "Arquivado",
};

export const ASSESSMENT_RESULT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  SUBMITTED: "Submetido",
  GRADED: "Classificado",
  MISSING: "Em Falta",
  EXCUSED: "Justificado",
  INVALIDATED: "Invalidado",
};

export const ASSESSMENT_PUBLICATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  READY: "Pronto",
  PUBLISHED: "Publicado",
  ARCHIVED: "Arquivado",
};

export const STUDENT_SUBJECT_PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Não Iniciado",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  RECOVERY_REQUIRED: "Recuperação",
  INCOMPLETE: "Incompleto",
  BLOCKED: "Bloqueado",
};

export const ASSESSMENT_RETAKE_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Solicitado",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  GRADED: "Classificado",
};

export const ASSESSMENT_CALCULATION_METHOD_LABELS: Record<string, string> = {
  WEIGHTED_AVERAGE: "Média Ponderada",
  SIMPLE_AVERAGE: "Média Simples",
};

export const ASSESSMENT_ROUNDING_METHOD_LABELS: Record<string, string> = {
  NONE: "Sem Arredondamento",
  NEAREST_INTEGER: "Inteiro Mais Próximo",
  ONE_DECIMAL: "Uma Casa Decimal",
  TWO_DECIMALS: "Duas Casas Decimais",
};
