// =============================================================================
// ATTENDANCE MODULE — TYPES
// =============================================================================

// ─── Status constants ────────────────────────────────────────────────────────

export const AttendanceSessionStatus = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  ARCHIVED: "ARCHIVED",
} as const;
export type AttendanceSessionStatus =
  (typeof AttendanceSessionStatus)[keyof typeof AttendanceSessionStatus];

export const AttendanceRecordStatus = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  LATE: "LATE",
  EXCUSED: "EXCUSED",
  REMOTE: "REMOTE",
} as const;
export type AttendanceRecordStatus =
  (typeof AttendanceRecordStatus)[keyof typeof AttendanceRecordStatus];

export const AttendanceJustificationStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type AttendanceJustificationStatus =
  (typeof AttendanceJustificationStatus)[keyof typeof AttendanceJustificationStatus];

// ─── Domain interfaces ────────────────────────────────────────────────────────

export interface AttendanceSession {
  id: string;
  organizationId: string;
  branchId: string | null;
  academicYearId: string;
  academicTermId: string | null;
  classGroupId: string;
  courseId: string;
  courseLevelId: string;
  subjectId: string;
  levelSubjectId: string;
  teacherId: string | null;
  classroomId: string | null;
  scheduleSlotId: string | null;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  title: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  // relations
  classGroup?: { id: string; name: string };
  subject?: { id: string; name: string };
  teacher?: { id: string; firstName: string; lastName: string } | null;
  classroom?: { id: string; name: string } | null;
  academicYear?: { id: string; name: string };
  academicTerm?: { id: string; name: string } | null;
  _count?: { records: number };
}

export interface AttendanceRecord {
  id: string;
  organizationId: string;
  attendanceSessionId: string;
  studentId: string;
  enrollmentId: string | null;
  status: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  minutesAttended: number;
  lateMinutes: number | null;
  markedByUserId: string | null;
  markedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // relations
  student?: { id: string; firstName: string; lastName: string; code: string | null };
  attendanceSession?: { id: string; sessionDate: Date; durationMinutes: number };
  justifications?: AttendanceJustification[];
}

export interface AttendanceJustification {
  id: string;
  organizationId: string;
  attendanceRecordId: string;
  studentId: string;
  reason: string;
  attachmentUrl: string | null;
  status: string;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // relations
  student?: { id: string; firstName: string; lastName: string };
  attendanceRecord?: {
    id: string;
    status: string;
    attendanceSession: {
      id: string;
      sessionDate: Date;
      subject: { name: string };
      classGroup: { name: string };
    };
  };
}

// ─── Calculation types ────────────────────────────────────────────────────────

export interface StudentSubjectAttendance {
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  subjectId: string;
  subjectName: string;
  totalCompletedSessionMinutes: number;
  totalMinutesAttended: number;
  totalExcusedMinutes: number;
  attendancePercentage: number;
  minimumAttendancePercentage: number | null;
  status: "OK" | "AT_RISK" | "BELOW_REQUIRED";
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  remoteCount: number;
  totalSessions: number;
}

// ─── List params ─────────────────────────────────────────────────────────────

export interface ListAttendanceSessionsParams {
  page: number;
  pageSize: number;
  search?: string;
  academicYearId?: string;
  academicTermId?: string;
  classGroupId?: string;
  subjectId?: string;
  teacherId?: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface ListAttendanceJustificationsParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  studentId?: string;
}

// ─── Portuguese labels ────────────────────────────────────────────────────────

export const ATTENDANCE_SESSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  OPEN: "Aberta",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  ARCHIVED: "Arquivada",
};

export const ATTENDANCE_RECORD_STATUS_LABELS: Record<string, string> = {
  PRESENT: "Presente",
  ABSENT: "Falta",
  LATE: "Atraso",
  EXCUSED: "Justificado",
  REMOTE: "Remoto",
};

export const ATTENDANCE_JUSTIFICATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada",
};

export const ATTENDANCE_RISK_STATUS_LABELS: Record<string, string> = {
  OK: "OK",
  AT_RISK: "Em Risco",
  BELOW_REQUIRED: "Abaixo do Mínimo",
};

export const ATTENDANCE_SESSION_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  OPEN: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

export const ATTENDANCE_RECORD_STATUS_COLORS: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-700",
  ABSENT: "bg-red-100 text-red-700",
  LATE: "bg-amber-100 text-amber-700",
  EXCUSED: "bg-blue-100 text-blue-700",
  REMOTE: "bg-purple-100 text-purple-700",
};

export const ATTENDANCE_JUSTIFICATION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};
