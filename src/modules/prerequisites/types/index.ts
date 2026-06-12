// =============================================================================
// PREREQUISITES, ELIGIBILITY & PROGRESSION — TYPES
// =============================================================================

// ─── Prerequisite Group ───────────────────────────────────────────────────────

export const PREREQUISITE_LOGIC_TYPE = {
  ALL: "ALL",
  ANY: "ANY",
} as const;
export type PrerequisiteLogicType = (typeof PREREQUISITE_LOGIC_TYPE)[keyof typeof PREREQUISITE_LOGIC_TYPE];

export const PREREQUISITE_LOGIC_TYPE_LABELS: Record<string, string> = {
  ALL: "Todos obrigatórios",
  ANY: "Pelo menos um",
};

export const PREREQUISITE_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;

export interface PrerequisiteGroup {
  id: string;
  organizationId: string;
  levelSubjectId: string;
  name: string | null;
  description: string | null;
  logicType: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // joined
  levelSubjectName?: string | null;
  itemsCount?: number;
}

// ─── Prerequisite Item ────────────────────────────────────────────────────────

export const PREREQUISITE_REQUIREMENT_TYPE = {
  MUST_PASS: "MUST_PASS",
  MUST_COMPLETE: "MUST_COMPLETE",
  MINIMUM_GRADE: "MINIMUM_GRADE",
} as const;
export type PrerequisiteRequirementType = (typeof PREREQUISITE_REQUIREMENT_TYPE)[keyof typeof PREREQUISITE_REQUIREMENT_TYPE];

export const PREREQUISITE_REQUIREMENT_TYPE_LABELS: Record<string, string> = {
  MUST_PASS: "Aprovado",
  MUST_COMPLETE: "Concluído",
  MINIMUM_GRADE: "Nota Mínima",
};

export interface PrerequisiteItem {
  id: string;
  organizationId: string;
  prerequisiteGroupId: string;
  prerequisiteLevelSubjectId: string;
  requirementType: string;
  minimumRequiredGrade: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // joined
  prerequisiteSubjectName?: string | null;
  prerequisiteCourseLevelName?: string | null;
}

// ─── Prerequisite Waiver ──────────────────────────────────────────────────────

export const PREREQUISITE_WAIVER_STATUS = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
} as const;

export const PREREQUISITE_WAIVER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  REVOKED: "Revogado",
};

export interface PrerequisiteWaiver {
  id: string;
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  prerequisiteGroupId: string | null;
  prerequisiteItemId: string | null;
  reason: string;
  grantedBy: string;
  grantedAt: Date;
  status: string;
  revokedBy: string | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  // joined
  studentName?: string | null;
  levelSubjectName?: string | null;
  grantedByName?: string | null;
}

// ─── Subject Eligibility ──────────────────────────────────────────────────────

export const SUBJECT_ELIGIBILITY_STATUS = {
  ELIGIBLE: "ELIGIBLE",
  BLOCKED: "BLOCKED",
  PENDING_PREREQUISITE: "PENDING_PREREQUISITE",
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PENDING_MANUAL_APPROVAL: "PENDING_MANUAL_APPROVAL",
  ALREADY_COMPLETED: "ALREADY_COMPLETED",
} as const;
export type SubjectEligibilityStatus = (typeof SUBJECT_ELIGIBILITY_STATUS)[keyof typeof SUBJECT_ELIGIBILITY_STATUS];

export const SUBJECT_ELIGIBILITY_STATUS_LABELS: Record<string, string> = {
  ELIGIBLE: "Elegível",
  BLOCKED: "Bloqueado",
  PENDING_PREREQUISITE: "Pré-requisito em falta",
  PENDING_PAYMENT: "Pagamento pendente",
  PENDING_MANUAL_APPROVAL: "Aprovação manual necessária",
  ALREADY_COMPLETED: "Já concluído",
};

export interface SubjectEligibilityResult {
  status: SubjectEligibilityStatus;
  levelSubjectId: string;
  missingPrerequisites: MissingPrerequisite[];
  isEligible: boolean;
}

export interface MissingPrerequisite {
  groupId: string;
  groupName: string | null;
  logicType: string;
  items: MissingPrerequisiteItem[];
}

export interface MissingPrerequisiteItem {
  itemId: string;
  levelSubjectId: string;
  subjectName: string;
  requirementType: string;
  minimumRequiredGrade: number | null;
  currentStatus: string | null;
  currentGrade: number | null;
}

// ─── Student Level Progress ───────────────────────────────────────────────────

export const STUDENT_LEVEL_PROGRESS_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  PASSED: "PASSED",
  FAILED: "FAILED",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
  ELIGIBLE_TO_PROGRESS: "ELIGIBLE_TO_PROGRESS",
  PROMOTED: "PROMOTED",
  PROMOTED_WITH_PENDING_SUBJECTS: "PROMOTED_WITH_PENDING_SUBJECTS",
  BLOCKED: "BLOCKED",
  COMPLETED: "COMPLETED",
} as const;
export type StudentLevelProgressStatus = (typeof STUDENT_LEVEL_PROGRESS_STATUS)[keyof typeof STUDENT_LEVEL_PROGRESS_STATUS];

export const STUDENT_LEVEL_PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Por Iniciar",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  RECOVERY_REQUIRED: "Recuperação",
  ELIGIBLE_TO_PROGRESS: "Elegível para Progressão",
  PROMOTED: "Promovido",
  PROMOTED_WITH_PENDING_SUBJECTS: "Promovido c/ Pendências",
  BLOCKED: "Bloqueado",
  COMPLETED: "Concluído",
};

export interface StudentLevelProgress {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  courseLevelId: string;
  finalGrade: number | null;
  earnedCredits: number | null;
  status: string;
  progressReason: string | null;
  completedAt: Date | null;
  calculatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // joined
  courseLevelName?: string | null;
  courseLevelOrder?: number | null;
}

// ─── Student Course Progress ──────────────────────────────────────────────────

export const STUDENT_COURSE_PROGRESS_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  PASSED: "PASSED",
  FAILED: "FAILED",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
  COMPLETED: "COMPLETED",
} as const;
export type StudentCourseProgressStatus = (typeof STUDENT_COURSE_PROGRESS_STATUS)[keyof typeof STUDENT_COURSE_PROGRESS_STATUS];

export const STUDENT_COURSE_PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Por Iniciar",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  RECOVERY_REQUIRED: "Recuperação",
  COMPLETED: "Concluído",
};

export interface StudentCourseProgress {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  finalGrade: number | null;
  earnedCredits: number | null;
  status: string;
  progressReason: string | null;
  completedAt: Date | null;
  calculatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // joined
  courseName?: string | null;
}

// ─── Level Progression Policy ─────────────────────────────────────────────────

export const PROGRESSION_MODE = {
  STRICT: "STRICT",
  CONDITIONAL: "CONDITIONAL",
  CREDIT_BASED: "CREDIT_BASED",
  MANUAL_APPROVAL: "MANUAL_APPROVAL",
} as const;
export type ProgressionMode = (typeof PROGRESSION_MODE)[keyof typeof PROGRESSION_MODE];

export const PROGRESSION_MODE_LABELS: Record<string, string> = {
  STRICT: "Estrito",
  CONDITIONAL: "Condicional",
  CREDIT_BASED: "Por Créditos",
  MANUAL_APPROVAL: "Aprovação Manual",
};

export interface LevelProgressionPolicy {
  id: string;
  organizationId: string;
  courseId: string;
  fromLevelId: string;
  toLevelId: string;
  name: string;
  description: string | null;
  progressionMode: string;
  minimumLevelAverage: number | null;
  maxFailedRequiredSubjects: number | null;
  maxPendingSubjects: number | null;
  requiredCredits: number | null;
  requireFinancialClearance: boolean;
  requireManualApproval: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // joined
  courseName?: string | null;
  fromLevelName?: string | null;
  toLevelName?: string | null;
}

// ─── Level Progression Request ────────────────────────────────────────────────

export const PROGRESSION_REQUEST_DECISION = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export const PROGRESSION_REQUEST_DECISION_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
};

export interface LevelProgressionRequest {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  policyId: string | null;
  fromLevelId: string;
  toLevelId: string;
  decision: string;
  reason: string | null;
  reviewNotes: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  // joined
  studentName?: string | null;
  fromLevelName?: string | null;
  toLevelName?: string | null;
  courseName?: string | null;
}

// ─── Progression Outcome ──────────────────────────────────────────────────────

export const PROGRESSION_OUTCOME = {
  ELIGIBLE_TO_PROGRESS: "ELIGIBLE_TO_PROGRESS",
  BLOCKED: "BLOCKED",
  REQUIRES_MANUAL_APPROVAL: "REQUIRES_MANUAL_APPROVAL",
  PROMOTED: "PROMOTED",
  PROMOTED_WITH_PENDING_SUBJECTS: "PROMOTED_WITH_PENDING_SUBJECTS",
} as const;
export type ProgressionOutcome = (typeof PROGRESSION_OUTCOME)[keyof typeof PROGRESSION_OUTCOME];

export interface LevelProgressionEvaluationResult {
  outcome: ProgressionOutcome;
  fromLevelId: string;
  toLevelId: string | null;
  reason: string;
  failedRequiredSubjectsCount: number;
  pendingSubjectsCount: number;
  earnedCredits: number;
  requiredCredits: number | null;
  progressionRequestId?: string;
}

// ─── List params ──────────────────────────────────────────────────────────────

export interface ListPrerequisiteGroupsParams {
  levelSubjectId?: string;
  status?: string;
}

export interface ListPrerequisiteWaiversParams {
  studentId?: string;
  enrollmentId?: string;
  levelSubjectId?: string;
  status?: string;
}

export interface ListProgressionPoliciesParams {
  courseId?: string;
  fromLevelId?: string;
  status?: string;
}

export interface ListProgressionRequestsParams {
  enrollmentId?: string;
  studentId?: string;
  decision?: string;
  page?: number;
  pageSize?: number;
}
