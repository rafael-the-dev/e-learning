// =============================================================================
// ACADEMIC TRANSCRIPT ENGINE — SNAPSHOT BUILDER CONTRACT (Phase 3)
// -----------------------------------------------------------------------------
// In-memory input/output types for the Transcript Snapshot Builder. These are
// NOT persisted rows (Phase 2 owns those) and NOT client DTOs — they are the
// deterministic, checksum-ready payload the future GenerateTranscriptSnapshot
// command maps onto version + child rows.
//
// The builder COPIES upstream academic values verbatim and FREEZES identity
// fields; it never calculates outcomes. All numeric grades/percentages are the
// Decimal→number surface produced by the source repository.
// =============================================================================

import type { TranscriptDetailLevel, TranscriptType } from "@/modules/transcripts/constants";

// ─── Input ───────────────────────────────────────────────────────────────────

export interface BuildTranscriptSnapshotInput {
  /** Tenant scope. Passed from `ServiceContext` by the future command — the
   *  builder never derives or authorizes it, only forwards it to source reads. */
  organizationId: string;
  studentId: string;
  /** Required for enrollment-scoped types (COURSE_TRANSCRIPT, CERTIFICATE_SUPPORT,
   *  LEVEL_TRANSCRIPT, SUBJECT_REPORT). */
  enrollmentId?: string | null;
  courseId?: string | null;
  transcriptType: TranscriptType | string;
  /** Type-specific discriminator: `courseLevelId` (LEVEL_TRANSCRIPT),
   *  `levelSubjectId` (SUBJECT_REPORT), `academicTermId` (TERM_REPORT). */
  scopeRef?: string | null;
  detailLevel: TranscriptDetailLevel;
  snapshotDate: Date;
  /** Descriptive only; recorded in payload metadata, excluded from the checksum. */
  generatedBy?: string | null;
}

// ─── Output ──────────────────────────────────────────────────────────────────

/** Frozen student identity (§6). Never re-read live after the snapshot. */
export interface TranscriptStudentSnapshot {
  studentId: string;
  studentCode: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: Date | null;
  idType: string | null;
  idNumber: string | null;
  status: string;
}

/** Frozen course identity (§6). */
export interface TranscriptCourseSnapshot {
  courseId: string;
  courseName: string | null;
  courseCode: string | null;
  categoryId: string | null;
  category: string | null;
  totalHours: number | null;
  enrollmentId: string;
  enrollmentNumber: string | null;
  academicYearId: string | null;
  academicTermId: string | null;
  enrollmentStatus: string;
}

/** Copied `StudentCourseProgress` outcome (verbatim, never recomputed). */
export interface TranscriptCourseProgressSnapshot {
  finalGrade: number | null;
  earnedCredits: number | null;
  status: string;
  completedAt: Date | null;
  calculatedAt: Date | null;
}

export interface TranscriptAttendanceSnapshot {
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
}

export interface TranscriptAssessmentSnapshot {
  studentAssessmentResultId: string;
  assessmentComponentId: string | null;
  assessmentEventId: string | null;
  title: string | null;
  componentName: string | null;
  componentType: string | null;
  sourceType: string;
  grade: number;
  maxGrade: number;
  normalizedGrade: number;
  status: string;
  gradedAt: Date | null;
  isRecovery: boolean;
  recoveryAttemptNumber: number | null;
}

export interface TranscriptSubjectSnapshot {
  levelSubjectId: string | null;
  subjectId: string | null;
  subjectName: string | null;
  subjectCode: string | null;
  subjectOrder: number | null;
  finalGrade: number | null;
  status: string;
  minimumPassingGrade: number | null;
  attendancePercentage: number | null;
  minimumAttendancePercentage: number | null;
  completedAt: Date | null;
  /** Identity credits copied UNCONDITIONALLY from `LevelSubject.credits` (§5). */
  earnedCredits: number | null;
  workloadHours: number | null;
  isRequired: boolean;
  recoveryStatus: string | null;
  /** Present only for DETAILED snapshots; omitted (undefined) for SUMMARY. */
  assessments?: TranscriptAssessmentSnapshot[];
  /** Subject-grain attendance summary, or null when none exists. */
  attendance: TranscriptAttendanceSnapshot | null;
}

export interface TranscriptLevelSnapshot {
  courseLevelId: string | null;
  levelName: string | null;
  levelCode: string | null;
  levelOrder: number | null;
  finalGrade: number | null;
  status: string;
  completedAt: Date | null;
  startedAt: Date | null;
  earnedCredits: number | null;
  workloadHours: number | null;
  subjects: TranscriptSubjectSnapshot[];
}

/** The resolved scope discriminators for this snapshot (checksum-relevant). */
export interface TranscriptSnapshotScope {
  enrollmentId: string | null;
  courseId: string | null;
  courseLevelId: string | null;
  academicTermId: string | null;
  levelSubjectId: string | null;
}

/** Descriptive envelope. EXCLUDED from the canonical checksum content. */
export interface TranscriptSnapshotMetadata {
  detailLevel: TranscriptDetailLevel;
  generatedBy: string | null;
  builderVersion: string;
  levelCount: number;
  subjectCount: number;
  assessmentCount: number;
  periodAttendanceCount: number;
}

export interface TranscriptSnapshotPayload {
  transcriptType: TranscriptType;
  scope: TranscriptSnapshotScope;
  snapshotDate: Date;
  studentSnapshot: TranscriptStudentSnapshot;
  courseSnapshot: TranscriptCourseSnapshot | null;
  courseProgressSnapshot: TranscriptCourseProgressSnapshot | null;
  levels: TranscriptLevelSnapshot[];
  periodAttendances: TranscriptAttendanceSnapshot[];
  metadata: TranscriptSnapshotMetadata;
}
