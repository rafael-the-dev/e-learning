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

// Persisted per-enrolment+subject read-model status (Attendance Engine Phase 3).
// AT_RISK is reserved in the schema comment but NOT emitted by this phase — Phase 3
// uses the 3-value set the brief specifies. See docs/attendance-engine.md.
export const StudentSubjectAttendanceSummaryStatus = {
  NOT_STARTED: "NOT_STARTED",
  SUFFICIENT: "SUFFICIENT",
  BELOW_REQUIRED: "BELOW_REQUIRED",
} as const;
export type StudentSubjectAttendanceSummaryStatus =
  (typeof StudentSubjectAttendanceSummaryStatus)[keyof typeof StudentSubjectAttendanceSummaryStatus];

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

/**
 * @deprecated Legacy on-read calculation DTO produced by
 * `attendance-calculator.service.ts`. It recomputes attendance from raw records
 * with semantics that DIVERGE from the persisted `StudentSubjectAttendanceSummary`
 * (ignores `countExcusedAsPresent`, ignores approved justifications, maps empty →
 * `0/OK` instead of `null/NOT_STARTED`). Retired from all live read paths — use
 * `SubjectAttendanceView` sourced from the persisted summary instead. Kept only
 * for reference until the legacy calculator is deleted.
 */
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

// ─── Read-model view (source of truth = StudentSubjectAttendanceSummary) ──────

/** Presentation status for a subject's attendance, derived PURELY from the
 *  persisted summary percentage + the LevelSubject threshold. `AT_RISK` is a
 *  display band (percentage within `atRiskBuffer` of the minimum); it never
 *  contradicts the academic summary status (BELOW_REQUIRED ⇔ below minimum). */
export type SubjectAttendanceDisplayStatus =
  | "NOT_STARTED"
  | "OK"
  | "AT_RISK"
  | "BELOW_REQUIRED";

/**
 * The single read shape for subject attendance across reports, Student 360 and
 * risk evaluation. Numbers are read verbatim from the persisted
 * `StudentSubjectAttendanceSummary` (never recomputed from raw records).
 * When no summary row exists yet, `attendancePercentage` is `null`, `status` is
 * `NOT_STARTED` and `needsRecalculation` is `true` (repair via the recalc command).
 */
export interface SubjectAttendanceView {
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  subjectId: string;
  subjectName: string;
  totalSessions: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  totalAbsentMinutes: number;
  totalLateMinutes: number;
  totalExcusedMinutes: number;
  attendancePercentage: number | null;
  minimumAttendancePercentage: number | null;
  status: SubjectAttendanceDisplayStatus;
  /** true when no persisted summary exists yet (stale/missing read-model). */
  needsRecalculation: boolean;
  calculatedAt: Date | null;
}

/** One student's row in the class-group attendance report grid. */
export interface ClassGroupAttendanceReportEntry {
  studentId: string;
  studentName: string;
  studentCode: string | null;
  subjects: SubjectAttendanceView[];
}

/** Aggregate session counts for a student, read from the persisted period
 *  year-rollups (`academicTermId = null`) — the reporting source that persists
 *  per-status counts. Used for display KPI cards, not academic decisions. */
export interface StudentAttendanceCounts {
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  remoteCount: number;
}

/** The single canonical student-level attendance read model (H5). Extends the
 *  per-status counts with the OVERALL attendance percentage — the minute-weighted
 *  pooled ratio (Σ totalPresentMinutes / Σ totalScheduledMinutes) from the persisted
 *  year-rollups, i.e. the exact rule the calculation engine defines (COMPLETED-only
 *  sessions, justified/excused neutral-and-monotonic, empty → null, never 0). Every
 *  surface consumes THIS percentage so the same student always shows the same number. */
export interface StudentAttendanceSummary extends StudentAttendanceCounts {
  attendancePercentage: number | null;
  /** Present-equivalent sessions (present + late + remote) — a count view, distinct
   *  from the minute-weighted percentage. */
  attendedSessions: number;
}

// ─── Summary engine types (Attendance Engine Phase 3) ─────────────────────────

/** The interpretation knobs actually used by the calculation engine, after the
 *  policy-resolution order (LevelSubject override → org default → fallback). */
export interface EffectiveAttendancePolicy {
  countExcusedAsPresent: boolean;
  countRemoteAsPresent: boolean;
  countLateAsPartial: boolean;
  atRiskBufferPercentage: number;
  allowJustification: boolean;
  requireJustificationApproval: boolean;
  /** Phase 5 GATE: when true, attendance feeds the grade cascade (can produce
   *  INCOMPLETE). Default false → reporting-only / behaviour-neutral. */
  enforceAttendanceForProgress: boolean;
  /** Where the effective policy came from — for auditability/diagnostics. */
  source: "LEVEL_SUBJECT" | "ORG_DEFAULT" | "FALLBACK";
  /** The AttendancePolicy id when source !== "FALLBACK"; null otherwise. */
  policyId: string | null;
}

/** Deterministic fallback used when no LevelSubject override and no org default
 *  policy exists. Calculation must never fail for lack of a policy. */
export const DEFAULT_ATTENDANCE_POLICY = {
  countExcusedAsPresent: false,
  countRemoteAsPresent: true,
  countLateAsPartial: true,
  atRiskBufferPercentage: 5,
  allowJustification: true,
  requireJustificationApproval: true,
  // Fallback is SAFE: when no policy exists, attendance never gates academics.
  enforceAttendanceForProgress: false,
} as const;

/** One counted (COMPLETED) session's contribution to the denominator. */
export interface AttendanceCalcSessionInput {
  id: string;
  durationMinutes: number;
}

/** One student mark, joined to whether it carries an approved justification. */
export interface AttendanceCalcRecordInput {
  attendanceSessionId: string;
  status: string;
  minutesAttended: number;
  lateMinutes: number | null;
  hasApprovedJustification: boolean;
}

/** Pure output of the calculation engine. Only the minute buckets + totals +
 *  percentage + status are persisted; the *Count fields are diagnostic (used by
 *  tests and parity checks) and are NOT stored. */
export interface AttendanceSummaryComputation {
  totalSessions: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  totalAbsentMinutes: number;
  totalLateMinutes: number;
  totalExcusedMinutes: number;
  attendancePercentage: number | null;
  status: StudentSubjectAttendanceSummaryStatus;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  remoteCount: number;
}

/** The persisted summary row shape (read-model). */
export interface StudentSubjectAttendanceSummary {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  levelSubjectId: string;
  attendancePolicyId: string | null;
  totalSessions: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  totalAbsentMinutes: number;
  totalLateMinutes: number;
  totalExcusedMinutes: number;
  attendancePercentage: number | null;
  status: string;
  calculatedAt: Date | null;
}

/** Result returned by the summary service after a recalculation. */
export interface AttendanceSummaryRecalcResult {
  enrollmentId: string;
  levelSubjectId: string;
  changed: boolean;
  previous: { attendancePercentage: number | null; status: string } | null;
  next: { attendancePercentage: number | null; status: string };
}

// ─── Period summary engine types (Attendance Engine Phase 4) ──────────────────

// Reporting-only status for StudentPeriodAttendanceSummary. NOT an academic
// source — the subject summary remains the academic truth. "Not started" is
// represented by a null attendancePercentage (the model has no NOT_STARTED).
export const StudentPeriodAttendanceSummaryStatus = {
  GOOD: "GOOD",
  AT_RISK: "AT_RISK",
  BELOW_REQUIRED: "BELOW_REQUIRED",
} as const;
export type StudentPeriodAttendanceSummaryStatus =
  (typeof StudentPeriodAttendanceSummaryStatus)[keyof typeof StudentPeriodAttendanceSummaryStatus];

/** One counted record for the period engine, already joined to its session's
 *  duration + levelSubject and the effective policy/threshold for that subject.
 *  Policy is resolved PER levelSubject (sessions may span subjects with overrides). */
export interface PeriodCalcRecord {
  levelSubjectId: string;
  durationMinutes: number;
  status: string;
  minutesAttended: number;
  lateMinutes: number | null;
  hasApprovedJustification: boolean;
  policy: EffectiveAttendancePolicy;
  /** The record's levelSubject minimumAttendancePercentage (null = no threshold). */
  minimumAttendancePercentage: number | null;
}

/** Pure output of the period calculation engine. All fields (incl. counts) are
 *  persisted on StudentPeriodAttendanceSummary. */
export interface StudentPeriodAttendanceSummaryComputation {
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  remoteCount: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  attendancePercentage: number | null;
  status: StudentPeriodAttendanceSummaryStatus;
  /** The weighted baseline used for the status decision (null → no threshold). */
  baseline: number | null;
}

/** The persisted period-summary row shape (read-model). */
export interface StudentPeriodAttendanceSummary {
  id: string;
  organizationId: string;
  academicYearId: string;
  academicTermId: string | null;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  courseLevelId: string | null;
  classGroupId: string | null;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  remoteCount: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  attendancePercentage: number | null;
  status: string;
  calculatedAt: Date | null;
}

/** Result of a period recalculation. */
export interface PeriodSummaryRecalcResult {
  enrollmentId: string;
  academicYearId: string;
  academicTermId: string | null;
  changed: boolean;
  dryRun: boolean;
  previous: { attendancePercentage: number | null; status: string } | null;
  next: { attendancePercentage: number | null; status: string };
}

// ─── Reporting DTOs (read-only, never persisted) ──────────────────────────────

export interface AttendancePeriodOverviewDto {
  totalStudents: number;
  averageAttendancePercentage: number | null;
  belowRequiredCount: number;
  atRiskCount: number;
  goodCount: number;
  totalSessions: number;
  totalAbsences: number;
  totalLate: number;
  totalExcused: number;
  totalRemote: number;
}

export interface StudentAttendanceDashboardDto {
  currentAcademicYearId: string | null;
  currentAcademicTermId: string | null;
  overallAttendancePercentage: number | null;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  remoteCount: number;
  subjectsBelowMinimum: number;
  periodStatus: string | null;
  lastAbsenceDate: Date | null;
  pendingJustifications: number;
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

/** Labels for the read-model `SubjectAttendanceView.status`. */
export const SUBJECT_ATTENDANCE_VIEW_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Não Iniciada",
  OK: "OK",
  AT_RISK: "Em Risco",
  BELOW_REQUIRED: "Abaixo do Mínimo",
};

export const STUDENT_SUBJECT_ATTENDANCE_SUMMARY_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Não Iniciada",
  SUFFICIENT: "Suficiente",
  AT_RISK: "Em Risco",
  BELOW_REQUIRED: "Abaixo do Mínimo",
};

export const STUDENT_PERIOD_ATTENDANCE_SUMMARY_STATUS_LABELS: Record<string, string> = {
  GOOD: "Bom",
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
