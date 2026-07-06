import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  NotImplementedError,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { TranscriptType } from "@/modules/transcripts/constants";
import {
  generateTranscriptSnapshotSchema,
  type GenerateTranscriptSnapshotSchema,
} from "@/modules/transcripts/schemas/transcript.schema";
import { buildTranscriptSnapshot } from "@/modules/transcripts/services/transcript-snapshot-builder.service";
import { transcriptContentChecksum } from "@/modules/transcripts/services/transcript-canonical-payload.service";
import {
  createTranscript,
  findTranscriptByScope,
} from "@/modules/transcripts/repositories/academic-transcript.repository";
import {
  createVersion,
  findLatestVersion,
} from "@/modules/transcripts/repositories/academic-transcript-version.repository";
import {
  createAssessmentSnapshots,
  createAttendanceSnapshots,
  createLevelSnapshots,
  createSubjectSnapshots,
  type AssessmentSnapshotInput,
  type AttendanceSnapshotInput,
  type LevelSnapshotInput,
  type SubjectSnapshotInput,
} from "@/modules/transcripts/repositories/academic-transcript-snapshot.repository";
import type {
  TranscriptAttendanceSnapshot,
  TranscriptLevelSnapshot,
  TranscriptRootRecord,
  TranscriptSubjectSnapshot,
  TranscriptVersionRecord,
} from "@/modules/transcripts/types";

// =============================================================================
// GENERATE TRANSCRIPT SNAPSHOT COMMAND (Phase 4)
// -----------------------------------------------------------------------------
// PERSISTS the deterministic payload produced by the Phase-3 Snapshot Builder as
// a DRAFT transcript version + immutable snapshot rows, inside ONE transaction.
//
// It does NOT: issue / supersede / revoke, allocate a transcript number, export,
// render a PDF, notify, publish events, or write audit — those belong to later
// phases. It never mutates or recalculates the Builder's output; it persists it
// exactly, in order (Level → Subject → Assessment → Attendance).
//
// Root aggregate rule: exactly one root per (student, transcriptType, scope). If
// a root already exists it is reused and a NEW DRAFT version is appended; issued
// versions are never touched. Any failure rolls back the whole transaction — no
// partial transcript.
// =============================================================================

export interface GenerateTranscriptSnapshotResult {
  transcript: TranscriptRootRecord;
  version: TranscriptVersionRecord;
}

/** Fail fast on a payload field that maps to a NON-NULL snapshot column but is
 *  unexpectedly null. Never fires for well-formed Academic Core data (course
 *  level / subject / component identity is non-null upstream) — it exists so the
 *  command never silently persists an invented value. */
function required<T>(value: T | null | undefined, field: string): T {
  if (value == null) {
    throw new ValidationError(`Snapshot payload missing required field: ${field}`, {
      [field]: ["required"],
    });
  }
  return value;
}

function toLevelInput(level: TranscriptLevelSnapshot): LevelSnapshotInput {
  return {
    courseLevelId: level.courseLevelId,
    levelName: required(level.levelName, "level.levelName"),
    levelCode: level.levelCode,
    levelOrder: required(level.levelOrder, "level.levelOrder"),
    finalGrade: level.finalGrade,
    status: level.status,
    completedAt: level.completedAt,
    startedAt: level.startedAt,
    earnedCredits: level.earnedCredits,
    workloadHours: level.workloadHours,
  };
}

function toSubjectInput(
  transcriptLevelId: string,
  subject: TranscriptSubjectSnapshot
): SubjectSnapshotInput {
  return {
    transcriptLevelId,
    levelSubjectId: subject.levelSubjectId,
    subjectId: subject.subjectId,
    subjectName: required(subject.subjectName, "subject.subjectName"),
    subjectCode: subject.subjectCode,
    subjectOrder: required(subject.subjectOrder, "subject.subjectOrder"),
    finalGrade: subject.finalGrade,
    status: subject.status,
    minimumPassingGrade: subject.minimumPassingGrade,
    attendancePercentage: subject.attendancePercentage,
    minimumAttendancePercentage: subject.minimumAttendancePercentage,
    completedAt: subject.completedAt,
    // Identity credits copied through from the Builder (LevelSubject.credits).
    credits: subject.earnedCredits,
    workloadHours: subject.workloadHours,
    isRequired: subject.isRequired,
    recoveryStatus: subject.recoveryStatus,
  };
}

function toAssessmentInput(
  transcriptSubjectId: string,
  a: NonNullable<TranscriptSubjectSnapshot["assessments"]>[number]
): AssessmentSnapshotInput {
  return {
    transcriptSubjectId,
    studentAssessmentResultId: a.studentAssessmentResultId,
    assessmentComponentId: a.assessmentComponentId,
    assessmentEventId: a.assessmentEventId,
    title: a.title,
    componentName: required(a.componentName, "assessment.componentName"),
    componentType: a.componentType,
    sourceType: a.sourceType,
    grade: a.grade,
    maxGrade: a.maxGrade,
    normalizedGrade: a.normalizedGrade,
    status: a.status,
    gradedAt: a.gradedAt,
    isRecovery: a.isRecovery,
    recoveryAttemptNumber: a.recoveryAttemptNumber,
  };
}

function toAttendanceInput(
  at: TranscriptAttendanceSnapshot,
  transcriptSubjectId: string | null
): AttendanceSnapshotInput {
  return {
    transcriptSubjectId,
    levelSubjectId: at.levelSubjectId,
    academicYearId: at.academicYearId,
    academicTermId: at.academicTermId,
    attendancePercentage: at.attendancePercentage,
    totalSessions: at.totalSessions,
    totalPresentMinutes: at.totalPresentMinutes,
    totalScheduledMinutes: at.totalScheduledMinutes,
    status: at.status,
    policyId: at.policyId,
    policyName: at.policyName,
    minimumAttendancePercentage: at.minimumAttendancePercentage,
    calculatedAt: at.calculatedAt,
  };
}

const ENROLLMENT_SCOPED = new Set<string>([
  TranscriptType.COURSE_TRANSCRIPT,
  TranscriptType.CERTIFICATE_SUPPORT,
  TranscriptType.LEVEL_TRANSCRIPT,
  TranscriptType.SUBJECT_REPORT,
]);

export class GenerateTranscriptSnapshotCommand extends BaseCommand<
  GenerateTranscriptSnapshotSchema,
  GenerateTranscriptSnapshotResult
> {
  async validate(): Promise<void> {
    const result = generateTranscriptSnapshotSchema.safeParse(this.input);
    if (!result.success) {
      throw new ValidationError("Dados inválidos", result.error.flatten().fieldErrors);
    }
    const input = result.data;

    // Fail fast on unsupported types before authorizing / opening a transaction.
    if (
      input.transcriptType === TranscriptType.TERM_REPORT ||
      input.transcriptType === TranscriptType.FULL_ACADEMIC_HISTORY
    ) {
      throw new NotImplementedError(`${input.transcriptType} transcript (Phase 4)`);
    }

    // Input-shape scope requirements (existence is checked by the Builder).
    if (ENROLLMENT_SCOPED.has(input.transcriptType) && !input.enrollmentId) {
      throw new ValidationError("Dados inválidos", { enrollmentId: ["required"] });
    }
    if (input.transcriptType === TranscriptType.LEVEL_TRANSCRIPT && !input.scopeRef) {
      throw new ValidationError("Dados inválidos", { scopeRef: ["required (courseLevelId)"] });
    }
    if (input.transcriptType === TranscriptType.SUBJECT_REPORT && !input.scopeRef) {
      throw new ValidationError("Dados inválidos", { scopeRef: ["required (levelSubjectId)"] });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.TRANSCRIPTS_GENERATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<GenerateTranscriptSnapshotResult> {
    const { organizationId, userId } = this.context;
    const input = generateTranscriptSnapshotSchema.parse(this.input);
    const snapshotDate = input.snapshotDate ?? new Date();

    const db = await getDb();
    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Read Academic Core → build deterministic in-memory payload.
      const payload = await buildTranscriptSnapshot(
        {
          organizationId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId ?? null,
          courseId: input.courseId ?? null,
          transcriptType: input.transcriptType,
          scopeRef: input.scopeRef ?? null,
          detailLevel: input.detailLevel,
          snapshotDate,
          generatedBy: userId,
        },
        tx
      );

      // 2. Checksum from the canonical payload — persisted once, never recomputed.
      const checksum = transcriptContentChecksum(payload);

      // 3. Reuse the single root for this scope, or create a DRAFT root.
      const existing = await findTranscriptByScope(
        {
          organizationId,
          studentId: input.studentId,
          transcriptType: payload.transcriptType,
          enrollmentId: payload.scope.enrollmentId,
          courseId: payload.scope.courseId,
          scopeCourseLevelId: payload.scope.courseLevelId,
          scopeAcademicTermId: payload.scope.academicTermId,
          scopeLevelSubjectId: payload.scope.levelSubjectId,
        },
        tx
      );

      const transcript =
        existing ??
        (await createTranscript(
          {
            organizationId,
            studentId: input.studentId,
            enrollmentId: payload.scope.enrollmentId,
            courseId: payload.scope.courseId,
            transcriptType: payload.transcriptType,
            scopeCourseLevelId: payload.scope.courseLevelId,
            scopeAcademicTermId: payload.scope.academicTermId,
            scopeLevelSubjectId: payload.scope.levelSubjectId,
            transcriptNumber: null,
            status: "DRAFT",
          },
          tx
        ));

      // 4. Version number: caller-supplied (temporary), else max+1.
      const versionNumber =
        input.versionNumber ??
        ((await findLatestVersion({ transcriptId: transcript.id, organizationId }, tx))
          ?.versionNumber ?? 0) + 1;

      // 5. Create the DRAFT version (checksum frozen now; issuedAt/superseded/revoked null).
      const version = await createVersion(
        {
          organizationId,
          transcriptId: transcript.id,
          versionNumber,
          snapshotDate: payload.snapshotDate,
          status: "DRAFT",
          reason: input.reason ?? null,
          generatedBy: userId,
          checksum,
          studentSnapshot: JSON.stringify(payload.studentSnapshot),
          courseSnapshot: JSON.stringify({
            course: payload.courseSnapshot,
            courseProgress: payload.courseProgressSnapshot,
          }),
        },
        tx
      );

      // 6. Persist immutable snapshot rows in order: Level → Subject → Assessment → Attendance.
      const levelRecords = await createLevelSnapshots(
        {
          organizationId,
          transcriptVersionId: version.id,
          levels: payload.levels.map(toLevelInput),
        },
        tx
      );

      // Flatten subjects while remembering their (freshly-created) level id.
      const flatSubjects: Array<{ levelId: string; subject: TranscriptSubjectSnapshot }> = [];
      payload.levels.forEach((level, i) => {
        const levelId = levelRecords[i].id;
        for (const subject of level.subjects) flatSubjects.push({ levelId, subject });
      });

      const subjectRecords = await createSubjectSnapshots(
        {
          organizationId,
          transcriptVersionId: version.id,
          subjects: flatSubjects.map(({ levelId, subject }) => toSubjectInput(levelId, subject)),
        },
        tx
      );

      // Assessments (DETAILED only carries any), wired to their created subject id.
      const assessmentInputs: AssessmentSnapshotInput[] = [];
      flatSubjects.forEach(({ subject }, j) => {
        const transcriptSubjectId = subjectRecords[j].id;
        for (const a of subject.assessments ?? []) {
          assessmentInputs.push(toAssessmentInput(transcriptSubjectId, a));
        }
      });
      if (assessmentInputs.length > 0) {
        await createAssessmentSnapshots({ organizationId, assessments: assessmentInputs }, tx);
      }

      // Attendance: subject-grain (nested) + version/period-grain (top-level).
      const attendanceInputs: AttendanceSnapshotInput[] = [];
      flatSubjects.forEach(({ subject }, j) => {
        if (subject.attendance) {
          attendanceInputs.push(toAttendanceInput(subject.attendance, subjectRecords[j].id));
        }
      });
      for (const pa of payload.periodAttendances) {
        attendanceInputs.push(toAttendanceInput(pa, null));
      }
      if (attendanceInputs.length > 0) {
        await createAttendanceSnapshots(
          { organizationId, transcriptVersionId: version.id, attendances: attendanceInputs },
          tx
        );
      }

      return { transcript, version };
    });
  }
}
