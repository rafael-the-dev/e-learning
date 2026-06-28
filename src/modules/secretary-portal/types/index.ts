import type { Notification } from "@/modules/notifications/types";

// =============================================================================
// SECRETARY PORTAL — TYPES
// Operational workspace for the logged-in secretary: action queues for
// enrollments, payments/invoices, documents, student administration and
// upcoming deadlines. Distinct from the Executive Dashboard (strategic) — see
// docs/secretary-portal.md.
// =============================================================================

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export interface SecretaryPortalKpis {
  /** Enrollments still in DRAFT / PENDING_PAYMENT. */
  pendingEnrollments: number;
  /** Students with status ACTIVE. */
  activeStudents: number;
  /** Payments awaiting confirmation (status PENDING). */
  pendingPayments: number;
  /** Open invoices past their due date. */
  overdueInvoices: number;
  /** Uploaded documents awaiting review (status PENDING). Required-doc rules are not configured. */
  documentsToReview: number;
  /** Unread notifications for the current secretary user. */
  unreadNotifications: number;
  /** Class groups still being formed (status FORMING). */
  formingClassGroups: number;
  /** Derived: overdue invoices + pending enrollments + pending payments + documents to review. */
  urgentTasks: number;
}

// ─── Today overview ─────────────────────────────────────────────────────────────

export interface SecretaryTodayOverview {
  today: Date;
  pendingEnrollments: number;
  pendingPayments: number;
  overdueInvoices: number;
  documentsToReview: number;
  unreadNotifications: number;
}

// ─── Quick actions ──────────────────────────────────────────────────────────────

export type SecretaryQuickActionVariant = "default" | "warning" | "destructive" | "success";

export interface SecretaryQuickAction {
  href: string;
  label: string;
  /** Lucide icon name — kept as string to stay serializable across the server→client boundary. */
  iconName: string;
  variant?: SecretaryQuickActionVariant;
  /** Permission code required to perform the action. Omit to show unconditionally. */
  requiredPermission?: string;
}

// ─── Operational queues ─────────────────────────────────────────────────────────

export interface PendingEnrollmentRow {
  enrollmentId: string;
  studentName: string;
  enrollmentNumber: string | null;
  courseName: string;
  levelName: string | null;
  classGroupName: string | null;
  status: string;
  createdAt: Date;
}

export interface AttentionInvoiceRow {
  invoiceId: string;
  studentName: string;
  invoiceNumber: string;
  totalAmount: number;
  balanceAmount: number;
  status: string;
  dueDate: Date | null;
}

export interface DocumentReviewRow {
  documentId: string;
  studentId: string;
  studentName: string;
  documentType: string;
  daysPending: number;
}

export interface RecentStudentRow {
  studentId: string;
  studentName: string;
  contact: string | null;
  courseName: string | null;
  enrollmentStatus: string | null;
  createdAt: Date;
}

export interface SecretaryOperationalQueues {
  pendingEnrollments: PendingEnrollmentRow[];
  attentionInvoices: AttentionInvoiceRow[];
  documentsToReview: DocumentReviewRow[];
  recentStudents: RecentStudentRow[];
}

// ─── Financial attention ────────────────────────────────────────────────────────

export interface SecretaryFinancialAttention {
  overdueInvoiceCount: number;
  overdueAmount: number;
  pendingPaymentCount: number;
  pendingPaymentAmount: number;
  pendingRefundCount: number;
  pendingRefundAmount: number;
}

// ─── Student administration ─────────────────────────────────────────────────────

export interface SecretaryStudentAdministration {
  withoutPortalAccount: number;
  missingEmail: number;
  inactiveWithActiveEnrollment: number;
  enrollmentWithoutClassGroup: number;
  enrollmentWithoutLevel: number;
  /** Top-N actionable list: active students that still have no portal login. */
  studentsWithoutPortalAccount: { studentId: string; studentName: string; email: string | null }[];
}

// ─── Documents & compliance ─────────────────────────────────────────────────────

export interface SecretaryDocumentsCompliance {
  /** Required-document rules don't exist in the schema yet — surfaced honestly, never faked. */
  requiredDocsConfigured: boolean;
  pendingReviewCount: number;
  /** Expiry tracking doesn't exist on StudentDocument — always null until the schema supports it. */
  expiredCount: number | null;
}

// ─── Upcoming deadlines ─────────────────────────────────────────────────────────

export type SecretaryDeadlineType =
  | "INVOICE_DUE"
  | "CLASS_GROUP_START"
  | "CLASS_GROUP_END"
  | "ASSESSMENT"
  | "ACADEMIC_EVENT";

export const SECRETARY_DEADLINE_TYPE_LABELS: Record<SecretaryDeadlineType, string> = {
  INVOICE_DUE: "Factura a vencer",
  CLASS_GROUP_START: "Início de turma",
  CLASS_GROUP_END: "Fim de turma",
  ASSESSMENT: "Avaliação",
  ACADEMIC_EVENT: "Evento académico",
};

export interface SecretaryDeadline {
  id: string;
  type: SecretaryDeadlineType;
  title: string;
  date: Date;
  link: string;
}

// ─── Aggregate DTO ──────────────────────────────────────────────────────────────

export interface SecretaryPortalData {
  kpis: SecretaryPortalKpis;
  todayOverview: SecretaryTodayOverview;
  quickActions: SecretaryQuickAction[];
  queues: SecretaryOperationalQueues;
  financialAttention: SecretaryFinancialAttention;
  studentAdministration: SecretaryStudentAdministration;
  documentsCompliance: SecretaryDocumentsCompliance;
  notifications: Notification[];
  unreadNotificationCount: number;
  deadlines: SecretaryDeadline[];
}

// ─── Shared label lookups (English value → Portuguese presentation) ──────────────

export const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_PAYMENT: "Aguarda pagamento",
  ACTIVE: "Activa",
  COMPLETED: "Concluída",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PARTIALLY_PAID: "Parcialmente paga",
  PAID: "Paga",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
};

export const STUDENT_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  IDENTIFICATION: "Bilhete de Identidade",
  PASSPORT: "Passaporte",
  CERTIFICATE: "Certificado",
  CONTRACT: "Contrato",
  PAYMENT_PROOF: "Comprovativo de pagamento",
  PHOTO: "Fotografia",
  OTHER: "Outro",
};
