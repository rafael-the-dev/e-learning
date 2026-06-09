// =============================================================================
// ENROLLMENTS MODULE — TYPES
// =============================================================================

export interface Enrollment {
  id: string;
  organizationId: string;
  branchId: string | null;
  studentId: string;
  courseId: string;
  courseLevelId: string | null;
  classGroupId: string | null;
  academicYearId: string;
  academicTermId: string | null;
  enrollmentNumber: string | null;
  enrollmentDate: Date;
  startDate: Date | null;
  expectedEndDate: Date | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  // joined fields
  studentName?: string;
  studentCode?: string | null;
  courseName?: string;
  courseLevelName?: string | null;
  classGroupName?: string | null;
  branchName?: string | null;
  academicYearName?: string;
  academicTermName?: string | null;
}

export interface EnrollmentStatusHistory {
  id: string;
  enrollmentId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedBy: string | null;
  changedAt: Date;
  changedByName?: string | null;
}

export const ENROLLMENT_STATUS = {
  DRAFT: "DRAFT",
  PENDING_PAYMENT: "PENDING_PAYMENT",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUS)[keyof typeof ENROLLMENT_STATUS];

export const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_PAYMENT: "Aguarda Pagamento",
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

// Valid transitions: fromStatus -> allowed toStatuses
export const ENROLLMENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PENDING_PAYMENT", "ACTIVE"],
  PENDING_PAYMENT: ["ACTIVE"],
  ACTIVE: ["SUSPENDED", "COMPLETED", "CANCELLED"],
  SUSPENDED: ["ACTIVE"],
  COMPLETED: [],
  CANCELLED: [],
};
