import type { Notification } from "@/modules/notifications/types";

// =============================================================================
// STUDENT PORTAL — TYPES
// Self-service workspace for the logged-in student. Distinct from Student 360
// (the administrative view) — see docs/student-portal.md.
// =============================================================================

export type StudentPortalBlockedReason = "NOT_LINKED" | "INACTIVE";

export interface StudentPortalKpis {
  /** Average attendance % across all the student's marked sessions. null when no records. */
  averageAttendance: number | null;
  /** Average of the student's PUBLISHED grades (normalized to %). null when none published. */
  overallAverage: number | null;
  approvedSubjects: number;
  pendingSubjects: number;
  upcomingAssessments: number;
  pendingInvoices: number;
  outstandingBalance: number;
  unreadNotifications: number;
}

export interface StudentAcademicOverview {
  studentName: string;
  studentNumber: string | null;
  enrollmentStatus: string | null;
  courseName: string | null;
  currentLevelName: string | null;
  classGroupName: string | null;
  academicStatusLabel: string;
  /** Passed subjects / total tracked subjects, as a percentage. null when no subjects tracked. */
  courseProgressPercent: number | null;
  hasActiveEnrollment: boolean;
  blockedLevelCount: number;
  recoveryRequiredCount: number;
}

export interface StudentUpcomingClass {
  id: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  subjectName: string;
  teacherName: string | null;
  classroomName: string | null;
  status: string;
}

export interface StudentAssessmentRow {
  assessmentId: string;
  title: string;
  subjectName: string;
  assessmentDate: Date;
  /** Assessment lifecycle status (SCHEDULED | OPEN | GRADED). */
  status: string;
  isPublished: boolean;
  /** The student's own score — exposed ONLY when the assessment's results are published. */
  score: number | null;
  maxScore: number;
}

export interface StudentGradeRow {
  id: string;
  subjectName: string;
  assessmentTitle: string;
  score: number;
  maxScore: number;
  percentage: number;
  status: string;
  publishedAt: Date | null;
}

export interface StudentAttendanceKpis {
  attendancePercentage: number | null;
  presentCount: number;
  absentCount: number;
  /** Absences marked EXCUSED (justified). */
  justifiedCount: number;
  /** Absences marked ABSENT (unjustified). */
  unjustifiedCount: number;
}

export interface StudentAttendanceMonthlyPoint {
  /** YYYY-MM */
  month: string;
  attendancePercentage: number;
}

export interface StudentAttendanceSessionRow {
  id: string;
  sessionDate: Date;
  subjectName: string;
  status: string;
}

export interface StudentPaymentsSummary {
  totalDue: number;
  overdueAmount: number;
  nextDueDate: Date | null;
  walletBalance: number;
}

export interface StudentInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
}

export interface StudentPaymentRow {
  paymentId: string;
  paymentNumber: string;
  paymentDate: Date;
  totalAmount: number;
  status: string;
}

export interface StudentDocumentRow {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  status: string;
  createdAt: Date;
}

export interface StudentPortalData {
  studentId: string;
  studentName: string;
  overview: StudentAcademicOverview;
  kpis: StudentPortalKpis;
  upcomingClasses: StudentUpcomingClass[];
  assessments: StudentAssessmentRow[];
  grades: StudentGradeRow[];
  attendanceKpis: StudentAttendanceKpis;
  attendanceTrend: StudentAttendanceMonthlyPoint[];
  attendanceSessions: StudentAttendanceSessionRow[];
  paymentsSummary: StudentPaymentsSummary;
  invoices: StudentInvoiceRow[];
  payments: StudentPaymentRow[];
  notifications: Notification[];
  unreadNotificationCount: number;
  documents: StudentDocumentRow[];
}

// =============================================================================
// DISPLAY LABELS — Portuguese (pt-PT). Values stay in the English domain enum.
// =============================================================================

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  PRESENT: "Presente",
  ABSENT: "Ausente",
  LATE: "Atrasado",
  EXCUSED: "Justificada",
  REMOTE: "Remoto",
};

export const ASSESSMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  OPEN: "A decorrer",
  GRADED: "Avaliada",
  CANCELLED: "Cancelada",
  ARCHIVED: "Arquivada",
};

export const STUDENT_GRADE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  SUBMITTED: "Submetida",
  GRADED: "Avaliada",
  MISSING: "Em falta",
  EXCUSED: "Dispensada",
  INVALIDATED: "Anulada",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PARTIALLY_PAID: "Parcialmente Paga",
  PAID: "Paga",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
};

export const STUDENT_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  IDENTIFICATION: "Identificação",
  PASSPORT: "Passaporte",
  CERTIFICATE: "Certificado",
  CONTRACT: "Contrato",
  PAYMENT_PROOF: "Comprovativo de Pagamento",
  PHOTO: "Fotografia",
  OTHER: "Outro",
};

export const STUDENT_DOCUMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  VERIFIED: "Verificado",
  REJECTED: "Rejeitado",
};
