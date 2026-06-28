import type {
  StudentUpcomingClass,
  StudentAssessmentRow,
  StudentGradeRow,
  StudentAttendanceKpis,
  StudentAttendanceMonthlyPoint,
  StudentAttendanceSessionRow,
  StudentPaymentsSummary,
  StudentInvoiceRow,
  StudentPaymentRow,
  StudentDocumentRow,
} from "@/modules/student-portal/types";
import type { Notification } from "@/modules/notifications/types";

// =============================================================================
// GUARDIAN PORTAL — TYPES
// The responsible-party (parent/guardian) view across one or more linked
// students. Distinct from Student 360 (administrative) and the Student Portal
// (the student's own self-service). Every section is gated by the per-link
// visibility flags carried on the GuardianStudent row. See docs/guardian-portal.md.
// =============================================================================

export type GuardianRelationshipType = "FATHER" | "MOTHER" | "GUARDIAN" | "SPONSOR" | "OTHER";

/** Domain value (English) → display label (português de Portugal). */
export const GUARDIAN_RELATIONSHIP_LABELS: Record<string, string> = {
  FATHER: "Pai",
  MOTHER: "Mãe",
  GUARDIAN: "Encarregado de Educação",
  SPONSOR: "Patrocinador",
  OTHER: "Outro",
};

/** Per-link visibility flags — the contract enforced on every Guardian Portal read. */
export interface GuardianLinkPermissions {
  canViewAcademic: boolean;
  canViewAttendance: boolean;
  canViewFinance: boolean;
  canViewDocuments: boolean;
  canReceiveNotifications: boolean;
}

/** A validated guardian→student link (the trusted source of selectedStudentId). */
export interface GuardianStudentLink extends GuardianLinkPermissions {
  /** GuardianStudent.id */
  linkId: string;
  studentId: string;
  relationshipType: string;
  isPrimary: boolean;
}

/** One entry in the student selector at the top of the portal. */
export interface GuardianStudentOption {
  studentId: string;
  studentName: string;
  studentNumber: string | null;
  courseName: string | null;
  classGroupName: string | null;
  /** StudentStatus (PENDING | ACTIVE | SUSPENDED | COMPLETED | DROPPED). */
  status: string;
  relationshipType: string;
  isPrimary: boolean;
}

/** Why the portal can render nothing for this guardian. */
export type GuardianPortalBlockedReason = "NO_LINKED_STUDENTS";

export interface GuardianAcademicOverview {
  studentName: string;
  studentNumber: string | null;
  enrollmentStatus: string | null;
  studentStatus: string;
  courseName: string | null;
  currentLevelName: string | null;
  classGroupName: string | null;
  /** null when canViewAcademic is false. */
  academicStatusLabel: string | null;
  /** null when canViewAcademic is false. */
  overallAverage: number | null;
  /** null when canViewAttendance is false. */
  attendancePercentage: number | null;
}

/**
 * KPI values. A null value means "this metric is hidden by the per-link
 * permissions" — the renderer must NOT show a card for a null metric.
 */
export interface GuardianPortalKpis {
  // Academic (canViewAcademic)
  overallAverage: number | null;
  approvedSubjects: number | null;
  pendingSubjects: number | null;
  upcomingAssessments: number | null;
  // Attendance (canViewAttendance)
  averageAttendance: number | null;
  absences: number | null;
  // Finance (canViewFinance)
  pendingInvoices: number | null;
  outstandingBalance: number | null;
  // Notifications (canReceiveNotifications)
  unreadNotifications: number | null;
}

/** Everything the portal renders for the SELECTED student. Sections are null when forbidden. */
export interface GuardianSelectedStudentData {
  studentId: string;
  studentName: string;
  permissions: GuardianLinkPermissions;
  relationshipType: string;
  isPrimary: boolean;
  overview: GuardianAcademicOverview;
  kpis: GuardianPortalKpis;
  /** Gated by canViewAcademic (assessments) / canViewAttendance (classes). Empty when both off. */
  upcomingClasses: StudentUpcomingClass[];
  /** null when canViewAcademic is false. */
  assessments: StudentAssessmentRow[] | null;
  /** null when canViewAcademic is false. Published grades only. */
  grades: StudentGradeRow[] | null;
  /** null when canViewAttendance is false. */
  attendanceKpis: StudentAttendanceKpis | null;
  attendanceTrend: StudentAttendanceMonthlyPoint[];
  attendanceSessions: StudentAttendanceSessionRow[];
  /** null when canViewFinance is false. */
  paymentsSummary: StudentPaymentsSummary | null;
  invoices: StudentInvoiceRow[];
  payments: StudentPaymentRow[];
  /** null when canViewDocuments is false. */
  documents: StudentDocumentRow[] | null;
}

export interface GuardianPortalData {
  guardianName: string;
  students: GuardianStudentOption[];
  /** The validated, server-resolved selected student (never trusted from the URL). */
  selectedStudentId: string | null;
  selected: GuardianSelectedStudentData | null;
  /** Guardian-addressed notifications (always scoped to the guardian's own user). */
  notifications: Notification[];
  unreadNotificationCount: number;
}
