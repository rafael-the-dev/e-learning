// =============================================================================
// ACADEMIC TRANSCRIPT ENGINE — INTERNAL TYPES (Phase 2)
// -----------------------------------------------------------------------------
// Repository/domain-level record and parameter types ONLY. These are NOT UI
// DTOs and are NOT part of any client contract yet (§10 / §17 of the spec).
//
// Phase 3 adds the Snapshot Builder contract in ./snapshot-payload, re-exported
// here so `@/modules/transcripts/types` remains the single type entry point.
//
// Conventions (mirroring the existing repository layer):
//   • Prisma `Decimal @db.Decimal(5,2)` columns are surfaced as `number | null`
//     (or `number` where the source column is non-null). Decimal(5,2) is well
//     within IEEE-754 range, so the copy is lossless.
//   • Status vocabularies stay as raw upstream strings — the engine never
//     re-derives them (§6). They are typed `string`, documented inline.
//   • JSON snapshot columns (`studentSnapshot`, `courseSnapshot`, event
//     `metadata`) stay as raw strings at this layer; parsing belongs to the
//     builder/DTO layer later.
// =============================================================================

// ─── Root aggregate ──────────────────────────────────────────────────────────

export interface TranscriptRootRecord {
  id: string;
  organizationId: string;
  studentId: string;
  enrollmentId: string | null;
  courseId: string | null;
  transcriptType: string;
  scopeCourseLevelId: string | null;
  scopeAcademicTermId: string | null;
  scopeLevelSubjectId: string | null;
  transcriptNumber: string | null;
  status: string; // DRAFT | ISSUED | SUPERSEDED | REVOKED
  currentVersionId: string | null;
  needsRegeneration: boolean;
  staleReason: string | null;
  staleDetectedAt: Date | null;
  issuedAt: Date | null;
  issuedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TranscriptRootDetailRecord extends TranscriptRootRecord {
  currentVersion: TranscriptVersionRecord | null;
}

// ─── Version ──────────────────────────────────────────────────────────────────

export interface TranscriptVersionRecord {
  id: string;
  organizationId: string;
  transcriptId: string;
  versionNumber: number;
  snapshotDate: Date;
  status: string; // DRAFT | ISSUED | SUPERSEDED | REVOKED
  reason: string | null;
  generatedBy: string | null;
  issuedBy: string | null;
  issuedAt: Date | null;
  supersededAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
  checksum: string | null;
  studentSnapshot: string; // raw JSON
  courseSnapshot: string | null; // raw JSON
  createdAt: Date;
}

// ─── Snapshot children (immutable) ─────────────────────────────────────────────

export interface TranscriptLevelSnapshotRecord {
  id: string;
  organizationId: string;
  transcriptVersionId: string;
  courseLevelId: string | null;
  levelName: string;
  levelCode: string | null;
  levelOrder: number;
  finalGrade: number | null;
  status: string;
  completedAt: Date | null;
  startedAt: Date | null;
  earnedCredits: number | null;
  workloadHours: number | null;
  createdAt: Date;
}

export interface TranscriptSubjectSnapshotRecord {
  id: string;
  organizationId: string;
  transcriptVersionId: string;
  transcriptLevelId: string;
  levelSubjectId: string | null;
  subjectId: string | null;
  subjectName: string;
  subjectCode: string | null;
  subjectOrder: number;
  finalGrade: number | null;
  status: string;
  minimumPassingGrade: number | null;
  attendancePercentage: number | null;
  minimumAttendancePercentage: number | null;
  completedAt: Date | null;
  credits: number | null;
  workloadHours: number | null;
  isRequired: boolean;
  recoveryStatus: string | null;
  createdAt: Date;
}

export interface TranscriptAssessmentSnapshotRecord {
  id: string;
  organizationId: string;
  transcriptSubjectId: string;
  studentAssessmentResultId: string | null;
  assessmentComponentId: string | null;
  assessmentEventId: string | null;
  title: string | null;
  componentName: string;
  componentType: string | null;
  sourceType: string;
  grade: number;
  maxGrade: number;
  normalizedGrade: number;
  status: string;
  gradedAt: Date | null;
  isRecovery: boolean;
  recoveryAttemptNumber: number | null;
  createdAt: Date;
}

export interface TranscriptAttendanceSnapshotRecord {
  id: string;
  organizationId: string;
  transcriptVersionId: string;
  transcriptSubjectId: string | null;
  levelSubjectId: string | null;
  academicYearId: string | null;
  academicTermId: string | null;
  attendancePercentage: number | null;
  totalSessions: number;
  totalPresentMinutes: number;
  totalScheduledMinutes: number;
  status: string;
  policyId: string | null;
  policyName: string | null;
  minimumAttendancePercentage: number | null;
  calculatedAt: Date | null;
  createdAt: Date;
}

/** Deterministic, fully-assembled read of one version's snapshot children. */
export interface TranscriptSnapshotSubjectNode extends TranscriptSubjectSnapshotRecord {
  assessments: TranscriptAssessmentSnapshotRecord[];
  attendances: TranscriptAttendanceSnapshotRecord[];
}

export interface TranscriptSnapshotLevelNode extends TranscriptLevelSnapshotRecord {
  subjects: TranscriptSnapshotSubjectNode[];
}

export interface TranscriptSnapshotTree {
  levels: TranscriptSnapshotLevelNode[];
  /** Version/period-level attendance rows (transcriptSubjectId === null). */
  attendances: TranscriptAttendanceSnapshotRecord[];
}

// ─── Event / Export / Request ──────────────────────────────────────────────────

export interface TranscriptEventRecord {
  id: string;
  organizationId: string;
  transcriptId: string;
  transcriptVersionId: string | null;
  eventType: string;
  previousStatus: string | null;
  newStatus: string | null;
  reason: string | null;
  actorId: string | null;
  metadata: string | null; // raw JSON
  createdAt: Date;
}

export interface TranscriptExportRecord {
  id: string;
  organizationId: string;
  transcriptVersionId: string;
  exportType: string; // PDF | EXCEL | API | MINISTRY
  fileUrl: string | null;
  fileChecksum: string | null;
  status: string; // PENDING | READY | FAILED
  exportedBy: string | null;
  exportedAt: Date | null;
  createdAt: Date;
}

export interface TranscriptRequestRecord {
  id: string;
  organizationId: string;
  studentId: string;
  enrollmentId: string | null;
  courseId: string | null;
  requestedBy: string;
  requestType: string;
  status: string; // PENDING | APPROVED | REJECTED | FULFILLED | CANCELLED
  reason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  fulfilledTranscriptVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// SOURCE (Academic Core) READ RECORDS — for the future Snapshot Builder.
// Read-only projections of the authoritative upstream models. Identity fields
// (names/codes/thresholds) are included so the builder can FREEZE them; no value
// is calculated or transformed beyond a Decimal→number surface conversion.
// =============================================================================

export interface SourceStudentRecord {
  id: string;
  organizationId: string;
  code: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  dateOfBirth: Date | null;
  idType: string | null;
  idNumber: string | null;
  status: string;
}

export interface SourceEnrollmentRecord {
  id: string;
  organizationId: string;
  studentId: string;
  courseId: string;
  courseLevelId: string | null;
  academicYearId: string;
  academicTermId: string | null;
  enrollmentNumber: string | null;
  status: string;
  course: {
    id: string;
    name: string;
    code: string | null;
    totalHours: number | null;
    category: {
      id: string;
      name: string;
    } | null;
  } | null;
}

export interface SourceCourseProgressRecord {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  finalGrade: number | null;
  earnedCredits: number | null;
  status: string;
  completedAt: Date | null;
  calculatedAt: Date | null;
}

export interface SourceLevelProgressRecord {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  courseLevelId: string;
  finalGrade: number | null;
  earnedCredits: number | null;
  status: string;
  completedAt: Date | null;
  calculatedAt: Date | null;
  createdAt: Date;
  courseLevel: {
    id: string;
    name: string;
    code: string | null;
    order: number;
    totalHours: number | null;
  } | null;
}

export interface SourceSubjectProgressRecord {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  levelSubjectId: string;
  finalGrade: number | null;
  attendancePercentage: number | null;
  status: string;
  completedAt: Date | null;
  levelSubject: {
    id: string;
    courseLevelId: string;
    order: number;
    minimumPassingGrade: number | null;
    minimumAttendancePercentage: number | null;
    credits: number | null;
    workloadHours: number | null;
    isRequired: boolean;
    attendancePolicyId: string | null;
    subject: {
      id: string;
      name: string;
      code: string | null;
    } | null;
  } | null;
}

export interface SourceAssessmentResultRecord {
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
  status: string;
  gradedAt: Date | null;
  assessmentComponent: {
    id: string;
    name: string;
    componentType: string;
    order: number;
  } | null;
  assessmentEvent: {
    id: string;
    title: string;
  } | null;
}

export interface SourceSubjectAttendanceSummaryRecord {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  levelSubjectId: string;
  attendancePolicyId: string | null;
  totalSessions: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  attendancePercentage: number | null;
  status: string;
  calculatedAt: Date | null;
  attendancePolicy: {
    id: string;
    name: string;
  } | null;
  levelSubject: {
    minimumAttendancePercentage: number | null;
  } | null;
}

export interface SourcePeriodAttendanceSummaryRecord {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  courseLevelId: string | null;
  academicYearId: string;
  academicTermId: string | null;
  totalSessions: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  attendancePercentage: number | null;
  status: string;
  calculatedAt: Date | null;
}

// Re-export the Phase-3 Snapshot Builder contract (input + payload types).
export * from "./snapshot-payload";

/** Aggregate of everything the Snapshot Builder loads for one transcript scope. */
export interface TranscriptSourceData {
  student: SourceStudentRecord | null;
  enrollment: SourceEnrollmentRecord | null;
  courseProgress: SourceCourseProgressRecord | null;
  levelProgress: SourceLevelProgressRecord[];
  subjectProgress: SourceSubjectProgressRecord[];
  assessmentResults: SourceAssessmentResultRecord[];
  subjectAttendanceSummaries: SourceSubjectAttendanceSummaryRecord[];
  periodAttendanceSummaries: SourcePeriodAttendanceSummaryRecord[];
}
