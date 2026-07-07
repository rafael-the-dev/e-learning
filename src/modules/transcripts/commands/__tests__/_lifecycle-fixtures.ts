import { seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// SHARED SEED HELPERS for the Phase-5 lifecycle command tests (not a test file).
// Seeds root + version + minimal snapshot child rows directly into the in-memory
// fake DB so Issue/Revoke can read them. Snapshot rows exist so the issue
// "snapshot rows exist" guard passes and immutability can be asserted.
// =============================================================================

export const ORG = "org-A";
export const OTHER_ORG = "org-B";

type Over = Record<string, unknown>;

export function seedRoot(db: FakeDb, over: Over = {}) {
  return seed(db, "academicTranscript", {
    id: "tr-1",
    organizationId: ORG,
    studentId: "s-1",
    enrollmentId: "enr-1",
    courseId: "c-1",
    transcriptType: "COURSE_TRANSCRIPT",
    scopeCourseLevelId: null,
    scopeAcademicTermId: null,
    scopeLevelSubjectId: null,
    transcriptNumber: null,
    status: "DRAFT",
    currentVersionId: null,
    needsRegeneration: false,
    staleReason: null,
    staleDetectedAt: null,
    issuedAt: null,
    issuedBy: null,
    deletedAt: null,
    ...over,
  });
}

export function seedVersion(db: FakeDb, over: Over = {}) {
  const id = (over.id as string) ?? "v-1";
  const version = seed(db, "academicTranscriptVersion", {
    id,
    organizationId: ORG,
    transcriptId: "tr-1",
    versionNumber: 1,
    snapshotDate: new Date("2026-06-15T00:00:00.000Z"),
    status: "DRAFT",
    reason: null,
    generatedBy: "u-1",
    issuedBy: null,
    issuedAt: null,
    supersededAt: null,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    checksum: `checksum-${id}`,
    studentSnapshot: "{}",
    courseSnapshot: "{}",
    ...over,
  });
  // one immutable snapshot row per grain so existence + immutability hold
  seed(db, "academicTranscriptLevel", {
    id: `lvl-${id}`, organizationId: ORG, transcriptVersionId: id, courseLevelId: "cl-1",
    levelName: "Nível 1", levelCode: "N1", levelOrder: 1, finalGrade: 15, status: "COMPLETED",
    completedAt: null, startedAt: null, earnedCredits: 10, workloadHours: 100,
  });
  seed(db, "academicTranscriptSubject", {
    id: `sub-${id}`, organizationId: ORG, transcriptVersionId: id, transcriptLevelId: `lvl-${id}`,
    levelSubjectId: "ls-1", subjectId: "s-a", subjectName: "Código", subjectCode: "COD", subjectOrder: 1,
    finalGrade: 14, status: "PASSED", minimumPassingGrade: 10, attendancePercentage: 82,
    minimumAttendancePercentage: 75, completedAt: null, credits: 4, workloadHours: 40,
    isRequired: true, recoveryStatus: null,
  });
  seed(db, "academicTranscriptAssessment", {
    id: `asm-${id}`, organizationId: ORG, transcriptSubjectId: `sub-${id}`,
    studentAssessmentResultId: "ar-1", assessmentComponentId: "ac-1", assessmentEventId: null,
    title: null, componentName: "Teste", componentType: "TEST", sourceType: "CONTINUOUS",
    grade: 14, maxGrade: 20, normalizedGrade: 14, status: "GRADED", gradedAt: null,
    isRecovery: false, recoveryAttemptNumber: null,
  });
  seed(db, "academicTranscriptAttendance", {
    id: `att-${id}`, organizationId: ORG, transcriptVersionId: id, transcriptSubjectId: `sub-${id}`,
    levelSubjectId: "ls-1", academicYearId: null, academicTermId: null, attendancePercentage: 82,
    totalSessions: 10, totalPresentMinutes: 480, totalScheduledMinutes: 600, status: "SUFFICIENT",
    policyId: "pol-1", policyName: "Padrão", minimumAttendancePercentage: 75, calculatedAt: null,
  });
  return version;
}

/** Snapshot-child store names, for immutability / no-delete assertions. */
export const SNAPSHOT_MODELS = [
  "academicTranscriptLevel",
  "academicTranscriptSubject",
  "academicTranscriptAssessment",
  "academicTranscriptAttendance",
] as const;
