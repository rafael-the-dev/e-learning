// =============================================================================
// SUBJECT PROGRESS CASCADE SERVICE
// The single, canonical recalculation path for academic progression.
//
//   StudentAssessmentResult (source of truth)
//        -> StudentSubjectProgress
//        -> StudentLevelProgress   (recalculateStudentLevelProgress)
//        -> StudentCourseProgress  (evaluateCourseCompletion, cascaded inside)
//
// Every grade mutation funnels through here so subject -> level -> course
// progress can never diverge from the canonical grades. Authorization is the
// responsibility of the caller (command layer); this service performs no
// permission checks and always cascades.
// =============================================================================

import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { emitOrCollect, type CascadeContext } from "@/shared/lib/cascade";
import { resolveStableCompletedAt } from "@/shared/lib/completed-at";
import { getDb } from "@/server/db";

// completedAt semantics for StudentSubjectProgress.
//   terminal   — statuses that carry a completedAt (PASSED, FAILED).
//   completion — the subset that means positive completion (PASSED). FAILED is
//                terminal but not a positive completion, so PASSED → FAILED
//                clears the date while FAILED → PASSED stamps a new one.
//   (INCOMPLETE / BLOCKED / IN_PROGRESS / NOT_STARTED are non-terminal. If a
//    real RECOVERY_REQUIRED status is added later it must stay non-terminal.)
export const SUBJECT_TERMINAL_STATUSES: ReadonlySet<string> = new Set(["PASSED", "FAILED"]);
export const SUBJECT_COMPLETION_STATUSES: ReadonlySet<string> = new Set(["PASSED"]);
import { findResultsByEnrollmentAndLevelSubject } from "@/modules/grades/repositories/student-assessment-result.repository";
import { upsertStudentSubjectProgress } from "@/modules/assessments/repositories/student-subject-progress.repository";
import { findActivePolicyForLevelSubject } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import {
  gradeCalculationService,
  type GradeComponentScore,
} from "@/modules/grades/services/grade-calculation.service";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import { recalculateStudentLevelProgress } from "@/modules/prerequisites/services/recalculate-level-progress.service";
import { loadEffectiveAttendancePolicy } from "@/modules/attendance/services/attendance-policy.resolver";
import { findSummaryByEnrollmentAndSubject } from "@/modules/attendance/repositories/student-subject-attendance-summary.repository";
import {
  detectSubjectProgressTransition,
  type SubjectProgressSnapshot,
} from "@/modules/grades/services/subject-progress-transition";

export interface RecalculateSubjectProgressParams {
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  /** Audit action to record; callers use their own verb. */
  auditAction?: string;
}

/**
 * Recalculate StudentSubjectProgress from the canonical StudentAssessmentResult
 * rows and cascade to level and course progress. Always cascades. No auth.
 */
export async function recalculateSubjectProgressCascade(
  context: AuthContext,
  params: RecalculateSubjectProgressParams,
  // Optional cascade context: when present, every read/write uses its tx client
  // and domain events are buffered for post-commit publication (atomic cascade).
  ctx?: CascadeContext
): Promise<StudentSubjectProgress> {
  const { organizationId } = context;
  const { studentId, enrollmentId, levelSubjectId } = params;

  const db = ctx?.client ?? await getDb();
  const levelSubject = await db.levelSubject.findFirst({
    where: { id: levelSubjectId, organizationId },
    select: {
      minimumPassingGrade: true,
      minimumAttendancePercentage: true,
      courseLevelId: true,
      attendancePolicyId: true,
    },
  });

  const policy = await findActivePolicyForLevelSubject(levelSubjectId, organizationId, db);
  const components = policy
    ? await findActiveComponentsByPolicy(policy.id, organizationId, db)
    : [];

  // Read from unified StudentAssessmentResult (single source of truth).
  // CANCELLED / invalidated results are excluded by the repository query,
  // so an invalidated grade correctly drops out of the calculation.
  const results = await findResultsByEnrollmentAndLevelSubject(
    enrollmentId,
    levelSubjectId,
    organizationId,
    db
  );

  const componentScores: GradeComponentScore[] = components.map((comp) => {
    const matching = results.find((r) => r.assessmentComponentId === comp.id);
    return {
      componentId: comp.id,
      weight: comp.weight,
      maxGrade: comp.maxGrade,
      grade: matching?.grade ?? null,
      normalizedGrade: matching?.normalizedGrade ?? null,
      isRequired: comp.isRequired,
    };
  });

  const minPassingGrade =
    levelSubject?.minimumPassingGrade != null
      ? Number(levelSubject.minimumPassingGrade)
      : policy?.minimumPassingGrade ?? 50;

  const minAttendance = levelSubject?.minimumAttendancePercentage
    ? Number(levelSubject.minimumAttendancePercentage)
    : null;

  // ── ATTENDANCE GATE (Attendance Engine Phase 5 — GATED, opt-in) ─────────────
  // Attendance can affect academic outcome ONLY when a policy explicitly enables
  // it. Resolve the effective policy for this subject (LevelSubject override →
  // org default → safe fallback). The gate fires only when ALL hold:
  //   • policy.enforceAttendanceForProgress === true  (opt-in, default false)
  //   • LevelSubject.minimumAttendancePercentage is defined  (threshold exists)
  //   • a persisted StudentSubjectAttendanceSummary.attendancePercentage exists
  // Otherwise attendanceForCalc stays null and the INCOMPLETE branch in
  // GradeCalculationService stays dormant — a subject passes on grade alone
  // (fully behaviour-neutral). We never fabricate an attendance value.
  const effectiveAttendancePolicy = await loadEffectiveAttendancePolicy(
    organizationId,
    levelSubject?.attendancePolicyId ?? null,
    db
  );
  let attendanceForCalc: number | null = null;
  if (effectiveAttendancePolicy.enforceAttendanceForProgress && minAttendance != null) {
    const attendanceSummary = await findSummaryByEnrollmentAndSubject(
      enrollmentId,
      levelSubjectId,
      organizationId,
      db
    );
    attendanceForCalc = attendanceSummary?.attendancePercentage ?? null;
  }

  let calculationResult;
  if (policy && components.length > 0) {
    calculationResult = gradeCalculationService.calculateFinalGrade({
      calculationMethod: policy.calculationMethod,
      roundingMethod: policy.roundingMethod,
      minimumPassingGrade: minPassingGrade,
      allowRecovery: policy.allowRecovery,
      components: componentScores,
      attendancePercentage: attendanceForCalc, // gated — null unless enforcement enabled
      minimumAttendancePercentage: minAttendance,
    });
  } else {
    calculationResult = {
      finalGrade: null,
      status: "IN_PROGRESS" as const,
      reason: "Sem política de avaliação configurada",
    };
  }

  // Recovery lifecycle: a failing grade with allowRecovery yields RECOVERY_REQUIRED
  // from the calculation service. RECOVERY_REQUIRED is a REAL, non-terminal state —
  // it must NOT collapse to FAILED, otherwise the level/course fail prematurely
  // before the student has taken (or exhausted) recovery.
  //
  // Attempt limit (one recovery attempt by default): recovery is only "exhausted"
  // once a RECOVERY-sourced result has already been written and the subject still
  // fails. We detect that via the canonical row's sourceType (the retake write-back
  // sets sourceType = RECOVERY). Until then the subject stays RECOVERY_REQUIRED.
  // NOTE: multi-round recovery (policy.maxRetakes > 1) is a documented future
  // extension — it needs an attempt COUNT (AssessmentRetake / RECOVERY change logs),
  // which the single canonical row per component does not track. See grade-engine.md.
  const hasRecoveryResult = results.some((r) => r.sourceType === "RECOVERY");

  const progressStatus =
    calculationResult.status === "PASSED" ? "PASSED" :
    calculationResult.status === "FAILED" ? "FAILED" :
    calculationResult.status === "RECOVERY_REQUIRED"
      ? (hasRecoveryResult ? "FAILED" : "RECOVERY_REQUIRED")
      : calculationResult.status === "INCOMPLETE" ? "INCOMPLETE" :
    calculationResult.status === "BLOCKED" ? "BLOCKED" :
    "IN_PROGRESS";

  // Stable completedAt: load the prior row (in the same tx) and preserve the
  // original completion date across recalculations. Re-running the cascade on an
  // already-PASSED/FAILED subject must not move the date forward.
  const existingProgress = await db.studentSubjectProgress.findFirst({
    where: { enrollmentId, levelSubjectId, organizationId },
    select: {
      status: true,
      finalGrade: true,
      attendancePercentage: true,
      completedAt: true,
      progressReason: true,
    },
  });

  const completedAt = resolveStableCompletedAt({
    previousStatus: existingProgress?.status ?? null,
    previousCompletedAt: existingProgress?.completedAt ?? null,
    nextStatus: progressStatus,
    terminalStatuses: SUBJECT_TERMINAL_STATUSES,
    completionStatuses: SUBJECT_COMPLETION_STATUSES,
    now: new Date(),
  });

  const progress = await upsertStudentSubjectProgress({
    organizationId,
    studentId,
    enrollmentId,
    levelSubjectId,
    finalGrade: calculationResult.finalGrade,
    // Persist the SAME value used for the decision: the real percentage when the
    // gate is enabled, else null (safe default — no accidental INCOMPLETE and no
    // stale informational value lingering when enforcement is off).
    attendancePercentage: attendanceForCalc,
    status: progressStatus,
    progressReason: calculationResult.reason,
    completedAt,
  }, db);

  // ── Transition detection (Sprint C) ─────────────────────────────────────────
  // Events + the generic `updated` audit must represent REAL transitions. Compare
  // the freshly-persisted row against the prior snapshot so an idempotent recalc
  // (identical status/grade/attendance/completion/reason) stays completely silent.
  const previousSnapshot: SubjectProgressSnapshot = {
    status: existingProgress?.status ?? null,
    finalGrade: existingProgress?.finalGrade != null ? Number(existingProgress.finalGrade) : null,
    attendancePercentage:
      existingProgress?.attendancePercentage != null ? Number(existingProgress.attendancePercentage) : null,
    completedAt: existingProgress?.completedAt ?? null,
    progressReason: existingProgress?.progressReason ?? null,
  };
  const transition = detectSubjectProgressTransition(previousSnapshot, {
    status: progress.status,
    finalGrade: progress.finalGrade,
    attendancePercentage: progress.attendancePercentage,
    completedAt: progress.completedAt,
    progressReason: progress.progressReason,
  });

  // `student_subject_progress.updated` (or the caller's custom action) is written
  // ONLY when a meaningful field changed — never on a no-op recalculation.
  if (transition.hasMeaningfulChange) {
    await auditService.log(context, {
      entity: "StudentSubjectProgress",
      entityId: progress.id,
      action: params.auditAction ?? "student_subject_progress.updated",
      oldValues: {
        status: transition.previousStatus,
        finalGrade: previousSnapshot.finalGrade,
        attendancePercentage: previousSnapshot.attendancePercentage,
      },
      newValues: {
        studentId,
        levelSubjectId,
        finalGrade: progress.finalGrade,
        status: progress.status,
        attendancePercentage: progress.attendancePercentage,
        progressReason: progress.progressReason,
      },
    }, db);
  }

  // Recovery-lifecycle audit: emit a precise action on the recovery transitions so
  // every recovery decision is traceable (required / recovered / failed-after-recovery).
  const prevStatus = existingProgress?.status ?? null;
  const recoveryAction =
    progressStatus === "RECOVERY_REQUIRED" && prevStatus !== "RECOVERY_REQUIRED"
      ? "student_subject_progress.recovery_required"
      : prevStatus === "RECOVERY_REQUIRED" && progressStatus === "PASSED"
        ? "student_subject_progress.recovered"
        : prevStatus === "RECOVERY_REQUIRED" && progressStatus === "FAILED"
          ? "student_subject_progress.failed_after_recovery"
          : null;
  if (recoveryAction) {
    await auditService.log(context, {
      entity: "StudentSubjectProgress",
      entityId: progress.id,
      action: recoveryAction,
      oldValues: { status: prevStatus },
      newValues: { studentId, levelSubjectId, finalGrade: progress.finalGrade, status: progress.status },
    }, db);
  }

  // Cascade: subject progress -> level progress -> course progress (same tx + collector)
  if (levelSubject?.courseLevelId) {
    await recalculateStudentLevelProgress(enrollmentId, levelSubject.courseLevelId, organizationId, ctx);
  }

  // Terminal-status events fire ONLY on entry into that status (transition), so a
  // subject that stays PASSED/FAILED across recalculations emits nothing — no
  // duplicate Timeline entries, Notifications, or Transcript history. An
  // INCOMPLETE/RECOVERY_REQUIRED → PASSED recovery re-enters PASSED and correctly
  // emits STUDENT_SUBJECT_PASSED (existing architecture; no separate RECOVERED
  // event — the attendance wiring emits its own recovered_from_incomplete signal).
  if (transition.enteredPassed) {
    await emitOrCollect(ctx, {
      organizationId,
      eventType: DomainEventType.STUDENT_SUBJECT_PASSED,
      aggregateType: DomainAggregateType.STUDENT,
      aggregateId: studentId,
      actorId: context.userId,
      payload: { studentId, enrollmentId, levelSubjectId, finalGrade: progress.finalGrade, progressId: progress.id },
    });
  } else if (transition.enteredFailed) {
    await emitOrCollect(ctx, {
      organizationId,
      eventType: DomainEventType.STUDENT_SUBJECT_FAILED,
      aggregateType: DomainAggregateType.STUDENT,
      aggregateId: studentId,
      actorId: context.userId,
      payload: { studentId, enrollmentId, levelSubjectId, finalGrade: progress.finalGrade, progressId: progress.id },
    });
  }

  // Observability: one structured line per recalc — makes duplicate-event triage
  // trivial (grep for transition=false with eventEmitted=true would be a bug).
  console.info(
    "[subject-progress-cascade]",
    JSON.stringify({
      enrollmentId,
      levelSubjectId,
      previousStatus: transition.previousStatus,
      newStatus: transition.newStatus,
      transition: transition.hasStatusChanged,
      eventEmitted: transition.enteredPassed || transition.enteredFailed,
      auditWritten: transition.hasMeaningfulChange,
    })
  );

  return progress;
}
