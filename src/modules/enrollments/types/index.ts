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
  // computed fields
  financialStatus?: string | null;
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

export const FINANCIAL_STATUS_LABELS: Record<string, string> = {
  NO_INVOICE: "Sem Fatura",
  PENDING: "Pendente",
  PARTIALLY_PAID: "Parcialmente Pago",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
};

// =============================================================================
// DASHBOARD TYPES
// =============================================================================

export interface EnrollmentWatchlistItem {
  enrollmentId: string;
  enrollmentNumber: string | null;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  courseName: string;
  courseLevelName: string | null;
  classGroupName: string | null;
  issue: string;
  severity: "low" | "medium" | "high" | "critical";
  recommendedAction: string;
  createdAt: Date;
}

export interface EnrollmentMonthlyTrend {
  month: string;
  total: number;
}

export interface EnrollmentCourseDistribution {
  courseId: string;
  courseName: string;
  activeCount: number;
}

export interface EnrollmentBranchDistribution {
  branchId: string | null;
  branchName: string;
  count: number;
}

export interface EnrollmentDashboardKPIs {
  total: number;
  active: number;
  pendingPayment: number;
  draft: number;
  suspended: number;
  completed: number;
  cancelled: number;
  awaitingClassAssignment: number;
  overdueAccounts: number;
  studentsWithWalletCredit: number;
  activeWithoutInvoice: number;
}

export interface EnrollmentInsight {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  count?: number;
  linkHref?: string;
  linkLabel?: string;
}
