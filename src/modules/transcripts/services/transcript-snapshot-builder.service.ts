import type { PrismaClientOrTx } from "@/server/db";
import { NotFoundError, NotImplementedError, ValidationError } from "@/shared/lib/command";
import {
  ASSESSMENT_RESULT_STATUS_GRADED,
  ASSESSMENT_SOURCE_TYPE_RECOVERY,
  SNAPSHOT_BUILDER_VERSION,
  TranscriptDetailLevel,
  TranscriptType,
} from "@/modules/transcripts/constants";
import {
  findAssessmentResultsForTranscript,
  findCourseProgressForTranscript,
  findEnrollmentForTranscript,
  findLevelProgressForTranscript,
  findPeriodAttendanceSummariesForTranscript,
  findStudentForTranscript,
  findSubjectAttendanceSummariesForTranscript,
  findSubjectProgressForTranscript,
} from "@/modules/transcripts/repositories/academic-transcript-source.repository";
import type {
  BuildTranscriptSnapshotInput,
  TranscriptAssessmentSnapshot,
  TranscriptAttendanceSnapshot,
  TranscriptLevelSnapshot,
  TranscriptSnapshotPayload,
  TranscriptSnapshotScope,
  TranscriptSubjectSnapshot,
} from "@/modules/transcripts/types";

// =============================================================================
// TRANSCRIPT SNAPSHOT BUILDER (Phase 3) — PURE, READ-ONLY, IN-MEMORY
// -----------------------------------------------------------------------------
// Reads official Academic Core outputs through the Phase-2 source repository and
// assembles a deterministic `TranscriptSnapshotPayload`. It COPIES upstream
// academic values verbatim and FREEZES identity fields — it never averages,
// re-normalizes, decides pass/fail/completion, filters by outcome, computes
// credits from status, or interprets attendance/recovery/eligibility.
//
// It performs NO writes, emits NO events, writes NO audit, allocates NO transcript
// numbers, and creates NO transcript/version rows. It may throw typed domain
// errors (NotFoundError / ValidationError / NotImplementedError) but never
// silently produces an incomplete snapshot for the requested type.
//
// Supported in Phase 3:
//   • COURSE_TRANSCRIPT      — one enrollment/course (requires enrollmentId)
//   • CERTIFICATE_SUPPORT    — same assembly as COURSE_TRANSCRIPT; exposes facts
//                              only (eligibility is decided later, not here)
//   • LEVEL_TRANSCRIPT       — COURSE_TRANSCRIPT scoped to scopeRef=courseLevelId
//   • SUBJECT_REPORT         — COURSE_TRANSCRIPT scoped to scopeRef=levelSubjectId
// Fail-fast (NotImplementedError) in Phase 3:
//   • TERM_REPORT            — term membership requires interpretation, not a copy
//   • FULL_ACADEMIC_HISTORY  — spans multiple enrollments (Phase 4+)
// =============================================================================

// ─── Null-safe comparators (nulls sort last, deterministic) ──────────────────

function cmpNum(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function cmpStr(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b);
}

function cmpDate(a: Date | null, b: Date | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.getTime() - b.getTime();
}

// ─── Input validation (input shape only — never academic outcomes) ───────────

const KNOWN_TYPES = new Set<string>(Object.values(TranscriptType));

function normalizeTranscriptType(raw: string): TranscriptType {
  if (!KNOWN_TYPES.has(raw)) {
    throw new ValidationError(`Unknown transcriptType "${raw}"`, {
      transcriptType: [`must be one of: ${Object.values(TranscriptType).join(", ")}`],
    });
  }
  return raw as TranscriptType;
}

function normalizeDetailLevel(raw: string): TranscriptDetailLevel {
  if (raw !== TranscriptDetailLevel.SUMMARY && raw !== TranscriptDetailLevel.DETAILED) {
    throw new ValidationError(`Unknown detailLevel "${raw}"`, {
      detailLevel: [`must be one of: ${Object.values(TranscriptDetailLevel).join(", ")}`],
    });
  }
  return raw;
}

function requireEnrollmentId(input: BuildTranscriptSnapshotInput, type: TranscriptType): string {
  if (!input.enrollmentId) {
    throw new ValidationError(`enrollmentId is required for ${type}`, {
      enrollmentId: ["required"],
    });
  }
  return input.enrollmentId;
}

function requireScopeRef(
  input: BuildTranscriptSnapshotInput,
  type: TranscriptType,
  label: string
): string {
  if (!input.scopeRef) {
    throw new ValidationError(`scopeRef (${label}) is required for ${type}`, {
      scopeRef: [`required (${label})`],
    });
  }
  return input.scopeRef;
}

// ─── Enrollment-scoped assembly (shared by all Phase-3 supported types) ──────

async function assembleEnrollmentSnapshot(
  input: BuildTranscriptSnapshotInput,
  type: TranscriptType,
  detailLevel: TranscriptDetailLevel,
  enrollmentId: string,
  client?: PrismaClientOrTx
): Promise<TranscriptSnapshotPayload> {
  const organizationId = input.organizationId;
  const detailed = detailLevel === TranscriptDetailLevel.DETAILED;

  // Required sources first — fail fast before loading the rest.
  const [student, enrollment] = await Promise.all([
    findStudentForTranscript({ organizationId, studentId: input.studentId }, client),
    findEnrollmentForTranscript({ organizationId, enrollmentId }, client),
  ]);
  if (!student) throw new NotFoundError("Student", input.studentId);
  if (!enrollment) throw new NotFoundError("Enrollment", enrollmentId);

  const [courseProgress, levelProgress, subjectProgress, subjectAttendance, periodAttendance] =
    await Promise.all([
      findCourseProgressForTranscript({ organizationId, enrollmentId }, client),
      findLevelProgressForTranscript({ organizationId, enrollmentId }, client),
      findSubjectProgressForTranscript({ organizationId, enrollmentId }, client),
      findSubjectAttendanceSummariesForTranscript({ organizationId, enrollmentId }, client),
      findPeriodAttendanceSummariesForTranscript({ organizationId, enrollmentId }, client),
    ]);

  const assessmentResults = detailed
    ? await findAssessmentResultsForTranscript({ organizationId, enrollmentId }, client)
    : [];

  // ── Frozen student identity ──
  const studentSnapshot = {
    studentId: student.id,
    studentCode: student.code,
    firstName: student.firstName,
    lastName: student.lastName,
    fullName: `${student.firstName} ${student.lastName}`.trim(),
    dateOfBirth: student.dateOfBirth,
    idType: student.idType,
    idNumber: student.idNumber,
    status: student.status,
  };

  // ── Frozen course identity ──
  const courseSnapshot = {
    courseId: enrollment.courseId,
    courseName: enrollment.course?.name ?? null,
    courseCode: enrollment.course?.code ?? null,
    categoryId: enrollment.course?.category?.id ?? null,
    category: enrollment.course?.category?.name ?? null,
    totalHours: enrollment.course?.totalHours ?? null,
    enrollmentId: enrollment.id,
    enrollmentNumber: enrollment.enrollmentNumber,
    academicYearId: enrollment.academicYearId,
    academicTermId: enrollment.academicTermId,
    enrollmentStatus: enrollment.status,
  };

  // ── Copied course-level outcome (verbatim) ──
  const courseProgressSnapshot = courseProgress
    ? {
        finalGrade: courseProgress.finalGrade,
        earnedCredits: courseProgress.earnedCredits,
        status: courseProgress.status,
        completedAt: courseProgress.completedAt,
        calculatedAt: courseProgress.calculatedAt,
      }
    : null;

  // ── Assessments (DETAILED only): filter to GRADED, sort, bucket by levelSubject ──
  const assessmentsByLevelSubject = new Map<string, TranscriptAssessmentSnapshot[]>();
  if (detailed) {
    const graded = assessmentResults
      .filter((a) => a.status === ASSESSMENT_RESULT_STATUS_GRADED)
      .sort(
        (a, b) =>
          cmpNum(a.assessmentComponent?.order ?? null, b.assessmentComponent?.order ?? null) ||
          cmpDate(a.gradedAt, b.gradedAt) ||
          cmpStr(a.id, b.id)
      );
    for (const a of graded) {
      const snap: TranscriptAssessmentSnapshot = {
        studentAssessmentResultId: a.id,
        assessmentComponentId: a.assessmentComponentId,
        assessmentEventId: a.assessmentEventId,
        title: a.assessmentEvent?.title ?? null,
        componentName: a.assessmentComponent?.name ?? null,
        componentType: a.assessmentComponent?.componentType ?? null,
        sourceType: a.sourceType,
        grade: a.grade,
        maxGrade: a.maxGrade,
        normalizedGrade: a.normalizedGrade,
        status: a.status,
        gradedAt: a.gradedAt,
        // Identity marker copied from sourceType — not a grade-based computation.
        isRecovery: a.sourceType === ASSESSMENT_SOURCE_TYPE_RECOVERY,
        recoveryAttemptNumber: null,
      };
      const list = assessmentsByLevelSubject.get(a.levelSubjectId) ?? [];
      list.push(snap);
      assessmentsByLevelSubject.set(a.levelSubjectId, list);
    }
  }

  // ── Subject-grain attendance summaries, keyed by levelSubjectId (first-wins) ──
  const attendanceByLevelSubject = new Map<string, TranscriptAttendanceSnapshot>();
  for (const sa of subjectAttendance) {
    if (sa.levelSubjectId == null || attendanceByLevelSubject.has(sa.levelSubjectId)) continue;
    attendanceByLevelSubject.set(sa.levelSubjectId, {
      levelSubjectId: sa.levelSubjectId,
      academicYearId: null,
      academicTermId: null,
      attendancePercentage: sa.attendancePercentage,
      totalSessions: sa.totalSessions,
      totalPresentMinutes: sa.totalPresentMinutes,
      totalScheduledMinutes: sa.totalScheduledMinutes,
      status: sa.status,
      policyId: sa.attendancePolicyId,
      policyName: sa.attendancePolicy?.name ?? null,
      minimumAttendancePercentage: sa.levelSubject?.minimumAttendancePercentage ?? null,
      calculatedAt: sa.calculatedAt,
    });
  }

  // ── Subjects grouped by their course level ──
  const subjectsByLevel = new Map<string, TranscriptSubjectSnapshot[]>();
  let orphanSubjects = 0;
  const knownLevelIds = new Set(levelProgress.map((lp) => lp.courseLevelId));
  for (const sp of subjectProgress) {
    const courseLevelId = sp.levelSubject?.courseLevelId ?? null;
    const subjectSnapshot: TranscriptSubjectSnapshot = {
      levelSubjectId: sp.levelSubjectId,
      subjectId: sp.levelSubject?.subject?.id ?? null,
      subjectName: sp.levelSubject?.subject?.name ?? null,
      subjectCode: sp.levelSubject?.subject?.code ?? null,
      subjectOrder: sp.levelSubject?.order ?? null,
      finalGrade: sp.finalGrade,
      status: sp.status,
      minimumPassingGrade: sp.levelSubject?.minimumPassingGrade ?? null,
      attendancePercentage: sp.attendancePercentage,
      minimumAttendancePercentage: sp.levelSubject?.minimumAttendancePercentage ?? null,
      completedAt: sp.completedAt,
      // Identity credits copied UNCONDITIONALLY from LevelSubject.credits (§5).
      earnedCredits: sp.levelSubject?.credits ?? null,
      workloadHours: sp.levelSubject?.workloadHours ?? null,
      isRequired: sp.levelSubject?.isRequired ?? true,
      recoveryStatus: null,
      attendance: sp.levelSubjectId
        ? attendanceByLevelSubject.get(sp.levelSubjectId) ?? null
        : null,
      ...(detailed
        ? {
            assessments: sp.levelSubjectId
              ? assessmentsByLevelSubject.get(sp.levelSubjectId) ?? []
              : [],
          }
        : {}),
    };

    if (courseLevelId == null || !knownLevelIds.has(courseLevelId)) {
      orphanSubjects += 1;
      continue;
    }
    const list = subjectsByLevel.get(courseLevelId) ?? [];
    list.push(subjectSnapshot);
    subjectsByLevel.set(courseLevelId, list);
  }

  // Invariant: subject progress only exists within a level that has progress.
  // A violation means inconsistent source data — fail fast rather than silently
  // drop the subjects or invent a placeholder level. (Never fires for well-formed
  // data, including in-progress courses.)
  if (orphanSubjects > 0) {
    throw new ValidationError(
      `Inconsistent source data: ${orphanSubjects} subject progress row(s) reference a level with no level-progress record`,
      { subjectProgress: ["orphaned from level progress"] }
    );
  }

  // ── Levels from StudentLevelProgress + frozen CourseLevel identity ──
  const levels: TranscriptLevelSnapshot[] = levelProgress.map((lp) => {
    const subjects = subjectsByLevel.get(lp.courseLevelId) ?? [];
    subjects.sort(
      (a, b) =>
        cmpNum(a.subjectOrder, b.subjectOrder) ||
        cmpStr(a.subjectName, b.subjectName) ||
        cmpStr(a.levelSubjectId, b.levelSubjectId)
    );
    return {
      courseLevelId: lp.courseLevelId,
      levelName: lp.courseLevel?.name ?? null,
      levelCode: lp.courseLevel?.code ?? null,
      levelOrder: lp.courseLevel?.order ?? null,
      finalGrade: lp.finalGrade,
      status: lp.status,
      completedAt: lp.completedAt,
      // Documented derivation (design §4.3): the level's first-progress createdAt.
      startedAt: lp.createdAt,
      earnedCredits: lp.earnedCredits,
      workloadHours: lp.courseLevel?.totalHours ?? null,
      subjects,
    };
  });
  levels.sort(
    (a, b) =>
      cmpNum(a.levelOrder, b.levelOrder) ||
      cmpStr(a.levelName, b.levelName) ||
      cmpStr(a.courseLevelId, b.courseLevelId)
  );

  // ── Period-grain attendance (top-level), deterministically ordered ──
  const periodAttendances: TranscriptAttendanceSnapshot[] = [...periodAttendance]
    .sort(
      (a, b) =>
        cmpStr(a.academicYearId, b.academicYearId) ||
        cmpStr(a.academicTermId, b.academicTermId) ||
        cmpStr(a.id, b.id)
    )
    .map((pa) => ({
      levelSubjectId: null,
      academicYearId: pa.academicYearId,
      academicTermId: pa.academicTermId,
      attendancePercentage: pa.attendancePercentage,
      totalSessions: pa.totalSessions,
      totalPresentMinutes: pa.totalPresentMinutes,
      totalScheduledMinutes: pa.totalScheduledMinutes,
      status: pa.status,
      policyId: null,
      policyName: null,
      minimumAttendancePercentage: null,
      calculatedAt: pa.calculatedAt,
    }));

  // ── Type-specific scope selection (structural id filter, not outcome filter) ──
  let scopedLevels = levels;
  let scopeCourseLevelId: string | null = null;
  let scopeLevelSubjectId: string | null = null;

  if (type === TranscriptType.LEVEL_TRANSCRIPT) {
    scopeCourseLevelId = input.scopeRef ?? null;
    scopedLevels = levels.filter((l) => l.courseLevelId === scopeCourseLevelId);
  } else if (type === TranscriptType.SUBJECT_REPORT) {
    scopeLevelSubjectId = input.scopeRef ?? null;
    scopedLevels = levels
      .map((l) => ({
        ...l,
        subjects: l.subjects.filter((s) => s.levelSubjectId === scopeLevelSubjectId),
      }))
      .filter((l) => l.subjects.length > 0);
  }

  const scope: TranscriptSnapshotScope = {
    enrollmentId: enrollment.id,
    courseId: enrollment.courseId,
    courseLevelId: scopeCourseLevelId,
    academicTermId: null,
    levelSubjectId: scopeLevelSubjectId,
  };

  const subjectCount = scopedLevels.reduce((n, l) => n + l.subjects.length, 0);
  const assessmentCount = scopedLevels.reduce(
    (n, l) => n + l.subjects.reduce((m, s) => m + (s.assessments?.length ?? 0), 0),
    0
  );

  return {
    transcriptType: type,
    scope,
    snapshotDate: input.snapshotDate,
    studentSnapshot,
    courseSnapshot,
    courseProgressSnapshot,
    levels: scopedLevels,
    periodAttendances,
    metadata: {
      detailLevel,
      generatedBy: input.generatedBy ?? null,
      builderVersion: SNAPSHOT_BUILDER_VERSION,
      levelCount: scopedLevels.length,
      subjectCount,
      assessmentCount,
      periodAttendanceCount: periodAttendances.length,
    },
  };
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Build an in-memory, deterministic transcript snapshot payload from official
 * Academic Core outputs. Pure and read-only: no writes, events, audit, number
 * allocation, or status decisions. `client` forwards a Prisma transaction client
 * to the source reads when the future command runs inside a transaction.
 *
 * @throws ValidationError        invalid transcriptType/detailLevel/scope input
 * @throws NotFoundError          missing required student/enrollment
 * @throws NotImplementedError    transcript type not supported in this phase
 */
export async function buildTranscriptSnapshot(
  input: BuildTranscriptSnapshotInput,
  client?: PrismaClientOrTx
): Promise<TranscriptSnapshotPayload> {
  const type = normalizeTranscriptType(input.transcriptType);
  const detailLevel = normalizeDetailLevel(input.detailLevel);

  switch (type) {
    case TranscriptType.COURSE_TRANSCRIPT:
    case TranscriptType.CERTIFICATE_SUPPORT: {
      const enrollmentId = requireEnrollmentId(input, type);
      return assembleEnrollmentSnapshot(input, type, detailLevel, enrollmentId, client);
    }
    case TranscriptType.LEVEL_TRANSCRIPT: {
      const enrollmentId = requireEnrollmentId(input, type);
      requireScopeRef(input, type, "courseLevelId");
      return assembleEnrollmentSnapshot(input, type, detailLevel, enrollmentId, client);
    }
    case TranscriptType.SUBJECT_REPORT: {
      const enrollmentId = requireEnrollmentId(input, type);
      requireScopeRef(input, type, "levelSubjectId");
      return assembleEnrollmentSnapshot(input, type, detailLevel, enrollmentId, client);
    }
    case TranscriptType.TERM_REPORT:
      throw new NotImplementedError("TERM_REPORT transcript (Phase 3)");
    case TranscriptType.FULL_ACADEMIC_HISTORY:
      throw new NotImplementedError("FULL_ACADEMIC_HISTORY transcript (Phase 3)");
    default: {
      // Exhaustiveness guard — unreachable given normalizeTranscriptType.
      const _exhaustive: never = type;
      throw new ValidationError(`Unhandled transcriptType "${String(_exhaustive)}"`);
    }
  }
}
