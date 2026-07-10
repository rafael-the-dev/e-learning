import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { listExamAttempts } from "@/modules/examinations/repositories/exam-attempt.repository";
import { findExamPeriodById } from "@/modules/examinations/repositories/exam-period.repository";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import type {
  ExaminationAttendanceFact,
  ExaminationDisciplinaryFact,
  ExaminationEligibilityFacts,
  ExaminationEligibilitySourceInput,
  ExaminationEnrollmentFact,
  ExaminationFinancialClearanceFact,
  ExaminationLevelSubjectFact,
  ExaminationManualApprovalFact,
  ExaminationPeriodFact,
  ExaminationPrerequisiteItemFact,
  ExaminationPrerequisitesFact,
  ExaminationPreviousAttemptsFact,
  ExaminationSessionFact,
  ExaminationStudentFact,
  ExaminationSubjectProgressFact,
} from "@/modules/examinations/types/eligibility-source";

// =============================================================================
// EXAMINATION ELIGIBILITY SOURCE (Phase 3A) — READ-AGGREGATION ONLY
// -----------------------------------------------------------------------------
// Loads the facts the future `ExaminationEligibilityEngine` (Phase 3B) will decide
// on. It DECIDES NOTHING: no eligibility rule, no blocking reason, no `eligible`
// flag, no `requiresApproval`, no capacity/duplicate/scheduling check. It copies
// stored facts verbatim, counts previous attempts, normalizes null/UNKNOWN, and
// returns explicit `null`/`UNKNOWN` for integrations that do not exist yet
// (finance, disciplinary, exam approval policy).
//
// Boundaries (ADR-013): it reads Academic Core tables (Student / Enrollment /
// LevelSubject / Subject / StudentSubjectProgress / StudentSubjectAttendanceSummary /
// LevelSubjectPrerequisite*) READ-ONLY and org-scoped, plus the Examination
// repositories for Exam* facts. It NEVER reads the Transcript or Certificate
// engines, never calls the Grade/Attendance calculation engines or the Progression
// command layer, never writes, never emits events/audit. `now` is used ONLY for
// `metadata.loadedAt`; no fact is decided from the clock (the engine stays pure).
// =============================================================================

const SOURCE_VERSION = "examination-eligibility-source.v1" as const;

/** Prisma Decimal | null → number | null. Copy, not calculation. */
function toNum(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/**
 * Load the examination eligibility facts for one (student, enrollment,
 * levelSubject), optionally scoped to a period / session / attempt. Returns FACTS
 * only. Missing rows (incl. cross-tenant, soft-deleted) surface as `null` facts —
 * the source never throws NotFound; the command/engine later decides what a null
 * means. Everything is org-scoped and accepts an optional transaction client.
 */
export async function loadExaminationEligibilityFacts(
  input: ExaminationEligibilitySourceInput,
  client?: PrismaClientOrTx
): Promise<ExaminationEligibilityFacts> {
  const db = client ?? (await getDb());
  const { organizationId, studentId, enrollmentId, levelSubjectId } = input;
  const loadedAt = input.now ?? new Date();

  // ── Student (live only; soft-deleted → null, never exposed) ──────────────────
  const studentRow = await db.student.findFirst({
    where: { id: studentId, organizationId, deletedAt: null },
    select: { id: true, code: true, firstName: true, lastName: true, status: true },
  });
  const student: ExaminationStudentFact | null = studentRow
    ? {
        id: studentRow.id as string,
        studentNumber: (studentRow.code as string | null) ?? null,
        fullName: `${studentRow.firstName as string} ${studentRow.lastName as string}`.trim(),
        status: studentRow.status as string,
      }
    : null;

  // ── Enrollment ───────────────────────────────────────────────────────────────
  const enrollmentRow = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: {
      id: true,
      status: true,
      courseId: true,
      courseLevelId: true,
      currentLevelId: true,
    },
  });
  const enrollment: ExaminationEnrollmentFact | null = enrollmentRow
    ? {
        id: enrollmentRow.id as string,
        status: enrollmentRow.status as string,
        courseId: enrollmentRow.courseId as string,
        courseLevelId: (enrollmentRow.courseLevelId as string | null) ?? null,
        currentLevelId: (enrollmentRow.currentLevelId as string | null) ?? null,
      }
    : null;

  // ── LevelSubject (+ Subject name) ─────────────────────────────────────────────
  const levelSubjectRow = await db.levelSubject.findFirst({
    where: { id: levelSubjectId, organizationId, deletedAt: null },
    select: {
      id: true,
      subjectId: true,
      minimumAttendancePercentage: true,
      minimumPassingGrade: true,
      isRequired: true,
      credits: true,
      workloadHours: true,
    },
  });
  let levelSubject: ExaminationLevelSubjectFact | null = null;
  if (levelSubjectRow) {
    const subjectRow = await db.subject.findFirst({
      where: { id: levelSubjectRow.subjectId as string, organizationId },
      select: { name: true },
    });
    levelSubject = {
      id: levelSubjectRow.id as string,
      subjectId: levelSubjectRow.subjectId as string,
      subjectName: (subjectRow?.name as string | undefined) ?? null,
      minimumAttendancePercentage: toNum(levelSubjectRow.minimumAttendancePercentage),
      minimumPassingGrade: toNum(levelSubjectRow.minimumPassingGrade),
      isRequired: levelSubjectRow.isRequired as boolean,
      credits: (levelSubjectRow.credits as number | null) ?? null,
      workloadHours: (levelSubjectRow.workloadHours as number | null) ?? null,
    };
  }

  // ── Subject progress (verbatim; NO recalculation) ─────────────────────────────
  const progressRow = await db.studentSubjectProgress.findFirst({
    where: { organizationId, enrollmentId, levelSubjectId },
    select: { status: true, finalGrade: true, attendancePercentage: true, completedAt: true },
  });
  const subjectProgress: ExaminationSubjectProgressFact = progressRow
    ? {
        exists: true,
        status: progressRow.status as string,
        finalGrade: toNum(progressRow.finalGrade),
        attendancePercentage: toNum(progressRow.attendancePercentage),
        completedAt: (progressRow.completedAt as Date | null) ?? null,
        passedAt: null, // not tracked as a distinct column (documented gap)
        source: "StudentSubjectProgress",
      }
    : {
        exists: false,
        status: null,
        finalGrade: null,
        attendancePercentage: null,
        completedAt: null,
        passedAt: null,
        source: "StudentSubjectProgress",
      };

  // ── Attendance summary (verbatim or null) ─────────────────────────────────────
  const attendanceRow = await db.studentSubjectAttendanceSummary.findFirst({
    where: { organizationId, enrollmentId, levelSubjectId },
    select: {
      attendancePercentage: true,
      totalPresentMinutes: true,
      totalScheduledMinutes: true,
      status: true,
    },
  });
  const attendance: ExaminationAttendanceFact | null = attendanceRow
    ? {
        percentage: toNum(attendanceRow.attendancePercentage),
        present: (attendanceRow.totalPresentMinutes as number | null) ?? null,
        total: (attendanceRow.totalScheduledMinutes as number | null) ?? null,
        requiredPercentage: levelSubject?.minimumAttendancePercentage ?? null,
        status: attendanceRow.status as string,
        source: "StudentSubjectAttendanceSummary",
      }
    : null;

  // ── Prerequisites (copied; the engine evaluates them, not the source) ─────────
  const groupRows = await db.levelSubjectPrerequisiteGroup.findMany({
    where: { organizationId, levelSubjectId, status: "ACTIVE", deletedAt: null },
    select: { id: true, logicType: true },
  });
  const prerequisiteItems: ExaminationPrerequisiteItemFact[] = [];
  if (groupRows.length > 0) {
    const groupIds = groupRows.map((g) => g.id as string);
    const groupLogicById = new Map(groupRows.map((g) => [g.id as string, g.logicType as string]));
    const itemRows = await db.levelSubjectPrerequisiteItem.findMany({
      where: { organizationId, prerequisiteGroupId: { in: groupIds }, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        prerequisiteGroupId: true,
        prerequisiteLevelSubjectId: true,
        requirementType: true,
        minimumRequiredGrade: true,
      },
    });
    for (const it of itemRows) {
      prerequisiteItems.push({
        id: it.id as string,
        groupId: it.prerequisiteGroupId as string,
        groupLogicType: groupLogicById.get(it.prerequisiteGroupId as string) ?? "ALL",
        prerequisiteLevelSubjectId: it.prerequisiteLevelSubjectId as string,
        requirementType: it.requirementType as string,
        minimumRequiredGrade: toNum(it.minimumRequiredGrade),
      });
    }
  }
  const prerequisites: ExaminationPrerequisitesFact = {
    items: prerequisiteItems,
    // Phase 3A copies requirement DEFINITIONS only; it does not evaluate whether
    // they are satisfied → satisfaction is UNKNOWN (null). The engine treats null as
    // a warning, never a blocker. A future source that evaluates sets true/false.
    allMet: null,
    source: "LevelSubjectPrerequisiteGroup",
  };

  // ── Finance / disciplinary — UNKNOWN in Phase 3A (no read-model wired) ────────
  const financialClearance: ExaminationFinancialClearanceFact = {
    status: "UNKNOWN",
    checkedAt: null,
    reference: null,
  };
  const disciplinary: ExaminationDisciplinaryFact = { status: "UNKNOWN", reason: null };

  // ── Previous attempts (count / max / last status) ─────────────────────────────
  const attemptRows = await listExamAttempts(
    { organizationId, enrollmentId, levelSubjectId },
    db
  );
  // listExamAttempts orders by createdAt desc → the highest attemptNumber and the
  // "last" status are derived by copy/aggregation only (no decision).
  let maxAttemptNumber: number | null = null;
  for (const a of attemptRows) {
    if (maxAttemptNumber == null || a.attemptNumber > maxAttemptNumber) {
      maxAttemptNumber = a.attemptNumber;
    }
  }
  const lastAttempt = attemptRows.reduce<(typeof attemptRows)[number] | null>((acc, a) => {
    if (!acc || a.attemptNumber > acc.attemptNumber) return a;
    return acc;
  }, null);
  const previousAttempts: ExaminationPreviousAttemptsFact = {
    attempts: attemptRows.map((a) => ({
      id: a.id,
      attemptNumber: a.attemptNumber,
      status: a.status,
    })),
    count: attemptRows.length,
    lastAttemptStatus: lastAttempt?.status ?? null,
    maxAttemptNumber,
    source: "ExamAttempt",
  };

  // ── Exam period / session (only when ids provided) ────────────────────────────
  let examPeriod: ExaminationPeriodFact | null = null;
  if (input.examPeriodId) {
    const p = await findExamPeriodById({ organizationId, id: input.examPeriodId }, db);
    if (p) {
      examPeriod = { id: p.id, status: p.status, startsAt: p.startsAt, endsAt: p.endsAt };
    }
  }

  let examSession: ExaminationSessionFact | null = null;
  if (input.examSessionId) {
    const s = await findExamSessionById({ organizationId, id: input.examSessionId }, db);
    if (s) {
      examSession = {
        id: s.id,
        status: s.status,
        periodId: s.periodId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        capacity: s.capacity,
      };
    }
  }

  // ── Manual approval — UNKNOWN in Phase 3A (no exam policy/override model) ──────
  const manualApproval: ExaminationManualApprovalFact = {
    requiredByPolicy: null,
    overrides: [],
  };

  return {
    student,
    enrollment,
    levelSubject,
    subjectProgress,
    attendance,
    prerequisites,
    financialClearance,
    disciplinary,
    previousAttempts,
    examPeriod,
    examSession,
    manualApproval,
    metadata: {
      sourceVersion: SOURCE_VERSION,
      loadedAt,
      // Copy the requested ids so the engine can tell "not requested" (no warning)
      // from "requested but not found" (a warning). Facts only — no decision.
      requestedExamPeriodId: input.examPeriodId ?? null,
      requestedExamSessionId: input.examSessionId ?? null,
    },
  };
}
